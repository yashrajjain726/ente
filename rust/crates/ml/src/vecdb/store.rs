use std::collections::HashSet;
use std::fs::File;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::arena::{UpsertOutcome, VECTORS_PER_CHUNK, VectorArena};
use super::graph::{Graph, search as graph_search};
use super::lock::{WriterLock, lock_path};
use super::log::{
    HEADER_LEN, Log, LogEntry, LogRecord, remove_if_present, remove_stale_temp_sibling,
    sync_parent_dir,
};
use super::snapshot::{load_snapshot, remove_snapshot, snapshot_path, write_snapshot};
use super::{Match, SearchParams, VecDbError};

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
    path: PathBuf,
    arena: VectorArena,
    graph: Graph,
    total_records: u64,
    compaction_retry_at_dead: u64,
    mode: Mode,
}

enum Mode {
    Writer(WriterState),
    ReadOnly { log_bytes: u64 },
}

struct WriterState {
    lock: WriterLock,
    log: Log,
    mutations_since_snapshot: usize,
    last_write: Option<Instant>,
}

impl VecDb {
    pub fn open(path: &Path, dims: usize) -> Result<Self, VecDbError> {
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
        let mut db = Self {
            path: path.to_path_buf(),
            arena: replayed.arena,
            graph: replayed.graph,
            total_records: replayed.total_records,
            compaction_retry_at_dead: 0,
            mode: Mode::Writer(WriterState {
                lock,
                log,
                mutations_since_snapshot: 0,
                last_write: None,
            }),
        };
        if snapshot_stale && let Err(error) = db.write_snapshot_now() {
            log::warn!(
                "continuing without an open-time snapshot for {}: {error}",
                path.display()
            );
            if let Mode::Writer(state) = &mut db.mode {
                state.mutations_since_snapshot = pending_records.max(1);
            }
        }
        Ok(db)
    }

