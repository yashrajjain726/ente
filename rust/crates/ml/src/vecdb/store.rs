use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{
    Arc, LazyLock, Mutex, MutexGuard, PoisonError, RwLock, RwLockReadGuard, RwLockWriteGuard, Weak,
};
use std::time::{Duration, Instant};

use super::arena::{UpsertOutcome, VECTORS_PER_CHUNK, VectorArena};
use super::graph::{Graph, search as graph_search, search_excluding};
use super::lock::{WriterLock, lock_path};
use super::log::{
    HEADER_LEN, Log, LogEntry, LogRecord, remove_if_present, remove_stale_temp_sibling,
    sync_parent_dir,
};
use super::snapshot::{load_snapshot, remove_snapshot, snapshot_path, write_snapshot};
use super::{AttrValue, Attribute, KeyMatches, Match, SearchParams, VecDbError};

const SNAPSHOT_HARD_CAP: usize = 5000;
const SNAPSHOT_QUIET_THRESHOLD: usize = 1000;
const SNAPSHOT_QUIET_GAP: Duration = Duration::from_secs(10);
const COMPACTION_MIN_DEAD_RECORDS: u64 = 64;
const COMPACTION_DEAD_RATIO: u64 = 10;
const COMPACTION_BATCH_SIZE: usize = 1000;
const KEY_TABLE_COPIES: usize = 2;
const KEY_ENTRY_OVERHEAD_BYTES: usize = 48;
const GRAPH_NODE_OVERHEAD_BYTES: usize = 48;
const NEIGHBOR_LIST_OVERHEAD_BYTES: usize = 24;

static REGISTRY: LazyLock<Mutex<HashMap<PathBuf, Arc<Mutex<PathSlot>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

struct PathSlot {
    live: Weak<Shared>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stats {
    pub live_count: usize,
    pub dead_count: usize,
    pub dims: usize,
    pub log_bytes: u64,
    pub records_since_snapshot: usize,
    pub approximate_memory_bytes: usize,
}

pub struct VecDb {
    shared: Arc<Shared>,
    read_only: bool,
}

struct Shared {
    path: PathBuf,
    dims: usize,
    registry_key: Option<PathBuf>,
    closed: AtomicBool,
    writer: Mutex<WriterHalf>,
    state: RwLock<SearchState>,
}

struct SearchState {
    arena: VectorArena,
    graph: Graph,
    attrs: AttrTable,
    total_records: u64,
}

#[derive(Default)]
struct AttrTable(Option<Vec<Option<Box<[Attribute]>>>>);

impl AttrTable {
    fn set(&mut self, slot: u32, attrs: &[Attribute]) {
        if attrs.is_empty() {
            self.clear(slot);
            return;
        }
        let table = self.0.get_or_insert_with(Vec::new);
        let index = slot as usize;
        if table.len() <= index {
            table.resize_with(index + 1, || None);
        }
        table[index] = Some(attrs.to_vec().into_boxed_slice());
    }

    fn clear(&mut self, slot: u32) {
        if let Some(table) = &mut self.0
            && let Some(entry) = table.get_mut(slot as usize)
        {
            *entry = None;
        }
    }

    fn get(&self, slot: u32) -> Option<&[Attribute]> {
        self.0.as_ref()?.get(slot as usize)?.as_deref()
    }

    fn reset(&mut self) {
        self.0 = None;
    }

    fn memory_bytes(&self) -> usize {
        let Some(table) = &self.0 else {
            return 0;
        };
        let mut bytes = table.capacity() * size_of::<Option<Box<[Attribute]>>>();
        for entry in table.iter().flatten() {
            bytes += entry.len() * size_of::<Attribute>();
            for attr in entry.iter() {
                bytes += attr.name.len();
                if let AttrValue::Str(value) = &attr.value {
                    bytes += value.len();
                }
            }
        }
        bytes
    }
}

fn slot_of_outcome(outcome: UpsertOutcome) -> u32 {
    match outcome {
        UpsertOutcome::NewSlot(slot)
        | UpsertOutcome::RecycledSlot(slot)
        | UpsertOutcome::ReplacedInPlace(slot) => slot,
    }
}

struct WriterHalf {
    compaction_retry_at_dead: u64,
    mode: WriterMode,
}

enum WriterMode {
    Active(WriterState),
    ReadOnly { log_bytes: u64 },
}

struct WriterState {
    lock: WriterLock,
    log: Log,
    mutations_since_snapshot: usize,
    last_write: Option<Instant>,
}

impl Shared {
    fn writer_half(&self) -> MutexGuard<'_, WriterHalf> {
        self.writer.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn state_read(&self) -> RwLockReadGuard<'_, SearchState> {
        self.state.read().unwrap_or_else(PoisonError::into_inner)
    }

    fn state_write(&self) -> RwLockWriteGuard<'_, SearchState> {
        self.state.write().unwrap_or_else(PoisonError::into_inner)
    }

    fn ensure_open(&self) -> Result<(), VecDbError> {
        if self.closed.load(Ordering::Acquire) {
            Err(VecDbError::Closed)
        } else {
            Ok(())
        }
    }
}

impl Drop for Shared {
    fn drop(&mut self) {
        let Some(key) = &self.registry_key else {
            return;
        };
        let mut registry = registry();
        let Some(slot) = registry.get(key).map(Arc::clone) else {
            return;
        };
        let mut guard = lock_slot(&slot);
        if std::ptr::eq(guard.live.as_ptr(), self) {
            guard.live = Weak::new();
        }
        let removable = guard.live.strong_count() == 0 && Arc::strong_count(&slot) == 2;
        drop(guard);
        if removable {
            registry.remove(key);
        }
    }
}

fn registry() -> MutexGuard<'static, HashMap<PathBuf, Arc<Mutex<PathSlot>>>> {
    REGISTRY.lock().unwrap_or_else(PoisonError::into_inner)
}

fn lock_slot(slot: &Mutex<PathSlot>) -> MutexGuard<'_, PathSlot> {
    slot.lock().unwrap_or_else(PoisonError::into_inner)
}

fn path_slot(key: &Path) -> Arc<Mutex<PathSlot>> {
    let mut registry = registry();
    match registry.get(key) {
        Some(slot) => Arc::clone(slot),
        None => {
            let slot = Arc::new(Mutex::new(PathSlot { live: Weak::new() }));
            registry.insert(key.to_path_buf(), Arc::clone(&slot));
            slot
        }
    }
}

fn existing_path_slot(key: &Path) -> Option<Arc<Mutex<PathSlot>>> {
    registry().get(key).map(Arc::clone)
}

fn remove_path_slot_if_unused(key: &Path) {
    let mut registry = registry();
    let Some(slot) = registry.get(key).map(Arc::clone) else {
        return;
    };
    let removable = lock_slot(&slot).live.strong_count() == 0 && Arc::strong_count(&slot) == 2;
    if removable {
        registry.remove(key);
    }
}

fn registry_key_for(path: &Path) -> Result<PathBuf, VecDbError> {
    let file_name = path.file_name().ok_or_else(|| {
        VecDbError::io(
            path,
            std::io::Error::new(ErrorKind::InvalidInput, "path has no file name"),
        )
    })?;
    let parent = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    let canonical_parent =
        std::fs::canonicalize(parent).map_err(|source| VecDbError::io(path, source))?;
    Ok(canonical_parent.join(file_name))
}

fn join_live(shared: Arc<Shared>, dims: usize, read_only: bool) -> Result<VecDb, VecDbError> {
    if shared.dims != dims {
        return Err(VecDbError::DimensionMismatch {
            expected: dims,
            actual: shared.dims,
        });
    }
    Ok(VecDb { shared, read_only })
}

impl VecDb {
    pub fn open(path: &Path, dims: usize) -> Result<Self, VecDbError> {
        let key = registry_key_for(path)?;
        let slot = path_slot(&key);
        let mut guard = lock_slot(&slot);
        if let Some(shared) = guard.live.upgrade() {
            drop(guard);
            return join_live(shared, dims, false);
        }
        let shared = match build_writer(path, key.clone(), dims) {
            Ok(built) => Arc::new(built),
            Err(error) => {
                drop(guard);
                drop(slot);
                remove_path_slot_if_unused(&key);
                return Err(error);
            }
        };
        guard.live = Arc::downgrade(&shared);
        drop(guard);
        Ok(Self {
            shared,
            read_only: false,
        })
    }

    pub fn open_read_only(path: &Path, dims: usize) -> Result<Self, VecDbError> {
        if let Ok(key) = registry_key_for(path)
            && let Some(slot) = existing_path_slot(&key)
        {
            let live = lock_slot(&slot).live.upgrade();
            if let Some(shared) = live {
                return join_live(shared, dims, true);
            }
        }
        Ok(Self {
            shared: Arc::new(build_read_only(path, dims)?),
            read_only: true,
        })
    }

    pub fn add(&self, key: &str, vector: &[f32]) -> Result<(), VecDbError> {
        self.add_with_attrs(key, vector, &[])
    }

    pub fn add_with_attrs(
        &self,
        key: &str,
        vector: &[f32],
        attrs: &[Attribute],
    ) -> Result<(), VecDbError> {
        let now = Instant::now();
        let mut half = self.writable_half()?;
        let state = active_state(&mut half)?;
        ensure_finite(key, vector)?;
        state.log.append(&[LogEntry::Add { key, vector, attrs }])?;
        apply_add(&self.shared, key, vector, attrs)?;
        apply_policy(&self.shared, &mut half, 1, now)
    }

    pub fn bulk_add(&self, keys: &[String], vectors: &[Vec<f32>]) -> Result<(), VecDbError> {
        self.bulk_add_internal(keys, vectors, None)
    }

    pub fn bulk_add_with_attrs(
        &self,
        keys: &[String],
        vectors: &[Vec<f32>],
        attrs: &[Option<Vec<Attribute>>],
    ) -> Result<(), VecDbError> {
        if attrs.len() != keys.len() {
            return Err(VecDbError::LengthMismatch {
                keys: keys.len(),
                vectors: attrs.len(),
            });
        }
        self.bulk_add_internal(keys, vectors, Some(attrs))
    }

    fn bulk_add_internal(
        &self,
        keys: &[String],
        vectors: &[Vec<f32>],
        attrs: Option<&[Option<Vec<Attribute>>]>,
    ) -> Result<(), VecDbError> {
        if keys.len() != vectors.len() {
            return Err(VecDbError::LengthMismatch {
                keys: keys.len(),
                vectors: vectors.len(),
            });
        }
        let attrs_of = |index: usize| -> &[Attribute] {
            attrs
                .and_then(|entries| entries[index].as_deref())
                .unwrap_or(&[])
        };
        let now = Instant::now();
        let mut half = self.writable_half()?;
        let state = active_state(&mut half)?;
        if keys.is_empty() {
            return Ok(());
        }
        for (key, vector) in keys.iter().zip(vectors) {
            ensure_finite(key, vector)?;
        }
        let records: Vec<LogEntry<'_>> = keys
            .iter()
            .zip(vectors)
            .enumerate()
            .map(|(index, (key, vector))| LogEntry::Add {
                key,
                vector,
                attrs: attrs_of(index),
            })
            .collect();
        state.log.append(&records)?;
        for (index, (key, vector)) in keys.iter().zip(vectors).enumerate() {
            apply_add(&self.shared, key, vector, attrs_of(index))?;
        }
        apply_policy(&self.shared, &mut half, keys.len(), now)
    }

    pub fn remove(&self, key: &str) -> Result<bool, VecDbError> {
        let now = Instant::now();
        let mut half = self.writable_half()?;
        let state = active_state(&mut half)?;
        if self.shared.state_read().arena.slot_of_key(key).is_none() {
            return Ok(false);
        }
        state.log.append(&[LogEntry::Tombstone { key }])?;
        apply_remove(&self.shared, key);
        apply_policy(&self.shared, &mut half, 1, now)?;
        Ok(true)
    }

    pub fn bulk_remove(&self, keys: &[String]) -> Result<usize, VecDbError> {
        let now = Instant::now();
        let mut half = self.writable_half()?;
        let state = active_state(&mut half)?;
        let scheduled: Vec<&str> = {
            let st = self.shared.state_read();
            let mut scheduled: Vec<&str> = Vec::new();
            let mut seen: HashSet<&str> = HashSet::new();
            for key in keys {
                if st.arena.slot_of_key(key).is_some() && seen.insert(key.as_str()) {
                    scheduled.push(key);
                }
            }
            scheduled
        };
        if scheduled.is_empty() {
            return Ok(0);
        }
        let records: Vec<LogEntry<'_>> = scheduled
            .iter()
            .map(|key| LogEntry::Tombstone { key })
            .collect();
        state.log.append(&records)?;
        for key in &scheduled {
            apply_remove(&self.shared, key);
        }
        let count = scheduled.len();
        apply_policy(&self.shared, &mut half, count, now)?;
        Ok(count)
    }

    pub fn contains(&self, key: &str) -> bool {
        self.shared.state_read().arena.slot_of_key(key).is_some()
    }

    pub fn get(&self, key: &str) -> Option<Vec<f32>> {
        let st = self.shared.state_read();
        let slot = st.arena.slot_of_key(key)?;
        Some(st.arena.vector_values(slot))
    }

    pub fn get_attrs(&self, key: &str) -> Option<Vec<Attribute>> {
        let st = self.shared.state_read();
        let slot = st.arena.slot_of_key(key)?;
        st.attrs.get(slot).map(<[Attribute]>::to_vec)
    }

    pub fn bulk_get_attrs(&self, keys: &[String]) -> Vec<Option<Vec<Attribute>>> {
        let st = self.shared.state_read();
        keys.iter()
            .map(|key| {
                let slot = st.arena.slot_of_key(key)?;
                st.attrs.get(slot).map(<[Attribute]>::to_vec)
            })
            .collect()
    }