    pub fn open_read_only(path: &Path, dims: usize) -> Result<Self, VecDbError> {
        let file = match File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == ErrorKind::NotFound => {
                return Self::empty_read_only(path, dims);
            }
            Err(source) => return Err(VecDbError::io(path, source)),
        };
        let file_len = file
            .metadata()
            .map_err(|source| VecDbError::io(path, source))?
            .len();
        if file_len < HEADER_LEN as u64 {
            return Self::empty_read_only(path, dims);
        }
        let mut log = Log::open(file, path, dims)?;
        let replayed = replay(&mut log, dims)?;
        drop(log);
        Ok(Self {
            path: path.to_path_buf(),
            arena: replayed.arena,
            graph: replayed.graph,
            total_records: replayed.total_records,
            compaction_retry_at_dead: 0,
            mode: Mode::ReadOnly {
                log_bytes: replayed.recoverable_end,
            },
        })
    }

    fn empty_read_only(path: &Path, dims: usize) -> Result<Self, VecDbError> {
        Ok(Self {
            path: path.to_path_buf(),
            arena: VectorArena::new(dims)?,
            graph: Graph::new(),
            total_records: 0,
            compaction_retry_at_dead: 0,
            mode: Mode::ReadOnly { log_bytes: 0 },
        })
    }

    pub fn add(&mut self, key: &str, vector: &[f32]) -> Result<(), VecDbError> {
        let now = Instant::now();
        self.ensure_writer()?;
        ensure_finite(key, vector)?;
        self.writer_state()?
            .log
            .append(&[LogEntry::Add { key, vector }])?;
        let outcome = self.arena.upsert(key, vector)?;
        apply_outcome(&mut self.graph, &self.arena, outcome);
        self.record_mutations(1, now)
    }

    pub fn bulk_add(&mut self, entries: &[(String, Vec<f32>)]) -> Result<(), VecDbError> {
        let now = Instant::now();
        self.ensure_writer()?;
        if entries.is_empty() {
            return Ok(());
        }
        for (key, vector) in entries {
            ensure_finite(key, vector)?;
        }
        let records: Vec<LogEntry<'_>> = entries
            .iter()
            .map(|(key, vector)| LogEntry::Add { key, vector })
            .collect();
        self.writer_state()?.log.append(&records)?;
        for (key, vector) in entries {
            let outcome = self.arena.upsert(key, vector)?;
            apply_outcome(&mut self.graph, &self.arena, outcome);
        }
        self.record_mutations(entries.len(), now)
    }

    pub fn remove(&mut self, key: &str) -> Result<bool, VecDbError> {
        let now = Instant::now();
        self.ensure_writer()?;
        if self.arena.slot_of_key(key).is_none() {
            return Ok(false);
        }
        self.writer_state()?
            .log
            .append(&[LogEntry::Tombstone { key }])?;
        self.arena.remove(key);
        self.record_mutations(1, now)?;
        Ok(true)
    }

    pub fn bulk_remove(&mut self, keys: &[String]) -> Result<usize, VecDbError> {
        let now = Instant::now();
        self.ensure_writer()?;
        let mut scheduled: Vec<&str> = Vec::new();
        let mut seen: HashSet<&str> = HashSet::new();
        for key in keys {
            if self.arena.slot_of_key(key).is_some() && seen.insert(key.as_str()) {
                scheduled.push(key);
            }
        }
        if scheduled.is_empty() {
            return Ok(0);
        }
        let records: Vec<LogEntry<'_>> = scheduled
            .iter()
            .map(|key| LogEntry::Tombstone { key })
            .collect();
        self.writer_state()?.log.append(&records)?;
        for key in &scheduled {
            self.arena.remove(key);
        }
        let count = scheduled.len();
        self.record_mutations(count, now)?;
        Ok(count)
    }

    pub fn contains(&self, key: &str) -> bool {
        self.arena.slot_of_key(key).is_some()
    }

    pub fn get(&self, key: &str) -> Option<Vec<f32>> {
        let slot = self.arena.slot_of_key(key)?;
        Some(self.arena.vector_values(slot))
    }

    pub fn search(&self, query: &[f32], params: &SearchParams) -> Result<Vec<Match>, VecDbError> {
        if params.limit.is_none() && params.max_distance.is_none() {
            return Err(VecDbError::UnboundedSearch);
        }
        if let Some(max_distance) = params.max_distance
            && (!max_distance.is_finite() || max_distance < 0.0)
        {
            return Ok(Vec::new());
        }
        let packed = self.arena.pack_query(query)?;
        let allowed_slots: Option<HashSet<u32>> = params.allowed_keys.as_ref().map(|keys| {
            keys.iter()
                .filter_map(|key| self.arena.slot_of_key(key))
                .collect()
        });
        Ok(graph_search(
            &self.graph,
            &self.arena,
            &packed,
            params,
            allowed_slots.as_ref(),
        ))
    }

    pub fn flush(&mut self) -> Result<(), VecDbError> {
        let state = self.writer_state()?;
        if state.mutations_since_snapshot == 0 {
            return Ok(());
        }
        self.write_snapshot_now()
    }

    pub fn reset(&mut self) -> Result<(), VecDbError> {
        let WriterState { lock, log, .. } = self.take_writer_state()?;
        let old_generation = log.generation();
        drop(log);
        let dims = self.arena.dims();
        let recreated = remove_data_files(&self.path).and_then(|()| Log::create(&self.path, dims));
        let log = match recreated {
            Ok(log) => log,
            Err(error) => {
                self.recover_after_failed_reset(lock, dims, old_generation);
                return Err(error);
            }
        };
        self.arena = VectorArena::new(dims)?;
        self.graph = Graph::new();
        self.total_records = 0;
        self.compaction_retry_at_dead = 0;
        self.mode = Mode::Writer(WriterState {
            lock,
            log,
            mutations_since_snapshot: 0,
            last_write: None,
        });
        Ok(())
    }

    pub fn delete(self) -> Result<(), VecDbError> {
        let Mode::Writer(state) = self.mode else {
            return Err(VecDbError::ReadOnly);
        };
        let WriterState { lock, log, .. } = state;
        drop(log);
        let removed = remove_index_files(&self.path);
        drop(lock);
        removed
    }

    pub fn stats(&self) -> Stats {
        let live_count = self.arena.live_count();
        let (log_bytes, records_since_snapshot) = match &self.mode {
            Mode::Writer(state) => (
                state.log.current_end_offset(),
                state.mutations_since_snapshot,
            ),
            Mode::ReadOnly { log_bytes } => (*log_bytes, 0),
        };
        Stats {
            live_count,
            dead_count: self.total_records.saturating_sub(live_count as u64) as usize,
            dims: self.arena.dims(),
            log_bytes,
            records_since_snapshot,
            approximate_memory_bytes: self.approximate_memory_bytes(),
        }
    }

    pub fn len(&self) -> usize {
        self.arena.live_count()
    }

    pub fn is_empty(&self) -> bool {
        self.arena.is_empty()
    }

    fn writer_state(&mut self) -> Result<&mut WriterState, VecDbError> {
        match &mut self.mode {
            Mode::Writer(state) => Ok(state),
            Mode::ReadOnly { .. } => Err(VecDbError::ReadOnly),
        }
    }

    fn ensure_writer(&self) -> Result<(), VecDbError> {
        match &self.mode {
            Mode::Writer(_) => Ok(()),
            Mode::ReadOnly { .. } => Err(VecDbError::ReadOnly),
        }
    }

    fn take_writer_state(&mut self) -> Result<WriterState, VecDbError> {
        self.ensure_writer()?;
        match std::mem::replace(&mut self.mode, Mode::ReadOnly { log_bytes: 0 }) {
            Mode::Writer(state) => Ok(state),
            Mode::ReadOnly { .. } => Err(VecDbError::ReadOnly),
        }
    }

    fn restore_writer_mode(
        &mut self,
        lock: WriterLock,
        dims: usize,
        last_write: Option<Instant>,
    ) -> Result<(), VecDbError> {
        match reopen_log(&self.path, dims) {
            Ok(log) => {
                self.mode = Mode::Writer(WriterState {
                    lock,
                    log,
                    mutations_since_snapshot: 0,
                    last_write,
                });
                Ok(())
            }
            Err(error) => {
                let log_bytes = std::fs::metadata(&self.path)
                    .map(|meta| meta.len())
                    .unwrap_or(0);
                log::warn!(
                    "degrading {} to read-only after failing to restore its writer: {error}",
                    self.path.display()
                );
                self.mode = Mode::ReadOnly { log_bytes };
                Err(error)
            }
        }
    }

    fn recover_after_failed_reset(
        &mut self,
        lock: WriterLock,
        dims: usize,
        old_generation: [u8; 16],
    ) {
        let old_log_restored = self.restore_writer_mode(lock, dims, None).is_ok()
            && matches!(&self.mode, Mode::Writer(state) if state.log.generation() == old_generation);
        if old_log_restored {
            return;
        }
        if let Ok(empty) = VectorArena::new(dims) {
            self.arena = empty;
            self.graph = Graph::new();
            self.total_records = 0;
            self.compaction_retry_at_dead = 0;
        }
    }

    fn record_mutations(&mut self, count: usize, now: Instant) -> Result<(), VecDbError> {
        self.total_records += count as u64;
        let live = self.arena.live_count() as u64;
        let total = self.total_records;
        let Mode::Writer(state) = &mut self.mode else {
            return Err(VecDbError::ReadOnly);
        };
        state.mutations_since_snapshot += count;
        let quiet = state
            .last_write
            .is_some_and(|previous| now.duration_since(previous) >= SNAPSHOT_QUIET_GAP);
        state.last_write = Some(now);
        let mutations = state.mutations_since_snapshot;
        let dead = total.saturating_sub(live);
        if dead >= COMPACTION_MIN_DEAD_RECORDS
            && dead.saturating_mul(COMPACTION_DEAD_RATIO) >= total
            && dead >= self.compaction_retry_at_dead
        {
            match self.compact() {
                Ok(()) => self.compaction_retry_at_dead = 0,
                Err(error) => {
                    log::warn!("compaction of {} failed: {error}", self.path.display());
                    self.compaction_retry_at_dead = dead + COMPACTION_MIN_DEAD_RECORDS;
                }
            }
            return Ok(());
        }
        if (mutations >= SNAPSHOT_HARD_CAP || (mutations >= SNAPSHOT_QUIET_THRESHOLD && quiet))
            && let Err(error) = self.write_snapshot_now()
        {
            log::warn!("snapshot of {} failed: {error}", self.path.display());
        }
        Ok(())
    }

    fn write_snapshot_now(&mut self) -> Result<(), VecDbError> {
        let graph = &self.graph;
        let Mode::Writer(state) = &mut self.mode else {
            return Err(VecDbError::ReadOnly);
        };
        write_snapshot(
            state.log.path(),
            state.log.generation(),
            state.log.current_end_offset(),
            graph,
        )?;
        state.mutations_since_snapshot = 0;
        Ok(())
    }

    fn compact(&mut self) -> Result<(), VecDbError> {
        self.ensure_writer()?;
        let dims = self.arena.dims();
        let (mut temp_log, temp_path) = Log::create_temp_sibling(&self.path, dims)?;
        let mut compacted = VectorArena::new(dims)?;
        if let Err(error) = stage_live_entries(&self.arena, &mut compacted, &mut temp_log) {
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
        } = self.take_writer_state()?;
        drop(log);
        let promoted = promote_compacted_log(&temp_path, &self.path);
        if temp_path.exists() {
            let _ = std::fs::remove_file(&temp_path);
        } else {
            self.arena = compacted;
            self.graph = Graph::rebuild(&self.arena);
            self.total_records = self.arena.live_count() as u64;
        }
        let restored = self.restore_writer_mode(lock, dims, last_write);
        promoted?;
        restored?;
        self.write_snapshot_now()
    }

    fn approximate_memory_bytes(&self) -> usize {
        let vector_bytes = self.arena.slot_count().div_ceil(VECTORS_PER_CHUNK)
            * VECTORS_PER_CHUNK
            * self.arena.dims()
            * size_of::<f32>();
        let key_bytes: usize = self
            .arena
            .live_slots()
            .filter_map(|slot| self.arena.key_of_slot(slot))
            .map(|key| KEY_TABLE_COPIES * (key.len() + KEY_ENTRY_OVERHEAD_BYTES))
            .sum();
        let free_list_bytes = self.arena.dead_count() * size_of::<u32>();
        let graph_bytes: usize = self
            .graph
            .slots()
            .map(|slot| {
                let level = self.graph.level_of(slot).unwrap_or(0);
                GRAPH_NODE_OVERHEAD_BYTES
                    + (0..=level)
                        .map(|layer| {
                            NEIGHBOR_LIST_OVERHEAD_BYTES
                                + size_of_val(self.graph.neighbors_of(slot, layer))
                        })
                        .sum::<usize>()
            })
            .sum();
        vector_bytes + key_bytes + free_list_bytes + graph_bytes
    }
}

struct ReplayedState {
    arena: VectorArena,
    graph: Graph,
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
                LogRecord::Add { key, vector } => {
                    let outcome = arena.upsert(&key, &vector)?;
                    if in_tail {
                        tail_outcomes.push(outcome);
                    }
                }
                LogRecord::Tombstone { key } => {
                    arena.remove(&key);
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
    source: &VectorArena,
    target: &mut VectorArena,
    log: &mut Log,
) -> Result<(), VecDbError> {
    let mut batch: Vec<(String, Vec<f32>)> = Vec::with_capacity(COMPACTION_BATCH_SIZE);
    for slot in source.live_slots() {
        let Some(key) = source.key_of_slot(slot) else {
            continue;
        };
        batch.push((key.to_string(), source.vector_values(slot)));
        if batch.len() == COMPACTION_BATCH_SIZE {
            flush_stage_batch(&mut batch, target, log)?;
        }
    }
    flush_stage_batch(&mut batch, target, log)
}

fn flush_stage_batch(
    batch: &mut Vec<(String, Vec<f32>)>,
    target: &mut VectorArena,
    log: &mut Log,
) -> Result<(), VecDbError> {
    if batch.is_empty() {
        return Ok(());
    }
    let records: Vec<LogEntry<'_>> = batch
        .iter()
        .map(|(key, vector)| LogEntry::Add { key, vector })
        .collect();
    log.append(&records)?;
    for (key, vector) in batch.drain(..) {
        target.upsert(&key, &vector)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::TempDir;

    use super::super::kernel::splitmix64;
    use super::*;

    const DIMS: usize = 16;
    const ADD_RECORD_LEN: u64 = 3 + 5 + (DIMS as u64) * 4 + 4;
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

    fn writer(db: &mut VecDb) -> &mut WriterState {
        match &mut db.mode {
            Mode::Writer(state) => state,
            Mode::ReadOnly { .. } => panic!("expected a writer instance"),
        }
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 150, 100)).unwrap();
        db.add("probe", &probe).unwrap();
        assert_eq!(db.len(), 151);
        assert!(!db.is_empty());
        assert!(db.contains("probe"));
        assert!(db.contains("key-42"));
        assert!(!db.contains("key-999"));
        assert_eq!(db.get("probe").unwrap(), probe);
        assert_eq!(db.get("key-7").unwrap(), seeded_unit_vector(107, DIMS));
        assert!(db.get("missing").is_none());
        let stats = db.stats();
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
        assert_eq!(db.stats().records_since_snapshot, 0);
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 5, 10)).unwrap();
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
        let mut db = open_writer(&path);
        for index in 0..4 {
            db.add(
                &format!("solo-{index}"),
                &seeded_unit_vector(index as u64, DIMS),
            )
            .unwrap();
        }
        db.bulk_add(&bulk_entries(0, 6, 40)).unwrap();
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 6, 60)).unwrap();
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 4, 20)).unwrap();
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 4, 30)).unwrap();
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 8, 50)).unwrap();
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 3, 70)).unwrap();
        db.flush().unwrap();
        drop(db);
        let stale_snapshot = fs::read(snapshot_path(&path)).unwrap();
        fs::remove_file(&path).unwrap();
        let mut db = open_writer(&path);
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 5, 80)).unwrap();
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 5, 90)).unwrap();
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 5, 110)).unwrap();
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
    fn second_writer_is_locked_out() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 3, 120)).unwrap();
        let Err(error) = VecDb::open(&path, DIMS) else {
            panic!("second writer must not open");
        };
        assert!(matches!(error, VecDbError::Locked(locked) if locked == path));
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 3);
    }

    #[test]
    fn writer_stays_locked_across_a_completed_compaction() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 120, 340)).unwrap();
        let generation_before = generation_of(&path);
        let removals: Vec<String> = (0..64).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 64);
        assert_ne!(generation_of(&path), generation_before);
        assert_eq!(db.stats().dead_count, 0);
        let Err(error) = VecDb::open(&path, DIMS) else {
            panic!("second writer must not open after compaction");
        };
        assert!(matches!(error, VecDbError::Locked(locked) if locked == path));
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
        let mut db = open_writer(&path);
        db.add("fresh", &seeded_unit_vector(3, DIMS)).unwrap();
        let Err(error) = VecDb::open(&path, DIMS) else {
            panic!("second writer must not open");
        };
        assert!(matches!(error, VecDbError::Locked(locked) if locked == path));
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 1);
        assert!(reopened.contains("fresh"));
    }

    #[test]
    fn read_only_opens_alongside_a_writer() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 3, 130)).unwrap();
        let read_only = VecDb::open_read_only(&path, DIMS).unwrap();
        assert_eq!(read_only.len(), 3);
        assert!(read_only.contains("key-1"));
        db.add("later", &seeded_unit_vector(9, DIMS)).unwrap();
        assert!(!read_only.contains("later"));
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
            db.stats(),
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
        let mut db = open_writer(&path);
        db.add("kept", &seeded_unit_vector(3, DIMS)).unwrap();
        drop(db);
        let mut read_only = VecDb::open_read_only(&path, DIMS).unwrap();
        let vector = seeded_unit_vector(4, DIMS);
        assert!(matches!(
            read_only.add("x", &vector),
            Err(VecDbError::ReadOnly)
        ));
        assert!(matches!(
            read_only.bulk_add(&bulk_entries(0, 2, 5)),
            Err(VecDbError::ReadOnly)
        ));
        assert!(matches!(read_only.bulk_add(&[]), Err(VecDbError::ReadOnly)));
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
    fn read_only_view_stays_point_in_time_while_writer_compacts() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 100, 140)).unwrap();
        let generation_before = generation_of(&path);
        let read_only = VecDb::open_read_only(&path, DIMS).unwrap();
        assert_eq!(read_only.len(), 100);
        for index in 0..32 {
            assert!(db.remove(&format!("key-{index}")).unwrap());
        }
        assert_ne!(generation_of(&path), generation_before);
        assert_eq!(db.len(), 68);
        assert_eq!(db.stats().dead_count, 0);
        db.add("fresh", &seeded_unit_vector(7, DIMS)).unwrap();
        assert_own_nearest(&db, "key-50", &seeded_unit_vector(190, DIMS));
        assert_eq!(read_only.len(), 100);
        assert!(read_only.contains("key-5"));
        assert!(!read_only.contains("fresh"));
        assert_own_nearest(&read_only, "key-5", &seeded_unit_vector(145, DIMS));
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
        let mut db = open_writer(&path);
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
        let mut db = open_writer(&path);
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
        assert_eq!(db.stats().dead_count, 2);
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 5, 150)).unwrap();
        let log_bytes = db.stats().log_bytes;
        assert!(!db.remove("missing").unwrap());
        assert_eq!(db.stats().log_bytes, log_bytes);
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
        assert_eq!(db.stats().log_bytes, log_bytes + 2 * TOMBSTONE_RECORD_LEN);
        assert_eq!(db.bulk_remove(&[]).unwrap(), 0);
        db.bulk_add(&[]).unwrap();
        assert_eq!(db.stats().log_bytes, log_bytes + 2 * TOMBSTONE_RECORD_LEN);
    }

    #[test]
    fn quiet_gap_snapshot_needs_a_thousand_mutations() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let mut db = open_writer(&path);
        db.add("seed", &seeded_unit_vector(1, DIMS)).unwrap();
        writer(&mut db).mutations_since_snapshot = 998;
        db.record_mutations(1, Instant::now() + Duration::from_secs(30))
            .unwrap();
        assert_eq!(writer(&mut db).mutations_since_snapshot, 999);
        assert!(!snapshot_exists(&path));
        db.record_mutations(1, Instant::now() + Duration::from_secs(60))
            .unwrap();
        assert_eq!(writer(&mut db).mutations_since_snapshot, 0);
        assert!(snapshot_exists(&path));
    }

    #[test]
    fn thousand_mutations_without_quiet_gap_do_not_snapshot() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let mut db = open_writer(&path);
        db.add("seed", &seeded_unit_vector(1, DIMS)).unwrap();
        writer(&mut db).mutations_since_snapshot = 999;
        db.record_mutations(1, Instant::now()).unwrap();
        assert_eq!(writer(&mut db).mutations_since_snapshot, 1000);
        assert!(!snapshot_exists(&path));
    }

    #[test]
    fn hard_cap_snapshots_regardless_of_gap() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let mut db = open_writer(&path);
        db.add("seed", &seeded_unit_vector(1, DIMS)).unwrap();
        writer(&mut db).mutations_since_snapshot = 4999;
        db.record_mutations(1, Instant::now()).unwrap();
        assert_eq!(writer(&mut db).mutations_since_snapshot, 0);
        assert!(snapshot_exists(&path));
    }

    #[test]
    fn flush_snapshots_pending_mutations_and_resets() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 2, 160)).unwrap();
        assert!(!snapshot_exists(&path));
        assert_eq!(db.stats().records_since_snapshot, 2);
        db.flush().unwrap();
        assert!(snapshot_exists(&path));
        assert_eq!(db.stats().records_since_snapshot, 0);
        fs::remove_file(snapshot_path(&path)).unwrap();
        db.flush().unwrap();
        assert!(!snapshot_exists(&path));
    }

    #[test]
    fn open_after_tail_replay_writes_a_fresh_snapshot() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 3, 170)).unwrap();
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 120, 1000)).unwrap();
        let generation_before = generation_of(&path);
        for index in 0..40u64 {
            db.add(
                &format!("key-{index}"),
                &seeded_unit_vector(5000 + index, DIMS),
            )
            .unwrap();
        }
        assert_eq!(generation_of(&path), generation_before);
        assert_eq!(db.stats().dead_count, 40);
        let log_bytes_before = db.stats().log_bytes;
        let removals: Vec<String> = (90..120).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 30);
        let stats = db.stats();
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 1100, 3000)).unwrap();
        let generation_before = generation_of(&path);
        let removals: Vec<String> = (0..58).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 58);
        assert_ne!(generation_of(&path), generation_before);
        let stats = db.stats();
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 120, 210)).unwrap();
        db.flush().unwrap();
        let stale_snapshot = fs::read(snapshot_path(&path)).unwrap();
        let removals: Vec<String> = (0..64).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 64);
        assert_eq!(db.stats().dead_count, 0);
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
        let stats = reopened.stats();
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
        let mut db = open_writer(&path);
        assert!(db.is_empty());
        assert_eq!(db.stats().log_bytes, 32);
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
        assert_eq!(db.stats().log_bytes, 0);
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 3, 260)).unwrap();
        let WriterState { lock, log, .. } = db.take_writer_state().unwrap();
        drop(log);
        assert!(matches!(db.mode, Mode::ReadOnly { .. }));
        assert!(matches!(
            VecDb::open(&path, DIMS),
            Err(VecDbError::Locked(_))
        ));
        db.restore_writer_mode(lock, DIMS, None).unwrap();
        db.add("after", &seeded_unit_vector(4, DIMS)).unwrap();
        assert!(matches!(
            VecDb::open(&path, DIMS),
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 3, 270)).unwrap();
        let WriterState { lock, log, .. } = db.take_writer_state().unwrap();
        drop(log);
        let mut bytes = fs::read(&path).unwrap();
        bytes[20] ^= 0x5A;
        fs::write(&path, &bytes).unwrap();
        assert!(matches!(
            db.restore_writer_mode(lock, DIMS, None),
            Err(VecDbError::Corrupt(_))
        ));
        assert!(matches!(db.mode, Mode::ReadOnly { log_bytes } if log_bytes == bytes.len() as u64));
        assert_eq!(db.stats().log_bytes, bytes.len() as u64);
        let vector = seeded_unit_vector(5, DIMS);
        assert!(matches!(db.add("x", &vector), Err(VecDbError::ReadOnly)));
    }

    #[test]
    fn snapshot_failure_degrades_the_write_and_flush_still_errors() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let mut db = open_writer(&path);
        db.add("seed", &seeded_unit_vector(1, DIMS)).unwrap();
        fs::create_dir(snapshot_path(&path)).unwrap();
        writer(&mut db).mutations_since_snapshot = 4999;
        db.record_mutations(1, Instant::now()).unwrap();
        assert_eq!(writer(&mut db).mutations_since_snapshot, 5000);
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 100, 280)).unwrap();
        let generation_before = generation_of(&path);
        fs::create_dir(temp_sibling(&path)).unwrap();
        let removals: Vec<String> = (0..64).map(|index| format!("key-{index}")).collect();
        assert_eq!(db.bulk_remove(&removals).unwrap(), 64);
        assert_eq!(db.stats().dead_count, 128);
        assert_eq!(generation_of(&path), generation_before);
        db.add("probe", &seeded_unit_vector(7, DIMS)).unwrap();
        assert!(matches!(
            VecDb::open(&path, DIMS),
            Err(VecDbError::Locked(_))
        ));
        fs::remove_dir(temp_sibling(&path)).unwrap();
        db.bulk_add(&bulk_entries(64, 36, 290)).unwrap();
        assert_eq!(db.stats().dead_count, 164);
        assert_eq!(generation_of(&path), generation_before);
        db.bulk_add(&bulk_entries(64, 28, 295)).unwrap();
        assert_eq!(db.stats().dead_count, 0);
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 5, 300)).unwrap();
        drop(db);
        fs::create_dir(snapshot_path(&path)).unwrap();
        let mut db = open_writer(&path);
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 20, 180)).unwrap();
        db.flush().unwrap();
        let generation_before = generation_of(&path);
        db.reset().unwrap();
        assert!(db.is_empty());
        assert!(!snapshot_exists(&path));
        assert_ne!(generation_of(&path), generation_before);
        assert_eq!(fs::metadata(&path).unwrap().len(), 32);
        assert_eq!(
            db.stats(),
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
    fn failed_reset_with_the_log_gone_becomes_an_accurate_empty_instance() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 5, 310)).unwrap();
        fs::create_dir(snapshot_path(&path)).unwrap();
        assert!(matches!(db.reset(), Err(VecDbError::Io { .. })));
        assert!(!path.exists());
        assert!(db.is_empty());
        assert_eq!(db.len(), 0);
        assert!(!db.contains("key-0"));
        assert_eq!(db.stats().log_bytes, 0);
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 5, 320)).unwrap();
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 5, 330)).unwrap();
        let old_generation = generation_of(&path);
        let WriterState { lock, log, .. } = db.take_writer_state().unwrap();
        drop(log);
        remove_data_files(&path).unwrap();
        drop(Log::create(&path, DIMS).unwrap().into_file());
        db.recover_after_failed_reset(lock, DIMS, old_generation);
        assert!(db.is_empty());
        assert!(!db.contains("key-0"));
        assert_eq!(db.stats().log_bytes, 32);
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
        let mut db = open_writer(&path);
        db.bulk_add(&bulk_entries(0, 5, 190)).unwrap();
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
    fn non_finite_vectors_are_rejected_without_partial_state() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("db");
        let mut db = open_writer(&path);
        db.add("key-0", &seeded_unit_vector(0, DIMS)).unwrap();
        let log_bytes = db.stats().log_bytes;
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
            db.bulk_add(&infected),
            Err(VecDbError::InvalidVector(_))
        ));
        assert_eq!(db.len(), 1);
        assert!(!db.contains("key-10"));
        assert!(!db.contains("key-12"));
        assert_eq!(db.stats().log_bytes, log_bytes);
        drop(db);
        let reopened = open_writer(&path);
        assert_eq!(reopened.len(), 1);
        assert!(reopened.contains("key-0"));
        assert!(!reopened.contains("bad"));
    }
}