    pub fn search(&self, query: &[f32], params: &SearchParams) -> Result<Vec<Match>, VecDbError> {
        self.shared.ensure_open()?;
        if degenerate_distance_cut(params)? {
            return Ok(Vec::new());
        }
        let st = self.shared.state_read();
        let allowed_slots = resolve_allowed_slots(&st, params.allowed_keys.as_deref());
        search_in_state(&st, query, params, allowed_slots.as_ref())
    }

    pub fn bulk_search(
        &self,
        queries: &[Vec<f32>],
        params: &SearchParams,
    ) -> Result<Vec<Vec<Match>>, VecDbError> {
        self.shared.ensure_open()?;
        if degenerate_distance_cut(params)? {
            return Ok(queries.iter().map(|_| Vec::new()).collect());
        }
        let st = self.shared.state_read();
        let allowed_slots = resolve_allowed_slots(&st, params.allowed_keys.as_deref());
        queries
            .iter()
            .map(|query| search_in_state(&st, query, params, allowed_slots.as_ref()))
            .collect()
    }

    pub fn bulk_search_stored(
        &self,
        keys: &[String],
        count: usize,
        max_distance: Option<f32>,
        exact: bool,
        restrict_to_input: bool,
    ) -> Result<Vec<KeyMatches>, VecDbError> {
        self.shared.ensure_open()?;
        let st = self.shared.state_read();
        let resolved: Vec<(&String, u32)> = keys
            .iter()
            .filter_map(|key| st.arena.slot_of_key(key).map(|slot| (key, slot)))
            .collect();
        let degenerate =
            max_distance.is_some_and(|distance| !distance.is_finite() || distance < 0.0);
        let allowed_slots: Option<HashSet<u32>> =
            restrict_to_input.then(|| resolved.iter().map(|(_, slot)| *slot).collect());
        let params = SearchParams {
            limit: Some(count),
            max_distance: None,
            exact,
            allowed_keys: None,
        };
        let mut results = Vec::with_capacity(resolved.len());
        for (key, slot) in resolved {
            if degenerate {
                results.push(KeyMatches {
                    key: key.clone(),
                    matches: Vec::new(),
                });
                continue;
            }
            let mut matches = search_excluding(
                &st.graph,
                &st.arena,
                st.arena.vector_lanes(slot),
                &params,
                allowed_slots.as_ref(),
                Some(slot),
            );
            if let Some(cap) = max_distance {
                let keep = matches.partition_point(|entry| entry.distance <= cap);
                matches.truncate(keep);
            }
            results.push(KeyMatches {
                key: key.clone(),
                matches,
            });
        }
        Ok(results)
    }

    pub fn flush(&self) -> Result<(), VecDbError> {
        let mut half = self.writable_half()?;
        let state = active_state(&mut half)?;
        if state.mutations_since_snapshot == 0 {
            return Ok(());
        }
        write_snapshot_now(&self.shared, &mut half)
    }

    pub fn reset(&self) -> Result<(), VecDbError> {
        let mut half = self.writable_half()?;
        let WriterState { lock, log, .. } = take_writer_state(&mut half)?;
        let old_generation = log.generation();
        drop(log);
        let dims = self.shared.dims;
        let recreated = remove_data_files(&self.shared.path)
            .and_then(|()| Log::create(&self.shared.path, dims));
        let log = match recreated {
            Ok(log) => log,
            Err(error) => {
                recover_after_failed_reset(&self.shared, &mut half, lock, old_generation);
                return Err(error);
            }
        };
        let arena = VectorArena::new(dims)?;
        {
            let mut st = self.shared.state_write();
            st.arena = arena;
            st.graph = Graph::new();
            st.attrs.reset();
            st.total_records = 0;
        }
        half.compaction_retry_at_dead = 0;
        half.mode = WriterMode::Active(WriterState {
            lock,
            log,
            mutations_since_snapshot: 0,
            last_write: None,
        });
        Ok(())
    }

    pub fn delete(self) -> Result<(), VecDbError> {
        self.shared.ensure_open()?;
        if self.read_only {
            return Err(VecDbError::ReadOnly);
        }
        close_live_instance(&self.shared)
    }

    pub fn purge(path: &Path) -> Result<(), VecDbError> {
        if let Ok(key) = registry_key_for(path)
            && let Some(slot) = existing_path_slot(&key)
        {
            let live = lock_slot(&slot).live.upgrade();
            if let Some(shared) = live {
                return close_live_instance(&shared);
            }
        }
        remove_index_files(path)
    }

    pub fn stats(&self) -> Result<Stats, VecDbError> {
        self.shared.ensure_open()?;
        let (log_bytes, records_since_snapshot) = {
            let half = self.shared.writer_half();
            self.shared.ensure_open()?;
            match &half.mode {
                WriterMode::Active(state) => (
                    state.log.current_end_offset(),
                    state.mutations_since_snapshot,
                ),
                WriterMode::ReadOnly { log_bytes } => (*log_bytes, 0),
            }
        };
        let st = self.shared.state_read();
        let live_count = st.arena.live_count();
        Ok(Stats {
            live_count,
            dead_count: st.total_records.saturating_sub(live_count as u64) as usize,
            dims: st.arena.dims(),
            log_bytes,
            records_since_snapshot,
            approximate_memory_bytes: approximate_memory_bytes(&st),
        })
    }

    pub fn len(&self) -> usize {
        self.shared.state_read().arena.live_count()
    }

    pub fn is_empty(&self) -> bool {
        self.shared.state_read().arena.is_empty()
    }

    fn writable_half(&self) -> Result<MutexGuard<'_, WriterHalf>, VecDbError> {
        self.shared.ensure_open()?;
        if self.read_only {
            return Err(VecDbError::ReadOnly);
        }
        let half = self.shared.writer_half();
        self.shared.ensure_open()?;
        Ok(half)
    }
}

fn active_state(half: &mut WriterHalf) -> Result<&mut WriterState, VecDbError> {
    match &mut half.mode {
        WriterMode::Active(state) => Ok(state),
        WriterMode::ReadOnly { .. } => Err(VecDbError::ReadOnly),
    }
}

fn take_writer_state(half: &mut WriterHalf) -> Result<WriterState, VecDbError> {
    match std::mem::replace(&mut half.mode, WriterMode::ReadOnly { log_bytes: 0 }) {
        WriterMode::Active(state) => Ok(state),
        WriterMode::ReadOnly { log_bytes } => {
            half.mode = WriterMode::ReadOnly { log_bytes };
            Err(VecDbError::ReadOnly)
        }
    }
}

fn degenerate_distance_cut(params: &SearchParams) -> Result<bool, VecDbError> {
    if params.limit.is_none() && params.max_distance.is_none() {
        return Err(VecDbError::UnboundedSearch);
    }
    Ok(params
        .max_distance
        .is_some_and(|max_distance| !max_distance.is_finite() || max_distance < 0.0))
}

fn resolve_allowed_slots(
    state: &SearchState,
    allowed_keys: Option<&[String]>,
) -> Option<HashSet<u32>> {
    allowed_keys.map(|keys| {
        keys.iter()
            .filter_map(|key| state.arena.slot_of_key(key))
            .collect()
    })
}

fn search_in_state(
    state: &SearchState,
    query: &[f32],
    params: &SearchParams,
    allowed_slots: Option<&HashSet<u32>>,
) -> Result<Vec<Match>, VecDbError> {
    let packed = state.arena.pack_query(query)?;
    Ok(graph_search(
        &state.graph,
        &state.arena,
        &packed,
        params,
        allowed_slots,
    ))
}

fn close_live_instance(shared: &Arc<Shared>) -> Result<(), VecDbError> {
    let mut half = shared.writer_half();
    shared.ensure_open()?;
    let WriterState { lock, log, .. } = take_writer_state(&mut half)?;
    let mut st = shared.state_write();
    shared.closed.store(true, Ordering::Release);
    drop(log);
    let removed = remove_index_files(&shared.path);
    if let Ok(empty) = VectorArena::new(shared.dims) {
        st.arena = empty;
        st.graph = Graph::new();
        st.attrs.reset();
        st.total_records = 0;
    }
    if let Some(key) = &shared.registry_key
        && let Some(slot) = existing_path_slot(key)
    {
        let mut guard = lock_slot(&slot);
        if std::ptr::eq(guard.live.as_ptr(), Arc::as_ptr(shared)) {
            guard.live = Weak::new();
        }
    }
    drop(st);
    drop(lock);
    drop(half);
    removed
}

fn apply_add(
    shared: &Shared,
    key: &str,
    vector: &[f32],
    attrs: &[Attribute],
) -> Result<(), VecDbError> {
    let mut st = shared.state_write();
    let SearchState {
        arena,
        graph,
        attrs: attr_table,
        total_records,
    } = &mut *st;
    let outcome = arena.upsert(key, vector)?;
    attr_table.set(slot_of_outcome(outcome), attrs);
    apply_outcome(graph, arena, outcome);
    *total_records += 1;
    Ok(())
}

fn apply_remove(shared: &Shared, key: &str) {
    let mut st = shared.state_write();
    if let Some(slot) = st.arena.remove(key) {
        st.attrs.clear(slot);
    }
    st.total_records += 1;
}

fn apply_policy(
    shared: &Shared,
    half: &mut WriterHalf,
    count: usize,
    now: Instant,
) -> Result<(), VecDbError> {
    let (live, total) = {
        let st = shared.state_read();
        (st.arena.live_count() as u64, st.total_records)
    };
    let (quiet, mutations) = {
        let state = active_state(half)?;
        state.mutations_since_snapshot += count;
        let quiet = state
            .last_write
            .is_some_and(|previous| now.duration_since(previous) >= SNAPSHOT_QUIET_GAP);
        state.last_write = Some(now);
        (quiet, state.mutations_since_snapshot)
    };
    let dead = total.saturating_sub(live);
    if dead >= COMPACTION_MIN_DEAD_RECORDS
        && dead.saturating_mul(COMPACTION_DEAD_RATIO) >= total
        && dead >= half.compaction_retry_at_dead
    {
        match compact(shared, half) {
            Ok(()) => half.compaction_retry_at_dead = 0,
            Err(error) => {
                log::warn!("compaction of {} failed: {error}", shared.path.display());
                half.compaction_retry_at_dead = dead + COMPACTION_MIN_DEAD_RECORDS;
            }
        }
        return Ok(());
    }
    if (mutations >= SNAPSHOT_HARD_CAP || (mutations >= SNAPSHOT_QUIET_THRESHOLD && quiet))
        && let Err(error) = write_snapshot_now(shared, half)
    {
        log::warn!("snapshot of {} failed: {error}", shared.path.display());
    }
    Ok(())
}

fn write_snapshot_now(shared: &Shared, half: &mut WriterHalf) -> Result<(), VecDbError> {
    let state = active_state(half)?;
    {
        let st = shared.state_read();
        write_snapshot(
            state.log.path(),
            state.log.generation(),
            state.log.current_end_offset(),
            &st.graph,
        )?;
    }
    state.mutations_since_snapshot = 0;
    Ok(())
}

fn compact(shared: &Shared, half: &mut WriterHalf) -> Result<(), VecDbError> {
    active_state(half)?;
    let dims = shared.dims;
    let (mut temp_log, temp_path) = Log::create_temp_sibling(&shared.path, dims)?;
    let mut compacted = VectorArena::new(dims)?;
    let mut compacted_attrs = AttrTable::default();
    let staged = {
        let st = shared.state_read();
        stage_live_entries(&st, &mut compacted, &mut compacted_attrs, &mut temp_log)
    };
    if let Err(error) = staged {
        drop(temp_log);
        let _ = std::fs::remove_file(&temp_path);
        return Err(error);
    }
    let temp_file = temp_log.into_file();
    if let Err(source) = temp_file.sync_all() {
        drop(temp_file);
        let _ = std::fs::remove_file(&temp_path);
        return Err(VecDbError::io(&temp_path, source));
    }
    drop(temp_file);
    let WriterState {
        lock,
        log,
        last_write,
        ..
    } = take_writer_state(half)?;
    drop(log);
    let promoted = promote_compacted_log(&temp_path, &shared.path);
    if temp_path.exists() {
        let _ = std::fs::remove_file(&temp_path);
    } else {
        let graph = Graph::rebuild(&compacted);
        let total_records = compacted.live_count() as u64;
        let mut st = shared.state_write();
        st.arena = compacted;
        st.graph = graph;
        st.attrs = compacted_attrs;
        st.total_records = total_records;
    }
    let restored = restore_writer_mode(shared, half, lock, last_write);
    promoted?;
    restored?;
    write_snapshot_now(shared, half)
}

fn restore_writer_mode(
    shared: &Shared,
    half: &mut WriterHalf,
    lock: WriterLock,
    last_write: Option<Instant>,
) -> Result<(), VecDbError> {
    match reopen_log(&shared.path, shared.dims) {
        Ok(log) => {
            half.mode = WriterMode::Active(WriterState {
                lock,
                log,
                mutations_since_snapshot: 0,
                last_write,
            });
            Ok(())
        }
        Err(error) => {
            let log_bytes = std::fs::metadata(&shared.path)
                .map(|meta| meta.len())
                .unwrap_or(0);
            log::warn!(
                "degrading {} to read-only after failing to restore its writer: {error}",
                shared.path.display()
            );
            half.mode = WriterMode::ReadOnly { log_bytes };
            Err(error)
        }
    }
}

fn recover_after_failed_reset(
    shared: &Shared,
    half: &mut WriterHalf,
    lock: WriterLock,
    old_generation: [u8; 16],
) {
    let old_log_restored = restore_writer_mode(shared, half, lock, None).is_ok()
        && matches!(&half.mode, WriterMode::Active(state) if state.log.generation() == old_generation);
    if old_log_restored {
        return;
    }
    if let Ok(empty) = VectorArena::new(shared.dims) {
        let mut st = shared.state_write();
        st.arena = empty;
        st.graph = Graph::new();
        st.attrs.reset();
        st.total_records = 0;
        half.compaction_retry_at_dead = 0;
    }
}

fn build_writer(path: &Path, registry_key: PathBuf, dims: usize) -> Result<Shared, VecDbError> {
    let lock = WriterLock::acquire(path)?;
    let mut log = match Log::create(path, dims) {
        Ok(created) => created,
        Err(VecDbError::Io { source, .. }) if source.kind() == ErrorKind::AlreadyExists => {
            reopen_log(path, dims)?
        }
        Err(error) => return Err(error),
    };
    remove_stale_temp_sibling(path)?;
    let snapshot_present = std::fs::metadata(snapshot_path(path)).is_ok();
    let replayed = replay(&mut log, dims)?;
    if replayed.recoverable_end < log.current_end_offset() {
        log.truncate_to(replayed.recoverable_end)?;
    }
    let snapshot_stale = if replayed.used_snapshot {
        replayed.tail_records > 0
    } else {
        replayed.total_records > 0 || snapshot_present
    };
    let pending_records = if replayed.used_snapshot {
        replayed.tail_records
    } else {
        replayed.total_records
    } as usize;
    let mut mutations_since_snapshot = 0;
    if snapshot_stale
        && let Err(error) = write_snapshot(
            log.path(),
            log.generation(),
            log.current_end_offset(),
            &replayed.graph,
        )
    {
        log::warn!(
            "continuing without an open-time snapshot for {}: {error}",
            path.display()
        );
        mutations_since_snapshot = pending_records.max(1);
    }
    Ok(Shared {
        path: path.to_path_buf(),
        dims,
        registry_key: Some(registry_key),
        closed: AtomicBool::new(false),
        writer: Mutex::new(WriterHalf {
            compaction_retry_at_dead: 0,
            mode: WriterMode::Active(WriterState {
                lock,
                log,
                mutations_since_snapshot,
                last_write: None,
            }),
        }),
        state: RwLock::new(SearchState {
            arena: replayed.arena,
            graph: replayed.graph,
            attrs: replayed.attrs,
            total_records: replayed.total_records,
        }),
    })
}

fn build_read_only(path: &Path, dims: usize) -> Result<Shared, VecDbError> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            return empty_read_only(path, dims);
        }
        Err(source) => return Err(VecDbError::io(path, source)),
    };
    let file_len = file
        .metadata()
        .map_err(|source| VecDbError::io(path, source))?
        .len();
    if file_len < HEADER_LEN as u64 {
        return empty_read_only(path, dims);
    }
    let mut log = Log::open(file, path, dims)?;
    let replayed = replay(&mut log, dims)?;
    drop(log);
    Ok(read_only_shared(
        path,
        dims,
        replayed.arena,
        replayed.graph,
        replayed.attrs,
        replayed.total_records,
        replayed.recoverable_end,
    ))
}

fn empty_read_only(path: &Path, dims: usize) -> Result<Shared, VecDbError> {
    Ok(read_only_shared(
        path,
        dims,
        VectorArena::new(dims)?,
        Graph::new(),
        AttrTable::default(),
        0,
        0,
    ))
}

fn read_only_shared(
    path: &Path,
    dims: usize,
    arena: VectorArena,
    graph: Graph,
    attrs: AttrTable,
    total_records: u64,
    log_bytes: u64,
) -> Shared {
    Shared {
        path: path.to_path_buf(),
        dims,
        registry_key: None,
        closed: AtomicBool::new(false),
        writer: Mutex::new(WriterHalf {
            compaction_retry_at_dead: 0,
            mode: WriterMode::ReadOnly { log_bytes },
        }),
        state: RwLock::new(SearchState {
            arena,
            graph,
            attrs,
            total_records,
        }),
    }
}

fn approximate_memory_bytes(state: &SearchState) -> usize {
    let vector_bytes = state.arena.slot_count().div_ceil(VECTORS_PER_CHUNK)
        * VECTORS_PER_CHUNK
        * state.arena.dims()
        * size_of::<f32>();
    let key_bytes: usize = state
        .arena
        .live_slots()
        .filter_map(|slot| state.arena.key_of_slot(slot))
        .map(|key| KEY_TABLE_COPIES * (key.len() + KEY_ENTRY_OVERHEAD_BYTES))
        .sum();
    let free_list_bytes = state.arena.dead_count() * size_of::<u32>();
    let graph_bytes: usize = state
        .graph
        .slots()
        .map(|slot| {
            let level = state.graph.level_of(slot).unwrap_or(0);
            GRAPH_NODE_OVERHEAD_BYTES
                + (0..=level)
                    .map(|layer| {
                        NEIGHBOR_LIST_OVERHEAD_BYTES
                            + size_of_val(state.graph.neighbors_of(slot, layer))
                    })
                    .sum::<usize>()
        })
        .sum();
    vector_bytes + key_bytes + free_list_bytes + graph_bytes + state.attrs.memory_bytes()
}

struct ReplayedState {
    arena: VectorArena,
    graph: Graph,
    attrs: AttrTable,
    total_records: u64,
    recoverable_end: u64,
    used_snapshot: bool,
    tail_records: u64,
}

fn replay(log: &mut Log, dims: usize) -> Result<ReplayedState, VecDbError> {
    let snapshot = load_snapshot(log.path(), log.generation(), log.current_end_offset());
    let covered = snapshot
        .as_ref()
        .map_or(u64::MAX, |loaded| loaded.covered_log_offset);
    let mut arena = VectorArena::new(dims)?;
    let mut attrs = AttrTable::default();
    let mut tail_outcomes: Vec<UpsertOutcome> = Vec::new();
    let mut tail_records = 0u64;
    let mut total_records = 0u64;
    let mut covered_slot_count: Option<usize> = None;
    let recoverable_end;
    {
        let mut scanner = log.scan()?;
        while let Some((record, offset)) = scanner.next_record()? {
            total_records += 1;
            let in_tail = offset >= covered;
            if in_tail {
                covered_slot_count.get_or_insert(arena.slot_count());
                tail_records += 1;
            }
            match record {
                LogRecord::Add {
                    key,
                    vector,
                    attrs: record_attrs,
                } => {
                    let outcome = arena.upsert(&key, &vector)?;
                    attrs.set(slot_of_outcome(outcome), &record_attrs);
                    if in_tail {
                        tail_outcomes.push(outcome);
                    }
                }
                LogRecord::Tombstone { key } => {
                    if let Some(slot) = arena.remove(&key) {
                        attrs.clear(slot);
                    }
                }
            }
        }
        recoverable_end = scanner.recoverable_end();
    }
    let (graph, used_snapshot) = match snapshot {
        Some(loaded) if loaded.covered_log_offset <= recoverable_end => {
            let snapshot_slots = covered_slot_count.unwrap_or(arena.slot_count());
            match Graph::from_parts(loaded.entry_point, loaded.parts, snapshot_slots) {
                Ok(mut graph) => {
                    for outcome in tail_outcomes {
                        apply_outcome(&mut graph, &arena, outcome);
                    }
                    (graph, true)
                }
                Err(error) => {
                    log::debug!("discarding snapshot for {}: {error}", log.path().display());
                    (Graph::rebuild(&arena), false)
                }
            }
        }
        _ => (Graph::rebuild(&arena), false),
    };
    Ok(ReplayedState {
        arena,
        graph,
        attrs,
        total_records,
        recoverable_end,
        used_snapshot,
        tail_records,
    })
}

fn apply_outcome(graph: &mut Graph, arena: &VectorArena, outcome: UpsertOutcome) {
    match outcome {
        UpsertOutcome::NewSlot(slot) => graph.insert(slot, arena),
        UpsertOutcome::RecycledSlot(slot) | UpsertOutcome::ReplacedInPlace(slot) => {
            graph.reinsert(slot, arena);
        }
    }
}

fn ensure_finite(key: &str, vector: &[f32]) -> Result<(), VecDbError> {
    if let Some(index) = vector.iter().position(|value| !value.is_finite()) {
        return Err(VecDbError::InvalidVector(format!(
            "component {index} of the vector for key {key:?} is not finite"
        )));
    }
    Ok(())
}

fn reopen_log(path: &Path, dims: usize) -> Result<Log, VecDbError> {
    let file = File::options()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|source| VecDbError::io(path, source))?;
    Log::open(file, path, dims)
}

fn promote_compacted_log(temp_path: &Path, path: &Path) -> Result<(), VecDbError> {
    std::fs::rename(temp_path, path).map_err(|source| VecDbError::io(temp_path, source))?;
    sync_parent_dir(path)
}

fn remove_index_files(path: &Path) -> Result<(), VecDbError> {
    remove_data_files(path)?;
    remove_if_present(&lock_path(path))
}

fn remove_data_files(path: &Path) -> Result<(), VecDbError> {
    remove_if_present(path)?;
    remove_snapshot(path)?;
    remove_stale_temp_sibling(path)
}

fn stage_live_entries(
    source: &SearchState,
    target: &mut VectorArena,
    target_attrs: &mut AttrTable,
    log: &mut Log,
) -> Result<(), VecDbError> {
    let mut batch: Vec<(String, Vec<f32>, Vec<Attribute>)> =
        Vec::with_capacity(COMPACTION_BATCH_SIZE);
    for slot in source.arena.live_slots() {
        let Some(key) = source.arena.key_of_slot(slot) else {
            continue;
        };
        batch.push((
            key.to_string(),
            source.arena.vector_values(slot),
            source
                .attrs
                .get(slot)
                .map(<[Attribute]>::to_vec)
                .unwrap_or_default(),
        ));
        if batch.len() == COMPACTION_BATCH_SIZE {
            flush_stage_batch(&mut batch, target, target_attrs, log)?;
        }
    }
    flush_stage_batch(&mut batch, target, target_attrs, log)
}

fn flush_stage_batch(
    batch: &mut Vec<(String, Vec<f32>, Vec<Attribute>)>,
    target: &mut VectorArena,
    target_attrs: &mut AttrTable,
    log: &mut Log,
) -> Result<(), VecDbError> {
    if batch.is_empty() {
        return Ok(());
    }
    let records: Vec<LogEntry<'_>> = batch
        .iter()
        .map(|(key, vector, attrs)| LogEntry::Add { key, vector, attrs })
        .collect();
    log.append(&records)?;
    for (key, vector, attrs) in batch.drain(..) {
        let outcome = target.upsert(&key, &vector)?;
        target_attrs.set(slot_of_outcome(outcome), &attrs);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::sync::Barrier;
    use std::thread;

    use tempfile::TempDir;

    use super::super::kernel::splitmix64;
    use super::*;

    const DIMS: usize = 16;
    const ADD_RECORD_LEN: u64 = 3 + 5 + (DIMS as u64) * 4 + 1 + 4;
    const TOMBSTONE_RECORD_LEN: u64 = 3 + 5 + 4;

    fn seeded_unit_vector(seed: u64, dims: usize) -> Vec<f32> {
        let mut state = seed;
        let mut values: Vec<f32> = (0..dims)
            .map(|_| {
                let unit = (splitmix64(&mut state) >> 40) as f32 / (1u64 << 24) as f32;
                unit * 2.0 - 1.0
            })
            .collect();
        let norm = values.iter().map(|value| value * value).sum::<f32>().sqrt();
        for value in &mut values {
            *value /= norm;
        }
        values
    }

    fn basis_vector(axis: usize) -> Vec<f32> {
        let mut values = vec![0.0; DIMS];
        values[axis] = 1.0;
        values
    }

    fn negated(values: &[f32]) -> Vec<f32> {
        values.iter().map(|value| -value).collect()
    }

    fn bulk_entries(start: usize, count: usize, seed: u64) -> Vec<(String, Vec<f32>)> {
        (start..start + count)
            .map(|index| {
                (
                    format!("key-{index}"),
                    seeded_unit_vector(seed + index as u64, DIMS),
                )
            })
            .collect()
    }

    fn bulk_add(db: &VecDb, entries: &[(String, Vec<f32>)]) -> Result<(), VecDbError> {
        let (keys, vectors): (Vec<String>, Vec<Vec<f32>>) = entries.iter().cloned().unzip();
        db.bulk_add(&keys, &vectors)
    }

    fn limit_params(limit: usize) -> SearchParams {
        SearchParams {
            limit: Some(limit),
            ..SearchParams::default()
        }
    }

    fn open_writer(path: &Path) -> VecDb {
        VecDb::open(path, DIMS).unwrap()
    }

    fn generation_of(path: &Path) -> [u8; 16] {
        fs::read(path).unwrap()[12..28].try_into().unwrap()
    }

    fn temp_sibling(path: &Path) -> PathBuf {
        PathBuf::from(format!("{}.tmp", path.display()))
    }

    fn snapshot_exists(path: &Path) -> bool {
        snapshot_path(path).exists()
    }

    fn set_mutations(db: &VecDb, value: usize) {
        let mut half = db.shared.writer_half();
        match &mut half.mode {
            WriterMode::Active(state) => state.mutations_since_snapshot = value,
            WriterMode::ReadOnly { .. } => panic!("expected a writer instance"),
        }
    }

    fn mutations(db: &VecDb) -> usize {
        let half = db.shared.writer_half();
        match &half.mode {
            WriterMode::Active(state) => state.mutations_since_snapshot,
            WriterMode::ReadOnly { .. } => panic!("expected a writer instance"),
        }
    }

    fn record(db: &VecDb, count: usize, now: Instant) -> Result<(), VecDbError> {
        let mut half = db.shared.writer_half();
        apply_policy(&db.shared, &mut half, count, now)
    }

    fn take_writer(db: &VecDb) -> WriterState {
        let mut half = db.shared.writer_half();
        take_writer_state(&mut half).unwrap()
    }

    fn is_degraded(db: &VecDb) -> bool {
        matches!(db.shared.writer_half().mode, WriterMode::ReadOnly { .. })
    }

    fn assert_own_nearest(db: &VecDb, key: &str, vector: &[f32]) {
        let matches = db.search(vector, &limit_params(1)).unwrap();
        assert_eq!(matches[0].key, key);
        assert!(matches[0].distance.abs() < 1.0e-3);
    }

    fn search_shapes(allowed: Vec<String>) -> Vec<SearchParams> {
        vec![
            SearchParams {
                limit: Some(8),
                ..SearchParams::default()
            },
            SearchParams {
                limit: Some(8),
                exact: true,
                ..SearchParams::default()
            },
            SearchParams {
                max_distance: Some(1.05),
                ..SearchParams::default()
            },
            SearchParams {
                max_distance: Some(1.05),
                exact: true,
                ..SearchParams::default()
            },
            SearchParams {
                limit: Some(4),
                max_distance: Some(1.2),
                ..SearchParams::default()
            },
            SearchParams {
                limit: Some(4),
                max_distance: Some(1.2),
                exact: true,
                ..SearchParams::default()
            },
            SearchParams {
                limit: Some(6),
                allowed_keys: Some(allowed.clone()),
                ..SearchParams::default()
            },
            SearchParams {
                limit: None,
                max_distance: Some(1.5),
                exact: true,
                allowed_keys: Some(allowed),
            },
        ]
    }

    #[test]
    fn lifecycle_round_trip_preserves_search_results() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let probe = seeded_unit_vector(777, DIMS);
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 150, 100)).unwrap();
        db.add("probe", &probe).unwrap();
        assert_eq!(db.len(), 151);
        assert!(!db.is_empty());
        assert!(db.contains("probe"));
        assert!(db.contains("key-42"));
        assert!(!db.contains("key-999"));
        assert_eq!(db.get("probe").unwrap(), probe);
        assert_eq!(db.get("key-7").unwrap(), seeded_unit_vector(107, DIMS));
        assert!(db.get("missing").is_none());
        let stats = db.stats().unwrap();
        assert_eq!(stats.live_count, 151);
        assert_eq!(stats.dead_count, 0);
        assert_eq!(stats.dims, DIMS);
        assert_eq!(stats.records_since_snapshot, 151);
        assert!(stats.log_bytes > 32);
        assert!(stats.approximate_memory_bytes > 151 * DIMS * 4);
        let allowed = vec![
            "probe".to_string(),
            "key-3".to_string(),
            "key-77".to_string(),
            "absent".to_string(),
        ];
        let queries = [probe.clone(), seeded_unit_vector(555, DIMS)];
        let shapes = search_shapes(allowed);
        let mut expected = Vec::new();
        for query in &queries {
            for shape in &shapes {
                expected.push(db.search(query, shape).unwrap());
            }
        }
        assert!(expected.iter().any(|matches| !matches.is_empty()));
        assert_eq!(db.search(&probe, &limit_params(1)).unwrap()[0].key, "probe");
        db.flush().unwrap();
        assert_eq!(db.stats().unwrap().records_since_snapshot, 0);
        drop(db);
        let read_only = VecDb::open_read_only(&path, DIMS).unwrap();
        let reopened = open_writer(&path);
        let mut index = 0;
        for query in &queries {
            for shape in &search_shapes(vec![
                "probe".to_string(),
                "key-3".to_string(),
                "key-77".to_string(),
                "absent".to_string(),
            ]) {
                assert_eq!(reopened.search(query, shape).unwrap(), expected[index]);
                assert_eq!(read_only.search(query, shape).unwrap(), expected[index]);
                index += 1;
            }
        }
        assert_eq!(reopened.len(), 151);
        assert_eq!(read_only.len(), 151);
    }

    #[test]
    fn search_parameter_validation() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 5, 10)).unwrap();
        let query = seeded_unit_vector(1, DIMS);
        assert!(matches!(
            db.search(&query, &SearchParams::default()),
            Err(VecDbError::UnboundedSearch)
        ));
        for bad_distance in [f32::NAN, f32::INFINITY, -0.5] {
            let params = SearchParams {
                limit: Some(3),
                max_distance: Some(bad_distance),
                ..SearchParams::default()
            };
            assert!(db.search(&query, &params).unwrap().is_empty());
        }
        assert!(matches!(
            db.search(&seeded_unit_vector(1, 8), &limit_params(3)),
            Err(VecDbError::DimensionMismatch {
                expected: DIMS,
                actual: 8
            })
        ));
        assert!(db.search(&query, &limit_params(0)).unwrap().is_empty());
        let empty_filter = SearchParams {
            limit: Some(3),
            allowed_keys: Some(Vec::new()),
            ..SearchParams::default()
        };
        assert!(db.search(&query, &empty_filter).unwrap().is_empty());
        let missing_filter = SearchParams {
            limit: Some(3),
            allowed_keys: Some(vec!["nope".to_string(), "nada".to_string()]),
            ..SearchParams::default()
        };
        assert!(db.search(&query, &missing_filter).unwrap().is_empty());
        let empty_db = open_writer(&dir.path().join("empty"));
        assert!(
            empty_db
                .search(&query, &limit_params(3))
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn acknowledged_writes_survive_drop_without_flush() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        for index in 0..4 {
            db.add(
                &format!("solo-{index}"),
                &seeded_unit_vector(index as u64, DIMS),
            )
            .unwrap();
        }
        bulk_add(&db, &bulk_entries(0, 6, 40)).unwrap();
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 10);
        for index in 0..4u64 {
            assert_eq!(
                reopened.get(&format!("solo-{index}")).unwrap(),
                seeded_unit_vector(index, DIMS)
            );
        }
        assert_own_nearest(&reopened, "key-2", &seeded_unit_vector(42, DIMS));
        assert_own_nearest(&reopened, "solo-3", &seeded_unit_vector(3, DIMS));
    }

    #[test]
    fn log_copy_taken_mid_session_opens_with_all_acknowledged_writes() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let copy = dir.path().join("copy");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 6, 60)).unwrap();
        fs::copy(&path, &copy).unwrap();
        let copied = open_writer(&copy);
        assert_eq!(copied.len(), 6);
        for index in 0..6 {
            assert_eq!(
                copied.get(&format!("key-{index}")).unwrap(),
                seeded_unit_vector(60 + index as u64, DIMS)
            );
        }
        db.add("late", &seeded_unit_vector(999, DIMS)).unwrap();
        assert!(db.contains("late"));
        assert!(!copied.contains("late"));
    }

    #[test]
    fn torn_tail_garbage_is_truncated_and_data_survives() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 4, 20)).unwrap();
        drop(db);
        let clean_len = fs::metadata(&path).unwrap().len();
        let mut bytes = fs::read(&path).unwrap();
        bytes.extend_from_slice(&[0xFF; 41]);
        fs::write(&path, &bytes).unwrap();
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 4);
        assert_own_nearest(&reopened, "key-1", &seeded_unit_vector(21, DIMS));
        drop(reopened);
        assert_eq!(fs::metadata(&path).unwrap().len(), clean_len);
    }

    #[test]
    fn torn_tail_partial_record_is_truncated_and_data_survives() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 4, 30)).unwrap();
        db.flush().unwrap();
        drop(db);
        let clean_len = fs::metadata(&path).unwrap().len();
        let mut bytes = fs::read(&path).unwrap();
        bytes.extend_from_slice(&[1, 6, 0, b'a', b'b']);
        fs::write(&path, &bytes).unwrap();
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 4);
        assert!(reopened.contains("key-3"));
        drop(reopened);
        assert_eq!(fs::metadata(&path).unwrap().len(), clean_len);
    }

    #[test]
    fn deleted_snapshot_recovers_by_rebuild() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 8, 50)).unwrap();
        db.flush().unwrap();
        drop(db);
        fs::remove_file(snapshot_path(&path)).unwrap();
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 8);
        assert_own_nearest(&reopened, "key-5", &seeded_unit_vector(55, DIMS));
        assert!(snapshot_exists(&path));
    }

    #[test]
    fn snapshot_from_an_older_generation_is_discarded() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 3, 70)).unwrap();
        db.flush().unwrap();
        drop(db);
        let stale_snapshot = fs::read(snapshot_path(&path)).unwrap();
        fs::remove_file(&path).unwrap();
        let db = open_writer(&path);
        assert!(db.is_empty());
        db.add("fresh", &seeded_unit_vector(1, DIMS)).unwrap();
        drop(db);
        fs::write(snapshot_path(&path), &stale_snapshot).unwrap();
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 1);
        assert!(reopened.contains("fresh"));
        assert!(!reopened.contains("key-0"));
        assert_own_nearest(&reopened, "fresh", &seeded_unit_vector(1, DIMS));
    }

    #[test]
    fn snapshot_claiming_offset_beyond_log_end_is_discarded() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 5, 80)).unwrap();
        db.flush().unwrap();
        drop(db);
        let bytes = fs::read(&path).unwrap();
        fs::write(&path, &bytes[..bytes.len() - ADD_RECORD_LEN as usize]).unwrap();
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 4);
        assert!(reopened.contains("key-3"));
        assert!(!reopened.contains("key-4"));
        assert_own_nearest(&reopened, "key-0", &seeded_unit_vector(80, DIMS));
    }

    #[test]
    fn corrupted_snapshot_bytes_are_discarded() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 5, 90)).unwrap();
        db.flush().unwrap();
        drop(db);
        let mut bytes = fs::read(snapshot_path(&path)).unwrap();
        bytes[20] ^= 0x5A;
        fs::write(snapshot_path(&path), &bytes).unwrap();
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 5);
        assert_own_nearest(&reopened, "key-4", &seeded_unit_vector(94, DIMS));
    }

    #[test]
    fn stale_compaction_temp_files_are_removed_at_open() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 5, 110)).unwrap();
        db.flush().unwrap();
        drop(db);
        fs::write(temp_sibling(&path), [0xAB; 100]).unwrap();
        let db = open_writer(&path);
        assert!(!temp_sibling(&path).exists());
        assert_eq!(db.len(), 5);
        drop(db);
        fs::copy(&path, temp_sibling(&path)).unwrap();
        let db = open_writer(&path);
        assert!(!temp_sibling(&path).exists());
        assert_eq!(db.len(), 5);
        assert!(db.contains("key-2"));
    }

    #[test]
    fn second_open_joins_the_live_instance() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 3, 120)).unwrap();
        let joined = VecDb::open(&path, DIMS).unwrap();
        assert!(Arc::ptr_eq(&db.shared, &joined.shared));
        assert_eq!(joined.len(), 3);
        joined.add("joined", &seeded_unit_vector(9, DIMS)).unwrap();
        assert!(db.contains("joined"));
        assert!(matches!(
            WriterLock::acquire(&path),
            Err(VecDbError::Locked(_))
        ));
        drop(db);
        drop(joined);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 4);
        assert!(reopened.contains("joined"));
    }

    #[test]
    fn open_handles_alias_one_live_instance() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let first = open_writer(&path);
        let second = VecDb::open(&path, DIMS).unwrap();
        assert!(Arc::ptr_eq(&first.shared, &second.shared));
        let via_first = seeded_unit_vector(11, DIMS);
        let via_second = seeded_unit_vector(22, DIMS);
        first.add("via-first", &via_first).unwrap();
        assert!(second.contains("via-first"));
        assert_eq!(second.get("via-first").unwrap(), via_first);
        assert_eq!(
            second.search(&via_first, &limit_params(1)).unwrap()[0].key,
            "via-first"
        );
        second.add("via-second", &via_second).unwrap();
        assert!(first.contains("via-second"));
        assert_eq!(first.len(), 2);
        assert!(matches!(
            VecDb::open(&path, DIMS + 8),
            Err(VecDbError::DimensionMismatch {
                expected,
                actual
            }) if expected == DIMS + 8 && actual == DIMS
        ));
    }

    #[test]
    fn dotted_and_plain_paths_share_one_instance() {
        let dir = TempDir::new().unwrap();
        let subdir = dir.path().join("indexes");
        fs::create_dir(&subdir).unwrap();
        let plain = subdir.join("db");
        let dotted = subdir.join("..").join("indexes").join("db");
        let first = VecDb::open(&plain, DIMS).unwrap();
        let second = VecDb::open(&dotted, DIMS).unwrap();
        assert!(Arc::ptr_eq(&first.shared, &second.shared));
        let vector = seeded_unit_vector(5, DIMS);
        first.add("shared", &vector).unwrap();
        assert!(second.contains("shared"));
        assert_eq!(second.get("shared").unwrap(), vector);
    }

    #[test]
    fn dropping_every_handle_releases_the_instance() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let first = open_writer(&path);
        let second = VecDb::open(&path, DIMS).unwrap();
        first.add("kept", &seeded_unit_vector(3, DIMS)).unwrap();
        drop(first);
        assert!(second.contains("kept"));
        second
            .add("still-open", &seeded_unit_vector(4, DIMS))
            .unwrap();
        drop(second);
        let key = registry_key_for(&path).unwrap();
        assert!(!registry().contains_key(&key));
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 2);
        assert!(reopened.contains("kept"));
        assert!(reopened.contains("still-open"));
        let again = VecDb::open(&path, DIMS).unwrap();
        assert!(Arc::ptr_eq(&reopened.shared, &again.shared));
    }

    #[test]
    fn a_stalled_open_on_one_path_blocks_neither_other_paths_nor_forks_its_own() {
        let dir = TempDir::new().unwrap();
        let stalled_path = dir.path().join("stalled");
        let other_path = dir.path().join("other");
        let key = registry_key_for(&stalled_path).unwrap();
        let slot = path_slot(&key);
        let build_in_progress = lock_slot(&slot);
        let stalled_openers: Vec<_> = (0..2)
            .map(|_| {
                let path = stalled_path.clone();
                thread::spawn(move || VecDb::open(&path, DIMS).unwrap())
            })
            .collect();
        let other = VecDb::open(&other_path, DIMS).unwrap();
        other.add("other", &seeded_unit_vector(1, DIMS)).unwrap();
        assert_eq!(other.len(), 1);
        drop(build_in_progress);
        let handles: Vec<VecDb> = stalled_openers
            .into_iter()
            .map(|opener| opener.join().unwrap())
            .collect();
        assert!(Arc::ptr_eq(&handles[0].shared, &handles[1].shared));
        assert!(!Arc::ptr_eq(&handles[0].shared, &other.shared));
        handles[0]
            .add("stalled", &seeded_unit_vector(2, DIMS))
            .unwrap();
        assert!(handles[1].contains("stalled"));
        assert!(!other.contains("stalled"));
    }

    #[test]
    fn failed_open_leaves_no_registry_residue() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("dir-in-the-way");
        fs::create_dir(&path).unwrap();
        let key = registry_key_for(&path).unwrap();
        assert!(matches!(
            VecDb::open(&path, DIMS),
            Err(VecDbError::Io { .. })
        ));
        assert!(!registry().contains_key(&key));
    }

    #[test]
    fn writer_stays_locked_across_a_completed_compaction() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 120, 340)).unwrap();
        let generation_before = generation_of(&path);
        let removals: Vec<String> = (0..64).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 64);
        assert_ne!(generation_of(&path), generation_before);
        assert_eq!(db.stats().unwrap().dead_count, 0);
        assert!(matches!(
            WriterLock::acquire(&path),
            Err(VecDbError::Locked(_))
        ));
        db.add("post", &seeded_unit_vector(7, DIMS)).unwrap();
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 57);
        assert!(reopened.contains("post"));
        assert!(!reopened.contains("key-0"));
    }

    #[test]
    fn stale_lock_file_with_garbage_bytes_is_reused_at_open() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        fs::write(lock_path(&path), [0xAB; 24]).unwrap();
        let db = open_writer(&path);
        db.add("fresh", &seeded_unit_vector(3, DIMS)).unwrap();
        assert!(matches!(
            WriterLock::acquire(&path),
            Err(VecDbError::Locked(_))
        ));
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 1);
        assert!(reopened.contains("fresh"));
    }

    #[test]
    fn read_only_open_aliases_a_live_writer() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 3, 130)).unwrap();
        let read_only = VecDb::open_read_only(&path, DIMS).unwrap();
        assert!(Arc::ptr_eq(&db.shared, &read_only.shared));
        assert_eq!(read_only.len(), 3);
        assert!(read_only.contains("key-1"));
        let later = seeded_unit_vector(9, DIMS);
        db.add("later", &later).unwrap();
        assert!(read_only.contains("later"));
        assert_eq!(read_only.get("later").unwrap(), later);
        assert_own_nearest(&read_only, "later", &later);
        assert!(matches!(
            read_only.add("x", &later),
            Err(VecDbError::ReadOnly)
        ));
        assert!(matches!(
            read_only.remove("later"),
            Err(VecDbError::ReadOnly)
        ));
        assert!(matches!(
            read_only.bulk_remove(&["later".to_string()]),
            Err(VecDbError::ReadOnly)
        ));
        assert!(matches!(read_only.flush(), Err(VecDbError::ReadOnly)));
        assert!(matches!(read_only.reset(), Err(VecDbError::ReadOnly)));
        let another = VecDb::open_read_only(&path, DIMS).unwrap();
        assert!(matches!(another.delete(), Err(VecDbError::ReadOnly)));
        assert!(db.contains("later"));
        assert!(path.exists());
    }

    #[test]
    fn read_only_open_of_missing_file_is_empty() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("absent");
        let db = VecDb::open_read_only(&path, DIMS).unwrap();
        assert_eq!(db.len(), 0);
        assert!(db.is_empty());
        assert!(!db.contains("anything"));
        assert!(db.get("anything").is_none());
        assert!(
            db.search(&seeded_unit_vector(1, DIMS), &limit_params(3))
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            db.stats().unwrap(),
            Stats {
                live_count: 0,
                dead_count: 0,
                dims: DIMS,
                log_bytes: 0,
                records_since_snapshot: 0,
                approximate_memory_bytes: 0,
            }
        );
        assert!(!path.exists());
        assert!(!snapshot_exists(&path));
        assert!(!lock_path(&path).exists());
    }

    #[test]
    fn read_only_instance_rejects_writes() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        db.add("kept", &seeded_unit_vector(3, DIMS)).unwrap();
        drop(db);
        let read_only = VecDb::open_read_only(&path, DIMS).unwrap();
        let vector = seeded_unit_vector(4, DIMS);
        assert!(matches!(
            read_only.add("x", &vector),
            Err(VecDbError::ReadOnly)
        ));
        assert!(matches!(
            bulk_add(&read_only, &bulk_entries(0, 2, 5)),
            Err(VecDbError::ReadOnly)
        ));
        assert!(matches!(
            bulk_add(&read_only, &[]),
            Err(VecDbError::ReadOnly)
        ));
        assert!(matches!(
            read_only.remove("kept"),
            Err(VecDbError::ReadOnly)
        ));
        assert!(matches!(
            read_only.bulk_remove(&["kept".to_string()]),
            Err(VecDbError::ReadOnly)
        ));
        assert!(matches!(read_only.flush(), Err(VecDbError::ReadOnly)));
        assert!(matches!(read_only.reset(), Err(VecDbError::ReadOnly)));
        assert!(read_only.contains("kept"));
        assert!(matches!(read_only.delete(), Err(VecDbError::ReadOnly)));
        assert!(path.exists());
    }

    #[test]
    fn standalone_read_only_stays_point_in_time() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 100, 140)).unwrap();
        drop(db);
        let snapshot_view = VecDb::open_read_only(&path, DIMS).unwrap();
        assert_eq!(snapshot_view.len(), 100);
        let db = open_writer(&path);
        assert!(!Arc::ptr_eq(&snapshot_view.shared, &db.shared));
        let generation_before = generation_of(&path);
        for index in 0..32 {
            assert!(db.remove(&format!("key-{index}")).unwrap());
        }
        assert_ne!(generation_of(&path), generation_before);
        assert_eq!(db.len(), 68);
        assert_eq!(db.stats().unwrap().dead_count, 0);
        db.add("fresh", &seeded_unit_vector(7, DIMS)).unwrap();
        assert_own_nearest(&db, "key-50", &seeded_unit_vector(190, DIMS));
        assert_eq!(snapshot_view.len(), 100);
        assert!(snapshot_view.contains("key-5"));
        assert!(!snapshot_view.contains("fresh"));
        assert_own_nearest(&snapshot_view, "key-5", &seeded_unit_vector(145, DIMS));
        let live_view = VecDb::open_read_only(&path, DIMS).unwrap();
        assert!(Arc::ptr_eq(&live_view.shared, &db.shared));
        assert!(live_view.contains("fresh"));
        drop(db);
        let fresh_view = VecDb::open_read_only(&path, DIMS).unwrap();
        assert_eq!(fresh_view.len(), 69);
        assert!(!fresh_view.contains("key-5"));
        assert!(fresh_view.contains("fresh"));
    }

    #[test]
    fn upsert_changes_search_position_across_reopen() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        db.add("near", &basis_vector(0)).unwrap();
        for axis in 1..11 {
            db.add(&format!("other-{axis}"), &basis_vector(axis))
                .unwrap();
        }
        let query = basis_vector(0);
        assert_own_nearest(&db, "near", &query);
        db.add("near", &negated(&basis_vector(0))).unwrap();
        assert_eq!(db.len(), 11);
        assert_eq!(db.get("near").unwrap(), negated(&basis_vector(0)));
        let checks = |db: &VecDb| {
            assert_ne!(db.search(&query, &limit_params(1)).unwrap()[0].key, "near");
            let exact = SearchParams {
                limit: Some(1),
                exact: true,
                ..SearchParams::default()
            };
            assert_ne!(db.search(&query, &exact).unwrap()[0].key, "near");
            let threshold = SearchParams {
                max_distance: Some(1.5),
                ..SearchParams::default()
            };
            let within = db.search(&query, &threshold).unwrap();
            assert_eq!(within.len(), 10);
            assert!(within.iter().all(|found| found.key != "near"));
        };
        checks(&db);
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.get("near").unwrap(), negated(&basis_vector(0)));
        checks(&reopened);
    }

    #[test]
    fn removed_keys_are_hidden_everywhere_and_can_be_readded() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        for axis in 0..10 {
            db.add(&format!("key-{axis}"), &basis_vector(axis)).unwrap();
        }
        let query = basis_vector(4);
        assert_own_nearest(&db, "key-4", &query);
        assert!(db.remove("key-4").unwrap());
        assert!(!db.remove("key-4").unwrap());
        assert_eq!(db.len(), 9);
        assert!(!db.contains("key-4"));
        assert!(db.get("key-4").is_none());
        assert_eq!(db.stats().unwrap().dead_count, 2);
        assert_ne!(db.search(&query, &limit_params(1)).unwrap()[0].key, "key-4");
        let exact_all = SearchParams {
            limit: Some(10),
            exact: true,
            ..SearchParams::default()
        };
        let exact = db.search(&query, &exact_all).unwrap();
        assert_eq!(exact.len(), 9);
        assert!(exact.iter().all(|found| found.key != "key-4"));
        let threshold = SearchParams {
            max_distance: Some(0.5),
            ..SearchParams::default()
        };
        assert!(db.search(&query, &threshold).unwrap().is_empty());
        let filtered = SearchParams {
            limit: Some(5),
            allowed_keys: Some(vec!["key-4".to_string()]),
            ..SearchParams::default()
        };
        assert!(db.search(&query, &filtered).unwrap().is_empty());
        db.add("key-4", &basis_vector(4)).unwrap();
        assert_eq!(db.len(), 10);
        assert_own_nearest(&db, "key-4", &query);
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 10);
        assert_own_nearest(&reopened, "key-4", &query);
    }

    #[test]
    fn bulk_remove_counts_only_present_keys_and_absent_remove_does_no_io() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 5, 150)).unwrap();
        let log_bytes = db.stats().unwrap().log_bytes;
        assert!(!db.remove("missing").unwrap());
        assert_eq!(db.stats().unwrap().log_bytes, log_bytes);
        let removals = vec![
            "key-1".to_string(),
            "key-1".to_string(),
            "key-3".to_string(),
            "nope".to_string(),
        ];
        assert_eq!(db.bulk_remove(&removals).unwrap(), 2);
        assert_eq!(db.len(), 3);
        assert!(!db.contains("key-1"));
        assert!(!db.contains("key-3"));
        assert_eq!(
            db.stats().unwrap().log_bytes,
            log_bytes + 2 * TOMBSTONE_RECORD_LEN
        );
        assert_eq!(db.bulk_remove(&[]).unwrap(), 0);
        bulk_add(&db, &[]).unwrap();
        assert_eq!(
            db.stats().unwrap().log_bytes,
            log_bytes + 2 * TOMBSTONE_RECORD_LEN
        );
    }

    #[test]
    fn quiet_gap_snapshot_needs_a_thousand_mutations() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        db.add("seed", &seeded_unit_vector(1, DIMS)).unwrap();
        set_mutations(&db, 998);
        record(&db, 1, Instant::now() + Duration::from_secs(30)).unwrap();
        assert_eq!(mutations(&db), 999);
        assert!(!snapshot_exists(&path));
        record(&db, 1, Instant::now() + Duration::from_secs(60)).unwrap();
        assert_eq!(mutations(&db), 0);
        assert!(snapshot_exists(&path));
    }

    #[test]
    fn thousand_mutations_without_quiet_gap_do_not_snapshot() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        db.add("seed", &seeded_unit_vector(1, DIMS)).unwrap();
        set_mutations(&db, 999);
        record(&db, 1, Instant::now()).unwrap();
        assert_eq!(mutations(&db), 1000);
        assert!(!snapshot_exists(&path));
    }

    #[test]
    fn hard_cap_snapshots_regardless_of_gap() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        db.add("seed", &seeded_unit_vector(1, DIMS)).unwrap();
        set_mutations(&db, 4999);
        record(&db, 1, Instant::now()).unwrap();
        assert_eq!(mutations(&db), 0);
        assert!(snapshot_exists(&path));
    }

    #[test]
    fn flush_snapshots_pending_mutations_and_resets() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 2, 160)).unwrap();
        assert!(!snapshot_exists(&path));
        assert_eq!(db.stats().unwrap().records_since_snapshot, 2);
        db.flush().unwrap();
        assert!(snapshot_exists(&path));
        assert_eq!(db.stats().unwrap().records_since_snapshot, 0);
        fs::remove_file(snapshot_path(&path)).unwrap();
        db.flush().unwrap();
        assert!(!snapshot_exists(&path));
    }

    #[test]
    fn open_after_tail_replay_writes_a_fresh_snapshot() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 3, 170)).unwrap();
        drop(db);
        assert!(!snapshot_exists(&path));
        drop(open_writer(&path));
        assert!(snapshot_exists(&path));
        let log_len = fs::metadata(&path).unwrap().len();
        let loaded = load_snapshot(&path, generation_of(&path), log_len).unwrap();
        assert_eq!(loaded.covered_log_offset, log_len);
        let snapshot_bytes = fs::read(snapshot_path(&path)).unwrap();
        drop(open_writer(&path));
        assert_eq!(fs::read(snapshot_path(&path)).unwrap(), snapshot_bytes);
    }

    #[test]
    fn compaction_rewrites_log_and_preserves_live_data() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 120, 1000)).unwrap();
        let generation_before = generation_of(&path);
        for index in 0..40u64 {
            db.add(
                &format!("key-{index}"),
                &seeded_unit_vector(5000 + index, DIMS),
            )
            .unwrap();
        }
        assert_eq!(generation_of(&path), generation_before);
        assert_eq!(db.stats().unwrap().dead_count, 40);
        let log_bytes_before = db.stats().unwrap().log_bytes;
        let removals: Vec<String> = (90..120).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 30);
        let stats = db.stats().unwrap();
        assert_eq!(stats.live_count, 90);
        assert_eq!(stats.dead_count, 0);
        assert_eq!(stats.records_since_snapshot, 0);
        assert!(stats.log_bytes < log_bytes_before);
        assert_ne!(generation_of(&path), generation_before);
        let loaded = load_snapshot(&path, generation_of(&path), stats.log_bytes).unwrap();
        assert_eq!(loaded.covered_log_offset, stats.log_bytes);
        let live_vector = |index: u64| {
            if index < 40 {
                seeded_unit_vector(5000 + index, DIMS)
            } else {
                seeded_unit_vector(1000 + index, DIMS)
            }
        };
        let verify = |db: &VecDb| {
            assert_eq!(db.len(), 90);
            for index in 90..120 {
                assert!(!db.contains(&format!("key-{index}")));
            }
            for index in 0..90u64 {
                assert_own_nearest(db, &format!("key-{index}"), &live_vector(index));
            }
        };
        verify(&db);
        let query = seeded_unit_vector(31337, DIMS);
        let approx_before = db.search(&query, &limit_params(10)).unwrap();
        drop(db);
        let reopened = open_writer(&path);
        verify(&reopened);
        assert_eq!(
            reopened.search(&query, &limit_params(10)).unwrap(),
            approx_before
        );
        drop(reopened);
        fs::remove_file(snapshot_path(&path)).unwrap();
        let replayed = open_writer(&path);
        verify(&replayed);
    }

    #[test]
    fn compaction_streams_multiple_batches() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 1100, 3000)).unwrap();
        let generation_before = generation_of(&path);
        let removals: Vec<String> = (0..58).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 58);
        assert_ne!(generation_of(&path), generation_before);
        let stats = db.stats().unwrap();
        assert_eq!(stats.live_count, 1042);
        assert_eq!(stats.dead_count, 0);
        for index in (58..1100u64).step_by(97) {
            assert_own_nearest(
                &db,
                &format!("key-{index}"),
                &seeded_unit_vector(3000 + index, DIMS),
            );
        }
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 1042);
        assert!(!reopened.contains("key-0"));
        assert!(reopened.contains("key-58"));
    }

    #[test]
    fn stale_snapshot_left_by_interrupted_compaction_is_discarded_on_open() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 120, 210)).unwrap();
        db.flush().unwrap();
        let stale_snapshot = fs::read(snapshot_path(&path)).unwrap();
        let removals: Vec<String> = (0..64).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 64);
        assert_eq!(db.stats().unwrap().dead_count, 0);
        drop(db);
        fs::write(snapshot_path(&path), &stale_snapshot).unwrap();
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 56);
        for index in 64..120u64 {
            assert_eq!(
                reopened.get(&format!("key-{index}")).unwrap(),
                seeded_unit_vector(210 + index, DIMS)
            );
        }
        assert_own_nearest(&reopened, "key-100", &seeded_unit_vector(310, DIMS));
        let stats = reopened.stats().unwrap();
        assert_eq!(stats.dead_count, 0);
        let loaded = load_snapshot(&path, generation_of(&path), stats.log_bytes).unwrap();
        assert_eq!(loaded.covered_log_offset, stats.log_bytes);
        assert_ne!(fs::read(snapshot_path(&path)).unwrap(), stale_snapshot);
    }

    #[test]
    fn writer_open_reinitializes_a_file_shorter_than_the_header() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let partial = [0x45u8, 0x56, 0x44, 0x42, 0x01, 0x00, 0x00];
        fs::write(&path, partial).unwrap();
        let db = open_writer(&path);
        assert!(db.is_empty());
        assert_eq!(db.stats().unwrap().log_bytes, 32);
        db.add("fresh", &seeded_unit_vector(11, DIMS)).unwrap();
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 1);
        assert_own_nearest(&reopened, "fresh", &seeded_unit_vector(11, DIMS));
    }

    #[test]
    fn read_only_open_of_a_short_file_is_empty_and_unaltered() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let partial = [0x45u8, 0x56, 0x44, 0x42, 0x01, 0x00, 0x00];
        fs::write(&path, partial).unwrap();
        let db = VecDb::open_read_only(&path, DIMS).unwrap();
        assert!(db.is_empty());
        assert_eq!(db.stats().unwrap().log_bytes, 0);
        assert_eq!(fs::read(&path).unwrap(), partial);
        assert!(!snapshot_exists(&path));
        assert!(!lock_path(&path).exists());
    }

    #[test]
    fn promote_compacted_log_replaces_the_log_durably() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        drop(Log::create(&path, DIMS).unwrap().into_file());
        let old_generation = generation_of(&path);
        let temp = temp_sibling(&path);
        drop(Log::create(&temp, DIMS).unwrap().into_file());
        let new_generation = generation_of(&temp);
        promote_compacted_log(&temp, &path).unwrap();
        assert!(!temp.exists());
        assert_eq!(generation_of(&path), new_generation);
        assert_ne!(generation_of(&path), old_generation);
        let log = reopen_log(&path, DIMS).unwrap();
        assert_eq!(log.generation(), new_generation);
        drop(log);
        assert!(matches!(
            promote_compacted_log(&temp, &path),
            Err(VecDbError::Io { .. })
        ));
        assert_eq!(generation_of(&path), new_generation);
    }

    #[test]
    fn restore_writer_mode_reinstalls_the_kept_lock_and_reenables_writes() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 3, 260)).unwrap();
        let WriterState { lock, log, .. } = take_writer(&db);
        drop(log);
        assert!(is_degraded(&db));
        let vector = seeded_unit_vector(4, DIMS);
        assert!(matches!(
            db.add("blocked", &vector),
            Err(VecDbError::ReadOnly)
        ));
        assert!(matches!(
            WriterLock::acquire(&path),
            Err(VecDbError::Locked(_))
        ));
        {
            let mut half = db.shared.writer_half();
            restore_writer_mode(&db.shared, &mut half, lock, None).unwrap();
        }
        db.add("after", &vector).unwrap();
        assert!(matches!(
            WriterLock::acquire(&path),
            Err(VecDbError::Locked(_))
        ));
        assert_eq!(db.len(), 4);
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 4);
        assert!(reopened.contains("after"));
    }

    #[test]
    fn restore_writer_mode_degrades_to_accurate_read_only_when_reopen_fails() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 3, 270)).unwrap();
        let WriterState { lock, log, .. } = take_writer(&db);
        drop(log);
        let mut bytes = fs::read(&path).unwrap();
        bytes[20] ^= 0x5A;
        fs::write(&path, &bytes).unwrap();
        {
            let mut half = db.shared.writer_half();
            assert!(matches!(
                restore_writer_mode(&db.shared, &mut half, lock, None),
                Err(VecDbError::Corrupt(_))
            ));
            assert!(
                matches!(half.mode, WriterMode::ReadOnly { log_bytes } if log_bytes == bytes.len() as u64)
            );
        }
        assert_eq!(db.stats().unwrap().log_bytes, bytes.len() as u64);
        let vector = seeded_unit_vector(5, DIMS);
        assert!(matches!(db.add("x", &vector), Err(VecDbError::ReadOnly)));
    }

    #[test]
    fn snapshot_failure_degrades_the_write_and_flush_still_errors() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        db.add("seed", &seeded_unit_vector(1, DIMS)).unwrap();
        fs::create_dir(snapshot_path(&path)).unwrap();
        set_mutations(&db, 4999);
        record(&db, 1, Instant::now()).unwrap();
        assert_eq!(mutations(&db), 5000);
        assert!(matches!(db.flush(), Err(VecDbError::Io { .. })));
        db.add("more", &seeded_unit_vector(2, DIMS)).unwrap();
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 2);
        assert!(reopened.contains("seed"));
        assert!(reopened.contains("more"));
    }

    #[test]
    fn failed_compaction_keeps_the_write_ok_and_backs_off() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 100, 280)).unwrap();
        let generation_before = generation_of(&path);
        fs::create_dir(temp_sibling(&path)).unwrap();
        let removals: Vec<String> = (0..64).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 64);
        assert_eq!(db.stats().unwrap().dead_count, 128);
        assert_eq!(generation_of(&path), generation_before);
        db.add("probe", &seeded_unit_vector(7, DIMS)).unwrap();
        assert!(matches!(
            WriterLock::acquire(&path),
            Err(VecDbError::Locked(_))
        ));
        fs::remove_dir(temp_sibling(&path)).unwrap();
        bulk_add(&db, &bulk_entries(64, 36, 290)).unwrap();
        assert_eq!(db.stats().unwrap().dead_count, 164);
        assert_eq!(generation_of(&path), generation_before);
        bulk_add(&db, &bulk_entries(64, 28, 295)).unwrap();
        assert_eq!(db.stats().unwrap().dead_count, 0);
        assert_ne!(generation_of(&path), generation_before);
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 37);
        assert!(reopened.contains("probe"));
        assert!(reopened.contains("key-64"));
        assert!(!reopened.contains("key-0"));
    }

    #[test]
    fn open_succeeds_and_serves_data_when_the_snapshot_cannot_be_written() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 5, 300)).unwrap();
        drop(db);
        fs::create_dir(snapshot_path(&path)).unwrap();
        let db = open_writer(&path);
        assert_eq!(db.len(), 5);
        assert_own_nearest(&db, "key-2", &seeded_unit_vector(302, DIMS));
        assert!(matches!(db.flush(), Err(VecDbError::Io { .. })));
        drop(db);
        fs::remove_dir(snapshot_path(&path)).unwrap();
        drop(open_writer(&path));
        assert!(snapshot_exists(&path));
    }

    #[test]
    fn reset_empties_the_db_and_keeps_it_usable() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 20, 180)).unwrap();
        db.flush().unwrap();
        let generation_before = generation_of(&path);
        db.reset().unwrap();
        assert!(db.is_empty());
        assert!(!snapshot_exists(&path));
        assert_ne!(generation_of(&path), generation_before);
        assert_eq!(fs::metadata(&path).unwrap().len(), 32);
        assert_eq!(
            db.stats().unwrap(),
            Stats {
                live_count: 0,
                dead_count: 0,
                dims: DIMS,
                log_bytes: 32,
                records_since_snapshot: 0,
                approximate_memory_bytes: 0,
            }
        );
        db.add("again", &seeded_unit_vector(2, DIMS)).unwrap();
        assert_own_nearest(&db, "again", &seeded_unit_vector(2, DIMS));
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 1);
        assert!(reopened.contains("again"));
        assert!(!reopened.contains("key-0"));
    }

    #[test]
    fn reset_via_one_handle_keeps_aliases_live() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let first = open_writer(&path);
        let second = VecDb::open(&path, DIMS).unwrap();
        bulk_add(&first, &bulk_entries(0, 10, 220)).unwrap();
        assert_eq!(second.len(), 10);
        second.reset().unwrap();
        assert!(first.is_empty());
        assert!(!first.contains("key-0"));
        let fresh = seeded_unit_vector(6, DIMS);
        first.add("fresh", &fresh).unwrap();
        assert!(second.contains("fresh"));
        assert_eq!(second.len(), 1);
        assert_own_nearest(&second, "fresh", &fresh);
    }

    #[test]
    fn failed_reset_with_the_log_gone_becomes_an_accurate_empty_instance() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 5, 310)).unwrap();
        fs::create_dir(snapshot_path(&path)).unwrap();
        assert!(matches!(db.reset(), Err(VecDbError::Io { .. })));
        assert!(!path.exists());
        assert!(db.is_empty());
        assert_eq!(db.len(), 0);
        assert!(!db.contains("key-0"));
        assert_eq!(db.stats().unwrap().log_bytes, 0);
        let vector = seeded_unit_vector(1, DIMS);
        assert!(matches!(db.add("x", &vector), Err(VecDbError::ReadOnly)));
        assert!(db.search(&vector, &limit_params(3)).unwrap().is_empty());
        drop(db);
        fs::remove_dir(snapshot_path(&path)).unwrap();
        let reopened = open_writer(&path);
        assert!(reopened.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn failed_reset_that_cannot_remove_the_log_keeps_the_writer_and_data() {
        use std::os::unix::fs::PermissionsExt;

        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 5, 320)).unwrap();
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o555)).unwrap();
        let outcome = db.reset();
        fs::set_permissions(dir.path(), fs::Permissions::from_mode(0o755)).unwrap();
        let Err(VecDbError::Io { .. }) = outcome else {
            return;
        };
        assert_eq!(db.len(), 5);
        assert!(db.contains("key-0"));
        db.add("after", &seeded_unit_vector(6, DIMS)).unwrap();
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 6);
        assert!(reopened.contains("key-4"));
        assert!(reopened.contains("after"));
    }

    #[test]
    fn reset_recovery_over_a_recreated_log_clears_memory_to_match_disk() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 5, 330)).unwrap();
        let old_generation = generation_of(&path);
        let WriterState { lock, log, .. } = take_writer(&db);
        drop(log);
        remove_data_files(&path).unwrap();
        drop(Log::create(&path, DIMS).unwrap().into_file());
        {
            let mut half = db.shared.writer_half();
            recover_after_failed_reset(&db.shared, &mut half, lock, old_generation);
        }
        assert!(db.is_empty());
        assert!(!db.contains("key-0"));
        assert_eq!(db.stats().unwrap().log_bytes, 32);
        db.add("fresh", &seeded_unit_vector(7, DIMS)).unwrap();
        assert_eq!(db.len(), 1);
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 1);
        assert!(reopened.contains("fresh"));
        assert!(!reopened.contains("key-0"));
    }

    #[test]
    fn delete_removes_all_files() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 5, 190)).unwrap();
        db.flush().unwrap();
        fs::write(temp_sibling(&path), [7u8; 10]).unwrap();
        assert!(path.exists());
        assert!(snapshot_exists(&path));
        assert!(lock_path(&path).exists());
        db.delete().unwrap();
        assert!(!path.exists());
        assert!(!snapshot_exists(&path));
        assert!(!temp_sibling(&path).exists());
        assert!(!lock_path(&path).exists());
    }

    #[test]
    fn delete_leaves_surviving_handles_closed() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let first = open_writer(&path);
        bulk_add(&first, &bulk_entries(0, 5, 400)).unwrap();
        first.flush().unwrap();
        let survivor = VecDb::open(&path, DIMS).unwrap();
        let observer = VecDb::open_read_only(&path, DIMS).unwrap();
        first.delete().unwrap();
        assert!(!path.exists());
        assert!(!snapshot_exists(&path));
        assert!(!lock_path(&path).exists());
        let query = seeded_unit_vector(1, DIMS);
        assert!(matches!(
            survivor.search(&query, &limit_params(3)),
            Err(VecDbError::Closed)
        ));
        assert!(matches!(survivor.add("x", &query), Err(VecDbError::Closed)));
        assert!(matches!(
            bulk_add(&survivor, &bulk_entries(0, 2, 401)),
            Err(VecDbError::Closed)
        ));
        assert!(matches!(survivor.remove("key-0"), Err(VecDbError::Closed)));
        assert!(matches!(survivor.stats(), Err(VecDbError::Closed)));
        assert!(matches!(survivor.flush(), Err(VecDbError::Closed)));
        assert!(matches!(survivor.reset(), Err(VecDbError::Closed)));
        assert!(matches!(
            observer.search(&query, &limit_params(3)),
            Err(VecDbError::Closed)
        ));
        assert_eq!(survivor.len(), 0);
        assert!(!survivor.contains("key-0"));
        assert!(survivor.get("key-0").is_none());
        assert!(matches!(survivor.delete(), Err(VecDbError::Closed)));
        let fresh = open_writer(&path);
        assert!(fresh.is_empty());
        fresh.add("anew", &query).unwrap();
        assert_eq!(fresh.len(), 1);
    }

    #[test]
    fn concurrent_bulk_add_with_live_readers_and_flush() {
        const READERS: usize = 3;
        const BULK: usize = 2000;
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let writer = open_writer(&path);
        let pre = bulk_entries(10_000, 50, 900);
        bulk_add(&writer, &pre).unwrap();
        let bulk = bulk_entries(0, BULK, 700);
        let expected: Arc<HashMap<String, Vec<f32>>> =
            Arc::new(pre.iter().chain(bulk.iter()).cloned().collect());
        let stop = Arc::new(AtomicBool::new(false));
        let barrier = Arc::new(Barrier::new(READERS + 2));
        let mut readers = Vec::new();
        for reader_index in 0..READERS {
            let handle = VecDb::open(&path, DIMS).unwrap();
            let stop = Arc::clone(&stop);
            let barrier = Arc::clone(&barrier);
            let expected = Arc::clone(&expected);
            readers.push(thread::spawn(move || {
                let query = seeded_unit_vector(31_337 + reader_index as u64, DIMS);
                barrier.wait();
                let mut iterations = 0usize;
                loop {
                    let found = handle.search(&query, &limit_params(8)).unwrap();
                    for entry in &found {
                        let vector = handle.get(&entry.key).unwrap();
                        assert_eq!(&vector, expected.get(&entry.key).unwrap());
                    }
                    iterations += 1;
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }
                }
                (handle, iterations)
            }));
        }
        let flusher = {
            let handle = VecDb::open(&path, DIMS).unwrap();
            let stop = Arc::clone(&stop);
            let barrier = Arc::clone(&barrier);
            thread::spawn(move || {
                barrier.wait();
                let mut flushes = 0usize;
                loop {
                    handle.flush().unwrap();
                    flushes += 1;
                    if stop.load(Ordering::Relaxed) {
                        break;
                    }
                }
                flushes
            })
        };
        barrier.wait();
        bulk_add(&writer, &bulk).unwrap();
        stop.store(true, Ordering::Relaxed);
        for reader in readers {
            let (handle, iterations) = reader.join().unwrap();
            assert!(iterations > 0);
            assert_eq!(handle.len(), 50 + BULK);
            assert!(handle.contains("key-0"));
            assert!(handle.contains(&format!("key-{}", BULK - 1)));
            assert!(handle.contains("key-10000"));
        }
        assert!(flusher.join().unwrap() > 0);
        assert_eq!(writer.len(), 50 + BULK);
        assert_eq!(writer.stats().unwrap().live_count, 50 + BULK);
    }

    #[test]
    fn searches_continue_while_a_compaction_is_in_flight() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 300, 500)).unwrap();
        let removals: Vec<String> = (0..30).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 30);
        assert_eq!(db.stats().unwrap().dead_count, 60);
        let generation_before = generation_of(&path);
        let query = seeded_unit_vector(4242, DIMS);
        let exact = SearchParams {
            limit: Some(10),
            exact: true,
            ..SearchParams::default()
        };
        let before = db.search(&query, &exact).unwrap();
        assert_eq!(before.len(), 10);
        let held = db.shared.state_read();
        let shared = Arc::clone(&db.shared);
        let compactor = thread::spawn(move || {
            let mut half = shared.writer_half();
            compact(&shared, &mut half)
        });
        let packed = held.arena.pack_query(&query).unwrap();
        for _ in 0..25 {
            let during = graph_search(&held.graph, &held.arena, &packed, &exact, None);
            assert_eq!(during, before);
        }
        drop(held);
        compactor.join().unwrap().unwrap();
        assert_ne!(generation_of(&path), generation_before);
        let stats = db.stats().unwrap();
        assert_eq!(stats.dead_count, 0);
        assert_eq!(stats.live_count, 270);
        assert_eq!(db.search(&query, &exact).unwrap(), before);
        assert!(!db.contains("key-0"));
        assert!(db.contains("key-30"));
    }

    #[test]
    fn non_finite_vectors_are_rejected_without_partial_state() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        db.add("key-0", &seeded_unit_vector(0, DIMS)).unwrap();
        let log_bytes = db.stats().unwrap().log_bytes;
        for bad_value in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            let mut bad = seeded_unit_vector(9, DIMS);
            bad[3] = bad_value;
            assert!(matches!(
                db.add("bad", &bad),
                Err(VecDbError::InvalidVector(_))
            ));
            assert!(!db.contains("bad"));
        }
        let mut infected = bulk_entries(10, 3, 200);
        infected[1].1[0] = f32::INFINITY;
        assert!(matches!(
            bulk_add(&db, &infected),
            Err(VecDbError::InvalidVector(_))
        ));
        assert_eq!(db.len(), 1);
        assert!(!db.contains("key-10"));
        assert!(!db.contains("key-12"));
        assert_eq!(db.stats().unwrap().log_bytes, log_bytes);
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 1);
        assert!(reopened.contains("key-0"));
        assert!(!reopened.contains("bad"));
    }

    #[test]
    fn bulk_search_matches_per_query_search() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 200, 640)).unwrap();
        let allowed = vec![
            "key-3".to_string(),
            "key-77".to_string(),
            "key-77".to_string(),
            "key-150".to_string(),
            "absent".to_string(),
        ];
        let queries: Vec<Vec<f32>> = (0..6)
            .map(|index| seeded_unit_vector(9000 + index, DIMS))
            .collect();
        for shape in search_shapes(allowed) {
            let bulk = db.bulk_search(&queries, &shape).unwrap();
            assert_eq!(bulk.len(), queries.len());
            for (query, matches) in queries.iter().zip(&bulk) {
                assert_eq!(matches, &db.search(query, &shape).unwrap());
            }
        }
        assert!(matches!(
            db.bulk_search(&queries, &SearchParams::default()),
            Err(VecDbError::UnboundedSearch)
        ));
        for bad_distance in [f32::NAN, f32::INFINITY, -0.5] {
            let degenerate = SearchParams {
                limit: Some(3),
                max_distance: Some(bad_distance),
                ..SearchParams::default()
            };
            let empties = db.bulk_search(&queries, &degenerate).unwrap();
            assert_eq!(empties.len(), queries.len());
            assert!(empties.iter().all(Vec::is_empty));
        }
        let empty_allowed = SearchParams {
            limit: Some(5),
            allowed_keys: Some(Vec::new()),
            ..SearchParams::default()
        };
        let none_allowed = db.bulk_search(&queries, &empty_allowed).unwrap();
        assert_eq!(none_allowed.len(), queries.len());
        assert!(none_allowed.iter().all(Vec::is_empty));
        for query in &queries {
            assert!(db.search(query, &empty_allowed).unwrap().is_empty());
        }
        assert!(db.bulk_search(&[], &limit_params(3)).unwrap().is_empty());
    }

    #[test]
    fn bulk_search_stored_preserves_order_skips_absent_and_excludes_self() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 40, 820)).unwrap();
        let twin = seeded_unit_vector(31_000, DIMS);
        db.add("twin-a", &twin).unwrap();
        db.add("twin-b", &twin).unwrap();
        let input = vec![
            "key-5".to_string(),
            "missing".to_string(),
            "twin-a".to_string(),
            "key-0".to_string(),
            "key-31".to_string(),
        ];
        for exact in [false, true] {
            let results = db
                .bulk_search_stored(&input, 4, None, exact, false)
                .unwrap();
            let found: Vec<&str> = results.iter().map(|entry| entry.key.as_str()).collect();
            assert_eq!(found, vec!["key-5", "twin-a", "key-0", "key-31"]);
            for entry in &results {
                assert_eq!(entry.matches.len(), 4);
                assert!(entry.matches.iter().all(|found| found.key != entry.key));
            }
            assert_eq!(results[1].matches[0].key, "twin-b");
            assert!(results[1].matches[0].distance.abs() < 1.0e-6);
        }
        assert!(
            db.bulk_search_stored(&[], 3, None, false, false)
                .unwrap()
                .is_empty()
        );
        let absent = vec!["nope".to_string(), "nada".to_string()];
        assert!(
            db.bulk_search_stored(&absent, 3, None, true, true)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn bulk_search_stored_restricts_to_input_only_when_asked() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 30, 860)).unwrap();
        let input: Vec<String> = (1..=4).map(|index| format!("key-{index}")).collect();
        for exact in [false, true] {
            let restricted = db
                .bulk_search_stored(&input, 10, None, exact, true)
                .unwrap();
            assert_eq!(restricted.len(), 4);
            for entry in &restricted {
                assert_eq!(entry.matches.len(), 3);
                assert!(
                    entry
                        .matches
                        .iter()
                        .all(|found| input.contains(&found.key) && found.key != entry.key)
                );
            }
            let open = db
                .bulk_search_stored(&input, 10, None, exact, false)
                .unwrap();
            assert!(open.iter().all(|entry| entry.matches.len() == 10));
            assert!(open.iter().any(|entry| {
                entry
                    .matches
                    .iter()
                    .any(|found| !input.contains(&found.key))
            }));
        }
    }

    #[test]
    fn bulk_search_stored_applies_the_distance_cut() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        db.add("center", &basis_vector(0)).unwrap();
        let mut close = basis_vector(0);
        close[0] = 0.99;
        close[1] = (1.0f32 - 0.99 * 0.99).sqrt();
        db.add("close", &close).unwrap();
        for axis in 2..10 {
            db.add(&format!("far-{axis}"), &basis_vector(axis)).unwrap();
        }
        let center = vec!["center".to_string()];
        for exact in [false, true] {
            let cut = db
                .bulk_search_stored(&center, 5, Some(0.5), exact, false)
                .unwrap();
            assert_eq!(cut[0].matches.len(), 1);
            assert_eq!(cut[0].matches[0].key, "close");
            let uncut = db
                .bulk_search_stored(&center, 20, Some(0.5), exact, false)
                .unwrap();
            assert_eq!(uncut[0].matches.len(), 1);
            let complete = db
                .bulk_search_stored(&center, 9, None, exact, false)
                .unwrap();
            assert_eq!(complete[0].matches.len(), 9);
            let whole_index = db
                .bulk_search_stored(&center, 10, None, exact, false)
                .unwrap();
            assert_eq!(whole_index[0].matches.len(), 9);
            for bad_distance in [f32::NAN, f32::INFINITY, -0.5] {
                let degenerate = db
                    .bulk_search_stored(&center, 5, Some(bad_distance), exact, false)
                    .unwrap();
                assert_eq!(degenerate.len(), 1);
                assert!(degenerate[0].matches.is_empty());
            }
        }
    }

    #[test]
    fn bulk_search_stored_on_a_single_entry_index_finds_nothing() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        db.add("solo", &seeded_unit_vector(5, DIMS)).unwrap();
        let input = vec!["solo".to_string()];
        for exact in [false, true] {
            for restrict in [false, true] {
                let results = db
                    .bulk_search_stored(&input, 3, None, exact, restrict)
                    .unwrap();
                assert_eq!(results.len(), 1);
                assert_eq!(results[0].key, "solo");
                assert!(results[0].matches.is_empty());
            }
        }
    }

    #[test]
    fn bulk_add_length_mismatch_is_rejected_before_anything_else() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        db.add("seed", &seeded_unit_vector(1, DIMS)).unwrap();
        let log_bytes = db.stats().unwrap().log_bytes;
        let keys = vec!["x".to_string(), "y".to_string()];
        let vectors = vec![seeded_unit_vector(2, DIMS)];
        assert!(matches!(
            db.bulk_add(&keys, &vectors),
            Err(VecDbError::LengthMismatch {
                keys: 2,
                vectors: 1
            })
        ));
        assert_eq!(db.len(), 1);
        assert!(!db.contains("x"));
        assert_eq!(db.stats().unwrap().log_bytes, log_bytes);
        let read_only = VecDb::open_read_only(&path, DIMS).unwrap();
        assert!(matches!(
            read_only.bulk_add(&keys, &vectors),
            Err(VecDbError::LengthMismatch { .. })
        ));
    }

    #[test]
    fn purge_with_a_live_instance_behaves_like_delete() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let first = open_writer(&path);
        bulk_add(&first, &bulk_entries(0, 5, 950)).unwrap();
        first.flush().unwrap();
        fs::write(temp_sibling(&path), [7u8; 10]).unwrap();
        let survivor = VecDb::open(&path, DIMS).unwrap();
        let observer = VecDb::open_read_only(&path, DIMS).unwrap();
        VecDb::purge(&path).unwrap();
        assert!(!path.exists());
        assert!(!snapshot_exists(&path));
        assert!(!temp_sibling(&path).exists());
        assert!(!lock_path(&path).exists());
        let query = seeded_unit_vector(1, DIMS);
        assert!(matches!(
            survivor.search(&query, &limit_params(3)),
            Err(VecDbError::Closed)
        ));
        assert!(matches!(
            survivor.bulk_search(std::slice::from_ref(&query), &limit_params(3)),
            Err(VecDbError::Closed)
        ));
        assert!(matches!(
            survivor.bulk_search_stored(&["key-0".to_string()], 3, None, false, false),
            Err(VecDbError::Closed)
        ));
        assert!(matches!(survivor.add("x", &query), Err(VecDbError::Closed)));
        assert!(matches!(
            bulk_add(&survivor, &bulk_entries(0, 2, 951)),
            Err(VecDbError::Closed)
        ));
        assert!(matches!(survivor.remove("key-0"), Err(VecDbError::Closed)));
        assert!(matches!(
            survivor.bulk_remove(&["key-0".to_string()]),
            Err(VecDbError::Closed)
        ));
        assert!(matches!(survivor.stats(), Err(VecDbError::Closed)));
        assert!(matches!(survivor.flush(), Err(VecDbError::Closed)));
        assert!(matches!(survivor.reset(), Err(VecDbError::Closed)));
        assert!(matches!(
            observer.search(&query, &limit_params(3)),
            Err(VecDbError::Closed)
        ));
        assert!(matches!(first.stats(), Err(VecDbError::Closed)));
        assert!(matches!(survivor.delete(), Err(VecDbError::Closed)));
        let fresh = open_writer(&path);
        assert!(fresh.is_empty());
        fresh.add("anew", &query).unwrap();
        assert_eq!(fresh.len(), 1);
    }

    #[test]
    fn purge_without_a_live_instance_removes_files_and_tolerates_missing_ones() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        bulk_add(&db, &bulk_entries(0, 5, 960)).unwrap();
        db.flush().unwrap();
        drop(db);
        fs::write(temp_sibling(&path), [7u8; 10]).unwrap();
        assert!(path.exists());
        assert!(snapshot_exists(&path));
        assert!(lock_path(&path).exists());
        VecDb::purge(&path).unwrap();
        assert!(!path.exists());
        assert!(!snapshot_exists(&path));
        assert!(!temp_sibling(&path).exists());
        assert!(!lock_path(&path).exists());
        VecDb::purge(&path).unwrap();
        VecDb::purge(&dir.path().join("never-created")).unwrap();
        let fresh = open_writer(&path);
        assert!(fresh.is_empty());
        fresh.add("fresh", &seeded_unit_vector(3, DIMS)).unwrap();
        assert_eq!(fresh.len(), 1);
    }

    fn attr(name: &str, value: AttrValue) -> Attribute {
        Attribute {
            name: name.to_string(),
            value,
        }
    }

    fn sample_attrs(seed: i64) -> Vec<Attribute> {
        vec![
            attr("model", AttrValue::Str(format!("model-{seed}"))),
            attr("version", AttrValue::I64(seed)),
            attr("indexed", AttrValue::Bool(seed % 2 == 0)),
            attr("score", AttrValue::F64(seed as f64 * 0.5)),
        ]
    }

    #[test]
    fn attrs_round_trip_and_upserts_replace_them_wholesale() {
        let dir = TempDir::new().unwrap();
        let db = open_writer(&dir.path().join("db"));
        let vector = seeded_unit_vector(1, DIMS);
        db.add_with_attrs("k", &vector, &sample_attrs(1)).unwrap();
        assert_eq!(db.get_attrs("k").unwrap(), sample_attrs(1));
        assert_eq!(db.get("k").unwrap(), vector);
        db.add_with_attrs("k", &vector, &[attr("only", AttrValue::Bool(true))])
            .unwrap();
        assert_eq!(
            db.get_attrs("k").unwrap(),
            vec![attr("only", AttrValue::Bool(true))]
        );
        db.add("k", &vector).unwrap();
        assert_eq!(db.get_attrs("k"), None);
        db.add_with_attrs("k", &vector, &sample_attrs(2)).unwrap();
        assert_eq!(db.get_attrs("k").unwrap(), sample_attrs(2));
        db.add_with_attrs("k", &vector, &[]).unwrap();
        assert_eq!(db.get_attrs("k"), None);
        db.add("plain", &vector).unwrap();
        assert_eq!(db.get_attrs("plain"), None);
        assert_eq!(db.get_attrs("missing"), None);
        assert!(matches!(
            db.add_with_attrs(
                "k",
                &vector,
                &[
                    attr("dup", AttrValue::Bool(true)),
                    attr("dup", AttrValue::Bool(false))
                ]
            ),
            Err(VecDbError::InvalidAttributes(_))
        ));
    }

    #[test]
    fn attrs_do_not_leak_across_remove_and_slot_recycle() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        let vector = seeded_unit_vector(2, DIMS);
        db.add_with_attrs("a", &vector, &sample_attrs(10)).unwrap();
        db.add_with_attrs("b", &vector, &sample_attrs(11)).unwrap();
        assert!(db.remove("a").unwrap());
        assert_eq!(db.get_attrs("a"), None);
        db.add("c", &vector).unwrap();
        assert_eq!(db.shared.state_read().arena.slot_of_key("c"), Some(0));
        assert_eq!(db.get_attrs("c"), None);
        assert!(db.remove("b").unwrap());
        db.add_with_attrs("d", &vector, &sample_attrs(12)).unwrap();
        assert_eq!(db.shared.state_read().arena.slot_of_key("d"), Some(1));
        assert_eq!(db.get_attrs("d").unwrap(), sample_attrs(12));
        db.add("a", &vector).unwrap();
        assert_eq!(db.get_attrs("a"), None);
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.get_attrs("a"), None);
        assert_eq!(reopened.get_attrs("b"), None);
        assert_eq!(reopened.get_attrs("c"), None);
        assert_eq!(reopened.get_attrs("d").unwrap(), sample_attrs(12));
    }

    #[test]
    fn attrs_replay_identically_across_reopen_and_read_only() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        let vector = seeded_unit_vector(3, DIMS);
        let ordered = vec![
            attr("zulu", AttrValue::I64(-5)),
            attr("alpha", AttrValue::Str("first".to_string())),
            attr("mike", AttrValue::F64(2.25)),
        ];
        db.add("plain", &vector).unwrap();
        db.add_with_attrs("rich", &vector, &ordered).unwrap();
        db.add_with_attrs("cleared", &vector, &sample_attrs(20))
            .unwrap();
        db.add("cleared", &vector).unwrap();
        db.add_with_attrs("removed", &vector, &sample_attrs(21))
            .unwrap();
        assert!(db.remove("removed").unwrap());
        db.add_with_attrs("recycled", &vector, &sample_attrs(22))
            .unwrap();
        db.flush().unwrap();
        drop(db);
        let verify = |db: &VecDb| {
            assert_eq!(db.get_attrs("plain"), None);
            assert_eq!(db.get_attrs("rich").unwrap(), ordered);
            assert_eq!(db.get_attrs("cleared"), None);
            assert_eq!(db.get_attrs("removed"), None);
            assert_eq!(db.get_attrs("recycled").unwrap(), sample_attrs(22));
        };
        let read_only = VecDb::open_read_only(&path, DIMS).unwrap();
        verify(&read_only);
        drop(read_only);
        let reopened = open_writer(&path);
        verify(&reopened);
        drop(reopened);
        fs::remove_file(snapshot_path(&path)).unwrap();
        let rebuilt = open_writer(&path);
        verify(&rebuilt);
    }

    #[test]
    fn attrs_follow_entries_through_compaction() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        let entries = bulk_entries(0, 120, 640);
        let (keys, vectors): (Vec<String>, Vec<Vec<f32>>) = entries.iter().cloned().unzip();
        let attrs: Vec<Option<Vec<Attribute>>> = (0..120)
            .map(|index| (index % 2 == 0).then(|| sample_attrs(index)))
            .collect();
        db.bulk_add_with_attrs(&keys, &vectors, &attrs).unwrap();
        let removals: Vec<String> = (0..64).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 64);
        assert_eq!(db.stats().unwrap().dead_count, 0);
        let verify = |db: &VecDb| {
            for index in 64..120i64 {
                let key = format!("key-{index}");
                if index % 2 == 0 {
                    assert_eq!(db.get_attrs(&key).unwrap(), sample_attrs(index));
                } else {
                    assert_eq!(db.get_attrs(&key), None);
                }
            }
            for index in 0..64 {
                assert_eq!(db.get_attrs(&format!("key-{index}")), None);
            }
        };
        verify(&db);
        drop(db);
        let reopened = open_writer(&path);
        verify(&reopened);
    }

    #[test]
    fn attrs_survive_a_failed_compaction_and_its_retry() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        let entries = bulk_entries(0, 120, 910);
        let (keys, vectors): (Vec<String>, Vec<Vec<f32>>) = entries.iter().cloned().unzip();
        let attrs: Vec<Option<Vec<Attribute>>> =
            (0..120).map(|index| Some(sample_attrs(index))).collect();
        db.bulk_add_with_attrs(&keys, &vectors, &attrs).unwrap();
        let generation_before = generation_of(&path);
        fs::create_dir(temp_sibling(&path)).unwrap();
        let removals: Vec<String> = (0..64).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 64);
        assert_eq!(db.stats().unwrap().dead_count, 128);
        assert_eq!(generation_of(&path), generation_before);
        let verify = |db: &VecDb| {
            for index in 64..120i64 {
                assert_eq!(
                    db.get_attrs(&format!("key-{index}")).unwrap(),
                    sample_attrs(index)
                );
            }
            for index in 0..64 {
                assert_eq!(db.get_attrs(&format!("key-{index}")), None);
            }
        };
        verify(&db);
        fs::remove_dir(temp_sibling(&path)).unwrap();
        let rewrite = |range: std::ops::Range<usize>| {
            let (keys, vectors): (Vec<String>, Vec<Vec<f32>>) =
                bulk_entries(range.start, range.len(), 910)
                    .iter()
                    .cloned()
                    .unzip();
            let attrs: Vec<Option<Vec<Attribute>>> = range
                .map(|index| Some(sample_attrs(index as i64)))
                .collect();
            db.bulk_add_with_attrs(&keys, &vectors, &attrs).unwrap();
        };
        rewrite(64..120);
        assert_eq!(db.stats().unwrap().dead_count, 184);
        assert_eq!(generation_of(&path), generation_before);
        verify(&db);
        rewrite(64..72);
        assert_eq!(db.stats().unwrap().dead_count, 0);
        assert_ne!(generation_of(&path), generation_before);
        verify(&db);
        drop(db);
        let reopened = open_writer(&path);
        verify(&reopened);
    }

    #[test]
    fn bulk_attrs_validate_before_any_io() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let db = open_writer(&path);
        let vector = seeded_unit_vector(5, DIMS);
        db.add("seed", &vector).unwrap();
        let log_bytes = db.stats().unwrap().log_bytes;
        let keys = vec!["x".to_string(), "y".to_string()];
        let vectors = vec![vector.clone(), vector.clone()];
        assert!(matches!(
            db.bulk_add_with_attrs(&keys, &vectors, &[None]),
            Err(VecDbError::LengthMismatch {
                keys: 2,
                vectors: 1
            })
        ));
        let poisoned = vec![
            Some(sample_attrs(1)),
            Some(vec![
                attr("dup", AttrValue::Bool(true)),
                attr("dup", AttrValue::Bool(false)),
            ]),
        ];
        assert!(matches!(
            db.bulk_add_with_attrs(&keys, &vectors, &poisoned),
            Err(VecDbError::InvalidAttributes(_))
        ));
        assert_eq!(db.len(), 1);
        assert!(!db.contains("x"));
        assert_eq!(db.stats().unwrap().log_bytes, log_bytes);
        let valid = vec![Some(sample_attrs(7)), None];
        db.bulk_add_with_attrs(&keys, &vectors, &valid).unwrap();
        assert_eq!(
            db.bulk_get_attrs(&[
                "x".to_string(),
                "missing".to_string(),
                "y".to_string(),
                "seed".to_string()
            ]),
            vec![Some(sample_attrs(7)), None, None, None]
        );
        assert_eq!(db.get_attrs("x").unwrap(), sample_attrs(7));
        let read_only = VecDb::open_read_only(&path, DIMS).unwrap();
        assert!(matches!(
            read_only.bulk_add_with_attrs(&keys, &vectors, &[None]),
            Err(VecDbError::LengthMismatch { .. })
        ));
        assert!(matches!(
            read_only.bulk_add_with_attrs(&keys, &vectors, &valid),
            Err(VecDbError::ReadOnly)
        ));
    }

    #[test]
    fn reset_clears_attrs() {
        let dir = TempDir::new().unwrap();
        let db = open_writer(&dir.path().join("db"));
        let vector = seeded_unit_vector(6, DIMS);
        db.add_with_attrs("k", &vector, &sample_attrs(30)).unwrap();
        db.reset().unwrap();
        assert_eq!(db.get_attrs("k"), None);
        db.add("k", &vector).unwrap();
        assert_eq!(db.get_attrs("k"), None);
        db.add_with_attrs("k", &vector, &sample_attrs(31)).unwrap();
        assert_eq!(db.get_attrs("k").unwrap(), sample_attrs(31));
    }

    #[test]
    fn memory_estimate_counts_the_attr_table_once_allocated() {
        let dir = TempDir::new().unwrap();
        let db = open_writer(&dir.path().join("db"));
        let vector = seeded_unit_vector(7, DIMS);
        db.add("k", &vector).unwrap();
        let without_attrs = db.stats().unwrap().approximate_memory_bytes;
        db.add_with_attrs(
            "k",
            &vector,
            &[attr("blob", AttrValue::Str("x".repeat(512)))],
        )
        .unwrap();
        let with_attrs = db.stats().unwrap().approximate_memory_bytes;
        assert!(with_attrs > without_attrs + 512);
    }
}
