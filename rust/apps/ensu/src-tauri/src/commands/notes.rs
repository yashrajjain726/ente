use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs::{self, OpenOptions};
use std::io::Write;
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

use ente_ensu::notes::{
    NOTES_MAX_SOURCE_BYTES, NoteSourceReference, NotesCollectionIndex, NotesError,
    NotesIndexWriter, NotesSourceDocument, notes_content_revision, prepare_notes_document,
    validate_document_id,
};
use ente_ensu::{llm, model};
use notify::event::{CreateKind, RemoveKind};
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::async_runtime;
use tauri::{AppHandle, Emitter, Manager, State as TauriState};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

use crate::commands::common::ApiError;
use crate::commands::llm::ModelDownloadState;

const NOTES_DIRECTORY: &str = "notes";
const NOTES_INDEX_DIRECTORY: &str = "indexes";
const NOTES_REGISTRY_FILE: &str = "collections.json";
const NOTES_REGISTRY_BACKUP_FILE: &str = "collections.json.backup";
const NOTES_REGISTRY_SCHEMA_VERSION: u32 = 1;
const MAX_REGISTRY_BYTES: u64 = 1024 * 1024;
const MAX_DOCUMENTS_PER_INDEX_SLICE: usize = 64;
const TARGET_CHUNKS_PER_INDEX_SLICE: usize = 128;
const NOTES_QUIET_PERIOD_MS: i64 = 5 * 60 * 1_000;
const NOTES_STATE_CHANGED_EVENT: &str = "notes-state-changed";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisteredCollection {
    id: String,
    source_root: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RegistryFile {
    schema_version: u32,
    collections: Vec<RegisteredCollection>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryHeader {
    schema_version: u32,
}

impl Default for RegistryFile {
    fn default() -> Self {
        Self {
            schema_version: NOTES_REGISTRY_SCHEMA_VERSION,
            collections: Vec::new(),
        }
    }
}

struct RegistryStore {
    directory: PathBuf,
    registry: RegistryFile,
    incompatible_error: Option<String>,
}

impl RegistryStore {
    fn open(directory: PathBuf) -> Result<Self, ApiError> {
        ensure_directory(&directory)?;
        let (registry, incompatible_error) = match open_registry_file(&directory) {
            Ok(registry) => (registry, None),
            Err(error) if error.name == Some("incompatible_registry") => {
                crate::logging::log(
                    "Notes",
                    "incompatible registry preserved; Notes are disabled for this version",
                );
                (RegistryFile::default(), Some(error.message))
            }
            Err(error) if is_registry_content_error(&error) => {
                quarantine_invalid_registry_files(&directory)?;
                recover_registry_publication(&directory)?;
                crate::logging::log(
                    "Notes",
                    "invalid registry quarantined; starting with no registered folders",
                );
                (RegistryFile::default(), None)
            }
            Err(error) => return Err(error),
        };
        Ok(Self {
            directory,
            registry,
            incompatible_error,
        })
    }

    fn ensure_compatible(&self) -> Result<(), ApiError> {
        match &self.incompatible_error {
            Some(message) => Err(ApiError::new("incompatible_registry", message.clone())),
            None => Ok(()),
        }
    }

    fn replace(&mut self, registry: RegistryFile) -> Result<(), ApiError> {
        self.ensure_compatible()?;
        validate_registry(&registry)?;
        publish_registry(&self.directory, &registry)?;
        self.registry = registry;
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NotesCollectionStatusDto {
    Indexing,
    Updating,
    Ready,
    Pending,
    Unavailable,
    Error,
}

#[derive(Debug, Clone)]
struct CollectionRuntime {
    status: NotesCollectionStatusDto,
    index_available: bool,
    indexing_progress: Option<u8>,
    indexed_document_count: u64,
    last_updated_at_ms: Option<i64>,
    last_error: Option<String>,
}

impl CollectionRuntime {
    fn pending() -> Self {
        Self {
            status: NotesCollectionStatusDto::Pending,
            index_available: false,
            indexing_progress: None,
            indexed_document_count: 0,
            last_updated_at_ms: None,
            last_error: None,
        }
    }

    fn unavailable() -> Self {
        Self {
            status: NotesCollectionStatusDto::Unavailable,
            last_error: Some("Source folder is unavailable".to_string()),
            ..Self::pending()
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesCollectionDto {
    id: String,
    label: String,
    status: NotesCollectionStatusDto,
    indexing_progress: Option<u8>,
    indexed_document_count: u64,
    last_updated_at_ms: Option<i64>,
    update_due_at_ms: Option<i64>,
    last_error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesIndexResultDto {
    collection: NotesCollectionDto,
    has_more: bool,
}

struct CollectionWatcher {
    watcher: RecommendedWatcher,
    root_watched: bool,
}

#[derive(Default)]
struct DesktopUpdateState {
    forced_document_ids: BTreeSet<String>,
    force_full_hash: bool,
    quiet_deadline_ms: i64,
    generation: u64,
    bypass_quiet_period: bool,
}

impl DesktopUpdateState {
    fn record_change(
        &mut self,
        now_ms: i64,
        forced_document_ids: impl IntoIterator<Item = String>,
        force_full_hash: bool,
    ) {
        self.forced_document_ids.extend(forced_document_ids);
        self.force_full_hash |= force_full_hash;
        self.quiet_deadline_ms = now_ms.saturating_add(NOTES_QUIET_PERIOD_MS);
        self.generation = self.generation.wrapping_add(1);
        self.bypass_quiet_period = false;
    }

    fn record_stale_reference(&mut self, now_ms: i64, document_id: String) -> bool {
        let deadline_changed = self.quiet_deadline_ms > now_ms;
        let document_changed =
            !self.force_full_hash && self.forced_document_ids.insert(document_id);
        if !deadline_changed && !document_changed {
            return false;
        }
        if document_changed {
            self.generation = self.generation.wrapping_add(1);
        }
        self.quiet_deadline_ms = now_ms;
        self.bypass_quiet_period = false;
        true
    }
}

#[derive(Default)]
struct UpdateSnapshot {
    generation: u64,
    forced_document_ids: Vec<String>,
    force_full_hash: bool,
    rebuild_derived_index: bool,
}

pub struct State {
    registry: Arc<Mutex<RegistryStore>>,
    runtimes: Arc<Mutex<HashMap<String, CollectionRuntime>>>,
    indexes: Arc<Mutex<HashMap<String, NotesCollectionIndex>>>,
    index_root: PathBuf,
    collection_lifecycles: Mutex<HashMap<String, Arc<async_runtime::Mutex<()>>>>,
    watchers: Mutex<HashMap<String, CollectionWatcher>>,
    updates: Mutex<HashMap<String, DesktopUpdateState>>,
}

#[derive(Clone)]
pub(crate) struct RetrievalHandle {
    registry: Arc<Mutex<RegistryStore>>,
    indexes: Arc<Mutex<HashMap<String, NotesCollectionIndex>>>,
}

impl State {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, ApiError> {
        let notes_directory = app_data_dir.join(NOTES_DIRECTORY);
        let index_root = notes_directory.join(NOTES_INDEX_DIRECTORY);
        ensure_directory(&index_root)?;
        let registry = RegistryStore::open(notes_directory)?;
        let mut runtimes = HashMap::new();
        let mut indexes = HashMap::new();
        for collection in &registry.registry.collections {
            let runtime = if !collection.source_root.is_dir() {
                CollectionRuntime::unavailable()
            } else {
                match NotesCollectionIndex::open(&index_root, collection.id.clone()) {
                    Ok(index) => {
                        let count = index.document_count();
                        if count == 0 {
                            CollectionRuntime {
                                status: NotesCollectionStatusDto::Error,
                                last_error: Some(
                                    "No supported non-empty UTF-8 notes were found".to_string(),
                                ),
                                ..CollectionRuntime::pending()
                            }
                        } else {
                            let last_updated_at_ms = index.last_updated_at_ms();
                            indexes.insert(collection.id.clone(), index);
                            CollectionRuntime {
                                status: NotesCollectionStatusDto::Ready,
                                index_available: true,
                                indexed_document_count: count as u64,
                                last_updated_at_ms,
                                ..CollectionRuntime::pending()
                            }
                        }
                    }
                    Err(NotesError::NotReady | NotesError::Io(_)) => CollectionRuntime::pending(),
                    Err(_) => CollectionRuntime {
                        status: NotesCollectionStatusDto::Error,
                        last_error: Some("The local index needs to be rebuilt".to_string()),
                        ..CollectionRuntime::pending()
                    },
                }
            };
            runtimes.insert(collection.id.clone(), runtime);
        }
        Ok(Self {
            registry: Arc::new(Mutex::new(registry)),
            runtimes: Arc::new(Mutex::new(runtimes)),
            indexes: Arc::new(Mutex::new(indexes)),
            index_root,
            collection_lifecycles: Mutex::new(HashMap::new()),
            watchers: Mutex::new(HashMap::new()),
            updates: Mutex::new(HashMap::new()),
        })
    }

    fn collection_lifecycle(&self, collection_id: &str) -> Arc<async_runtime::Mutex<()>> {
        Arc::clone(
            self.collection_lifecycles
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .entry(collection_id.to_string())
                .or_default(),
        )
    }

    fn registered_collection(&self, collection_id: &str) -> Result<RegisteredCollection, ApiError> {
        let store = self.registry.lock().unwrap_or_else(PoisonError::into_inner);
        store.ensure_compatible()?;
        store
            .registry
            .collections
            .iter()
            .find(|collection| collection.id == collection_id)
            .cloned()
            .ok_or_else(|| ApiError::new("not_found", "Notes collection was not found"))
    }

    fn collection_dto(&self, collection_id: &str) -> Result<NotesCollectionDto, ApiError> {
        let collection = self.registered_collection(collection_id)?;
        let runtime = self
            .runtimes
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(collection_id)
            .cloned()
            .unwrap_or_else(CollectionRuntime::pending);
        let update_due_at_ms = self
            .updates
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(collection_id)
            .map(|update| update.quiet_deadline_ms);
        Ok(collection_dto(&collection, &runtime, update_due_at_ms))
    }

    fn set_runtime(&self, collection_id: &str, runtime: CollectionRuntime) {
        self.runtimes
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .insert(collection_id.to_string(), runtime);
    }

    fn runtime(&self, collection_id: &str) -> CollectionRuntime {
        self.runtimes
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(collection_id)
            .cloned()
            .unwrap_or_else(CollectionRuntime::pending)
    }

    fn prepare_update(
        &self,
        collection_id: &str,
        force: bool,
        wait_for_quiet_period: bool,
    ) -> Result<UpdateSnapshot, ApiError> {
        let mut updates = self.updates.lock().unwrap_or_else(PoisonError::into_inner);
        let Some(update) = updates.get_mut(collection_id) else {
            return Ok(UpdateSnapshot::default());
        };
        if force {
            update.bypass_quiet_period = true;
        }
        if !force
            && wait_for_quiet_period
            && !update.bypass_quiet_period
            && update.quiet_deadline_ms > now_ms()
        {
            return Err(ApiError::new(
                "not_due",
                "Notes update is waiting for the quiet period",
            ));
        }
        Ok(UpdateSnapshot {
            generation: update.generation,
            forced_document_ids: update.forced_document_ids.iter().cloned().collect(),
            force_full_hash: update.force_full_hash,
            rebuild_derived_index: false,
        })
    }

    fn cancel_update(&self, collection_id: &str) {
        self.updates
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .remove(collection_id);
    }

    fn has_open_index(&self, collection_id: &str) -> bool {
        self.indexes
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .contains_key(collection_id)
    }

    fn has_pending_update(&self, collection_id: &str) -> bool {
        self.updates
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .contains_key(collection_id)
    }

    fn has_newer_update(&self, collection_id: &str, generation: u64) -> bool {
        self.updates
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(collection_id)
            .is_some_and(|update| update.generation != generation)
    }

    fn retain_unchecked_hints(
        &self,
        collection_id: &str,
        generation: u64,
        unchecked_document_ids: &[String],
    ) {
        let mut updates = self.updates.lock().unwrap_or_else(PoisonError::into_inner);
        let Some(update) = updates.get_mut(collection_id) else {
            return;
        };
        if update.generation != generation {
            return;
        }
        update.forced_document_ids = unchecked_document_ids.iter().cloned().collect();
        update.force_full_hash = false;
    }

    fn apply_index_outcome(
        &self,
        collection_id: &str,
        update_generation: u64,
        outcome: &IndexSliceOutcome,
        had_index: bool,
        completed_index_updated_at_ms: Option<i64>,
    ) -> (bool, bool) {
        let mut updates = self.updates.lock().unwrap_or_else(PoisonError::into_inner);
        let generation_unchanged = updates
            .get(collection_id)
            .is_none_or(|update| update.generation == update_generation);
        let reconciliation_complete =
            !outcome.has_more && outcome.changed_during_indexing.is_none();
        let ready = outcome.ready();
        let update_completed = reconciliation_complete && generation_unchanged;
        if update_completed {
            updates.remove(collection_id);
        }
        let continue_slices = (!had_index && !generation_unchanged)
            || (outcome.has_more
                && outcome.changed_during_indexing.is_none()
                && generation_unchanged);
        let mut runtime = self.runtime(collection_id);
        if update_completed {
            runtime.index_available = ready;
            runtime.last_updated_at_ms = ready.then_some(completed_index_updated_at_ms).flatten();
        }
        runtime.indexing_progress = continue_slices
            .then_some(runtime.indexing_progress)
            .flatten();
        runtime.indexed_document_count = outcome.indexed_document_count;
        runtime.status = if update_completed && ready {
            NotesCollectionStatusDto::Ready
        } else if update_completed {
            NotesCollectionStatusDto::Error
        } else if continue_slices {
            if had_index {
                NotesCollectionStatusDto::Updating
            } else {
                NotesCollectionStatusDto::Indexing
            }
        } else {
            NotesCollectionStatusDto::Pending
        };
        runtime.last_error = (update_completed && !ready)
            .then(|| "No supported non-empty UTF-8 notes were found".to_string());
        self.set_runtime(collection_id, runtime);
        (continue_slices, update_completed)
    }

    fn report_indexing_progress(app: &AppHandle, collection_id: &str, progress: u8) {
        let state = app.state::<State>();
        let mut runtime = state.runtime(collection_id);
        if !matches!(
            runtime.status,
            NotesCollectionStatusDto::Indexing | NotesCollectionStatusDto::Updating
        ) || runtime.indexing_progress == Some(progress)
        {
            return;
        }
        runtime.indexing_progress = Some(progress);
        state.set_runtime(collection_id, runtime);
        emit_state_changed(app, collection_id);
    }

    pub(crate) fn available_open_index_collection_ids(&self) -> Vec<String> {
        let open_ids = self
            .indexes
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .keys()
            .cloned()
            .collect::<BTreeSet<_>>();
        let collections = self
            .registry
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .registry
            .collections
            .clone();
        collections
            .into_iter()
            .filter(|collection| {
                open_ids.contains(&collection.id)
                    && source_root_is_available(&collection.source_root)
            })
            .map(|collection| collection.id)
            .collect()
    }

    pub(crate) fn retrieval_handle(&self) -> RetrievalHandle {
        RetrievalHandle {
            registry: Arc::clone(&self.registry),
            indexes: Arc::clone(&self.indexes),
        }
    }
}

#[derive(Default)]
struct WatchChange {
    forced_document_ids: BTreeSet<String>,
    force_full_hash: bool,
}

struct StartupInspection {
    initial_complete: bool,
    changed: bool,
}

pub fn initialize_for_app(app: &AppHandle) {
    let collections = app
        .state::<State>()
        .registry
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .registry
        .collections
        .clone();
    for collection in collections {
        if let Err(error) = install_collection_watcher(app, &collection) {
            let state = app.state::<State>();
            let mut runtime = state.runtime(&collection.id);
            runtime.status = if source_root_is_available(&collection.source_root) {
                NotesCollectionStatusDto::Error
            } else {
                NotesCollectionStatusDto::Unavailable
            };
            runtime.last_error = Some(error.message);
            state.set_runtime(&collection.id, runtime);
            emit_state_changed(app, &collection.id);
            continue;
        }
        inspect_collection_on_startup(app.clone(), collection);
    }
}

fn inspect_collection_on_startup(app: AppHandle, collection: RegisteredCollection) {
    let index_root = app.state::<State>().index_root.clone();
    async_runtime::spawn(async move {
        let lifecycle = app.state::<State>().collection_lifecycle(&collection.id);
        let _collection_lifecycle = lifecycle.lock().await;
        if app
            .state::<State>()
            .registered_collection(&collection.id)
            .is_err()
        {
            return;
        }
        let inspection_collection = collection.clone();
        let inspection = async_runtime::spawn_blocking(move || {
            inspect_startup_freshness(&index_root, &inspection_collection)
        })
        .await;
        let Ok(inspection) = inspection else {
            return;
        };
        let state = app.state::<State>();
        if state.registered_collection(&collection.id).is_err() {
            return;
        }
        if inspection.is_ok() && state.has_pending_update(&collection.id) {
            return;
        }
        match inspection {
            Ok(inspection) if inspection.changed && inspection.initial_complete => {
                mark_collection_dirty(&app, &collection.id, [], false);
            }
            Ok(inspection) => {
                let mut runtime = state.runtime(&collection.id);
                if !inspection.initial_complete {
                    runtime.status = NotesCollectionStatusDto::Pending;
                    runtime.last_error = None;
                } else if state.has_open_index(&collection.id) {
                    runtime.status = NotesCollectionStatusDto::Ready;
                    runtime.last_error = None;
                }
                state.set_runtime(&collection.id, runtime);
                emit_state_changed(&app, &collection.id);
            }
            Err(error) => {
                let mut runtime = state.runtime(&collection.id);
                runtime.status = if source_root_is_available(&collection.source_root) {
                    NotesCollectionStatusDto::Error
                } else {
                    NotesCollectionStatusDto::Unavailable
                };
                runtime.last_error = Some(error.message);
                state.set_runtime(&collection.id, runtime);
                emit_state_changed(&app, &collection.id);
            }
        }
    });
}

fn inspect_startup_freshness(
    index_root: &Path,
    collection: &RegisteredCollection,
) -> Result<StartupInspection, ApiError> {
    let canonical_root = canonical_source_root(&collection.source_root)?;
    if canonical_root != collection.source_root {
        return Err(ApiError::new(
            "source_changed",
            "Notes source folder identity changed",
        ));
    }
    let inventory = inventory_source_root(&canonical_root, || Ok(()))?;
    let writer = NotesIndexWriter::open(index_root, collection.id.clone()).map_err(notes_error)?;
    let plan = writer
        .plan_reconciliation(&inventory.documents, &[], false)
        .map_err(notes_error)?;
    Ok(StartupInspection {
        initial_complete: writer.initial_inventory_complete(),
        changed: !plan.is_up_to_date(),
    })
}

fn install_collection_watcher(
    app: &AppHandle,
    collection: &RegisteredCollection,
) -> Result<(), ApiError> {
    let collection_id = collection.id.clone();
    let source_root = collection.source_root.clone();
    let callback_app = app.clone();
    let callback_collection_id = collection_id.clone();
    let callback_root = source_root.clone();
    let mut watcher = RecommendedWatcher::new(
        move |result| {
            handle_watch_event(
                &callback_app,
                &callback_collection_id,
                &callback_root,
                result,
            );
        },
        Config::default(),
    )
    .map_err(notify_error)?;

    let mut root_watched = false;
    if source_root_is_available(&source_root) {
        watcher
            .watch(&source_root, RecursiveMode::Recursive)
            .map_err(notify_error)?;
        root_watched = true;
    }
    let parent_watched = source_root
        .parent()
        .is_some_and(|parent| watcher.watch(parent, RecursiveMode::NonRecursive).is_ok());
    if !root_watched && !parent_watched {
        return Err(ApiError::new(
            "watcher",
            "The Notes folder could not be watched",
        ));
    }
    app.state::<State>()
        .watchers
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .insert(
            collection_id,
            CollectionWatcher {
                watcher,
                root_watched,
            },
        );
    Ok(())
}

fn handle_watch_event(
    app: &AppHandle,
    collection_id: &str,
    source_root: &Path,
    result: notify::Result<Event>,
) {
    let change = match result {
        Ok(event) => classify_watch_event(source_root, &event),
        Err(_) => Some(WatchChange {
            force_full_hash: true,
            ..WatchChange::default()
        }),
    };
    let Some(change) = change else {
        return;
    };
    let event_app = app.clone();
    let event_collection_id = collection_id.to_string();
    let event_source_root = source_root.to_path_buf();
    async_runtime::spawn(async move {
        refresh_root_watch(&event_app, &event_collection_id, &event_source_root);
        mark_collection_dirty(
            &event_app,
            &event_collection_id,
            change.forced_document_ids,
            change.force_full_hash,
        );
    });
}

fn refresh_root_watch(app: &AppHandle, collection_id: &str, source_root: &Path) {
    let available = source_root_is_available(source_root);
    let state = app.state::<State>();
    let mut watchers = state
        .watchers
        .lock()
        .unwrap_or_else(PoisonError::into_inner);
    let Some(entry) = watchers.get_mut(collection_id) else {
        return;
    };
    if available && !entry.root_watched {
        entry.root_watched = entry
            .watcher
            .watch(source_root, RecursiveMode::Recursive)
            .is_ok();
    } else if !available && entry.root_watched {
        let _ = entry.watcher.unwatch(source_root);
        entry.root_watched = false;
    }
}

fn ensure_collection_watcher(
    app: &AppHandle,
    collection: &RegisteredCollection,
) -> Result<(), ApiError> {
    if !source_root_is_available(&collection.source_root) {
        return Err(ApiError::new(
            "source_unavailable",
            "Source folder is unavailable",
        ));
    }
    refresh_root_watch(app, &collection.id, &collection.source_root);
    let state = app.state::<State>();
    let root_watched = state
        .watchers
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .get(&collection.id)
        .is_some_and(|entry| entry.root_watched);
    if root_watched {
        return Ok(());
    }
    state
        .watchers
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .remove(&collection.id);
    install_collection_watcher(app, collection)
}

fn classify_watch_event(source_root: &Path, event: &Event) -> Option<WatchChange> {
    if matches!(event.kind, EventKind::Access(_)) {
        return None;
    }
    let ambiguous = matches!(
        event.kind,
        EventKind::Any
            | EventKind::Other
            | EventKind::Create(CreateKind::Folder)
            | EventKind::Remove(RemoveKind::Folder)
    );
    classify_watch_paths(source_root, &event.paths, ambiguous)
}

fn classify_watch_paths(
    source_root: &Path,
    paths: &[PathBuf],
    overflow_or_ambiguity: bool,
) -> Option<WatchChange> {
    if paths.is_empty() {
        return overflow_or_ambiguity.then_some(WatchChange {
            force_full_hash: true,
            ..WatchChange::default()
        });
    }
    let mut change = WatchChange::default();
    let mut saw_relevant_path = false;
    for path in paths {
        if path == source_root {
            saw_relevant_path = true;
            change.force_full_hash = true;
            continue;
        }
        let Ok(relative) = path.strip_prefix(source_root) else {
            continue;
        };
        if relative.components().any(|component| {
            matches!(component, Component::Normal(name) if name.to_string_lossy().starts_with('.'))
        }) {
            continue;
        }
        if fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
            continue;
        }
        saw_relevant_path = true;
        if is_supported_file(path) {
            if let Some(document_id) = relative_document_id(source_root, path) {
                change.forced_document_ids.insert(document_id);
            }
            continue;
        }
        if fs::symlink_metadata(path).is_ok_and(|metadata| metadata.is_dir()) {
            change.force_full_hash = true;
        }
    }
    change.force_full_hash |= overflow_or_ambiguity && saw_relevant_path;
    (!change.forced_document_ids.is_empty() || change.force_full_hash).then_some(change)
}

fn mark_collection_for_update(
    app: &AppHandle,
    collection_id: &str,
    record_update: impl FnOnce(&mut DesktopUpdateState) -> bool,
) {
    let state = app.state::<State>();
    let Ok(collection) = state.registered_collection(collection_id) else {
        return;
    };
    let changed = {
        let mut updates = state.updates.lock().unwrap_or_else(PoisonError::into_inner);
        let update = updates.entry(collection_id.to_string()).or_default();
        record_update(update)
    };
    if !changed {
        return;
    }

    let available = source_root_is_available(&collection.source_root);
    let mut runtime = state.runtime(collection_id);
    if !available
        && !matches!(
            runtime.status,
            NotesCollectionStatusDto::Indexing | NotesCollectionStatusDto::Updating
        )
    {
        runtime.status = NotesCollectionStatusDto::Unavailable;
    } else if available
        && matches!(
            runtime.status,
            NotesCollectionStatusDto::Unavailable | NotesCollectionStatusDto::Error
        )
    {
        runtime.status = if runtime.index_available {
            NotesCollectionStatusDto::Ready
        } else {
            NotesCollectionStatusDto::Pending
        };
    }
    runtime.last_error = (!available).then(|| "Source folder is unavailable".to_string());
    state.set_runtime(collection_id, runtime);
    emit_state_changed(app, collection_id);
}

pub(crate) fn mark_collection_dirty(
    app: &AppHandle,
    collection_id: &str,
    forced_document_ids: impl IntoIterator<Item = String>,
    force_full_hash: bool,
) {
    mark_collection_for_update(app, collection_id, move |update| {
        update.record_change(now_ms(), forced_document_ids, force_full_hash);
        true
    });
}

pub(crate) fn mark_reference_stale(app: &AppHandle, collection_id: &str, document_id: String) {
    mark_collection_for_update(app, collection_id, move |update| {
        update.record_stale_reference(now_ms(), document_id)
    });
}

fn emit_state_changed(app: &AppHandle, collection_id: &str) {
    let state = app.state::<State>();
    if let Ok(collection) = state.collection_dto(collection_id) {
        let _ = app.emit(NOTES_STATE_CHANGED_EVENT, collection);
    }
}

fn source_root_is_available(source_root: &Path) -> bool {
    canonical_source_root(source_root).is_ok_and(|canonical| canonical == source_root)
}

fn notify_error(_: notify::Error) -> ApiError {
    ApiError::new("watcher", "The Notes folder could not be watched")
}

impl RetrievalHandle {
    pub(crate) fn collection_label(&self, collection_id: &str) -> Option<String> {
        self.registry
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .registry
            .collections
            .iter()
            .find(|collection| collection.id == collection_id)
            .map(|collection| compact_source_location(&collection.source_root))
    }

    pub(crate) fn search_collection(
        &self,
        collection_id: &str,
        query: &[f32],
    ) -> Result<Vec<ente_ensu::notes::NotesSearchHit>, NotesError> {
        let indexes = self.indexes.lock().unwrap_or_else(PoisonError::into_inner);
        let Some(index) = indexes.get(collection_id) else {
            return Ok(Vec::new());
        };
        index.search(query)
    }

    pub(crate) fn verify_source_reference(&self, reference: &NoteSourceReference) -> bool {
        let collection = self
            .registry
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .registry
            .collections
            .iter()
            .find(|collection| collection.id == reference.collection_id)
            .cloned();
        let Some(collection) = collection else {
            return false;
        };
        resolve_document_path(&collection.source_root, &reference.document_id)
            .and_then(|path| read_supported_source(&path))
            .map(|bytes| notes_content_revision(&bytes) == reference.indexed_revision)
            .unwrap_or(false)
    }
}

fn collection_dto(
    collection: &RegisteredCollection,
    runtime: &CollectionRuntime,
    update_due_at_ms: Option<i64>,
) -> NotesCollectionDto {
    NotesCollectionDto {
        id: collection.id.clone(),
        label: compact_source_location(&collection.source_root),
        status: runtime.status,
        indexing_progress: runtime.indexing_progress,
        indexed_document_count: runtime.indexed_document_count,
        last_updated_at_ms: runtime.last_updated_at_ms,
        update_due_at_ms,
        last_error: runtime.last_error.clone(),
    }
}

#[tauri::command]
pub fn notes_list_collections(
    notes_state: TauriState<'_, State>,
) -> Result<Vec<NotesCollectionDto>, ApiError> {
    let store = notes_state
        .registry
        .lock()
        .unwrap_or_else(PoisonError::into_inner);
    store.ensure_compatible()?;
    let collections = store.registry.collections.clone();
    drop(store);
    let runtimes = notes_state
        .runtimes
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clone();
    let updates = notes_state
        .updates
        .lock()
        .unwrap_or_else(PoisonError::into_inner);
    Ok(collections
        .iter()
        .map(|collection| {
            collection_dto(
                collection,
                &runtimes
                    .get(&collection.id)
                    .cloned()
                    .unwrap_or_else(CollectionRuntime::pending),
                updates
                    .get(&collection.id)
                    .map(|update| update.quiet_deadline_ms),
            )
        })
        .collect())
}

#[tauri::command]
pub fn notes_has_available_index(notes_state: TauriState<'_, State>) -> bool {
    !notes_state.available_open_index_collection_ids().is_empty()
}

#[tauri::command]
pub fn notes_add_collection(
    app: AppHandle,
    notes_state: TauriState<'_, State>,
    source_root: String,
) -> Result<NotesCollectionDto, ApiError> {
    let root = canonical_source_root(Path::new(&source_root))?;
    let collection = RegisteredCollection {
        id: Uuid::new_v4().hyphenated().to_string(),
        source_root: root,
    };
    {
        let mut store = notes_state
            .registry
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        validate_new_source_root(&store.registry.collections, &collection.source_root)?;
        let mut registry = store.registry.clone();
        registry.collections.push(collection.clone());
        store.replace(registry)?;
    }
    notes_state.set_runtime(&collection.id, CollectionRuntime::pending());
    if let Err(error) = install_collection_watcher(&app, &collection) {
        notes_state.set_runtime(
            &collection.id,
            CollectionRuntime {
                status: NotesCollectionStatusDto::Error,
                last_error: Some(error.message),
                ..CollectionRuntime::pending()
            },
        );
    }
    notes_state.collection_dto(&collection.id)
}

#[tauri::command]
pub async fn notes_remove_collection(
    notes_state: TauriState<'_, State>,
    collection_id: String,
) -> Result<(), ApiError> {
    let lifecycle = notes_state.collection_lifecycle(&collection_id);
    let _lifecycle = lifecycle.lock().await;
    let collection = notes_state.registered_collection(&collection_id)?;
    let derived_directory = notes_state.index_root.join(&collection.id);
    if path_exists(&derived_directory)? {
        remove_owned_entry(&derived_directory)?;
    }
    {
        let mut store = notes_state
            .registry
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let mut registry = store.registry.clone();
        registry
            .collections
            .retain(|candidate| candidate.id != collection_id);
        store.replace(registry)?;
    }
    notes_state
        .watchers
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .remove(&collection_id);
    notes_state.cancel_update(&collection_id);
    notes_state
        .indexes
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .remove(&collection_id);
    notes_state
        .runtimes
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .remove(&collection_id);
    notes_state
        .collection_lifecycles
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .remove(&collection_id);
    Ok(())
}

fn report_index_error(
    app: &AppHandle,
    state: &State,
    collection_id: &str,
    update_generation: Option<u64>,
    error: &ApiError,
) {
    let cancelled = error.name == Some("cancelled");
    let unavailable = matches!(
        error.name,
        Some("unavailable" | "source_unavailable" | "source_changed")
    );
    let superseded_file_error = error.name == Some("source_unavailable")
        && update_generation.is_some_and(|generation| {
            state.has_newer_update(collection_id, generation)
                && state
                    .registered_collection(collection_id)
                    .is_ok_and(|collection| source_root_is_available(&collection.source_root))
        });
    let mut runtime = state.runtime(collection_id);
    runtime.indexing_progress = None;
    runtime.status = if cancelled || superseded_file_error {
        NotesCollectionStatusDto::Pending
    } else if unavailable {
        NotesCollectionStatusDto::Unavailable
    } else {
        NotesCollectionStatusDto::Error
    };
    runtime.last_error = (!cancelled && !superseded_file_error).then(|| error.message.clone());
    state.set_runtime(collection_id, runtime);
    emit_state_changed(app, collection_id);
}

#[tauri::command]
pub async fn notes_index_collection(
    app: AppHandle,
    model_state: TauriState<'_, ModelDownloadState>,
    llm_state: TauriState<'_, crate::commands::llm::State>,
    notes_state: TauriState<'_, State>,
    collection_id: String,
    force: bool,
    retrieval_epoch: u64,
) -> Result<NotesIndexResultDto, ApiError> {
    let lifecycle = notes_state.collection_lifecycle(&collection_id);
    let _collection_lifecycle = lifecycle.lock().await;
    let collection = notes_state.registered_collection(&collection_id)?;
    if let Err(error) = ensure_collection_watcher(&app, &collection) {
        report_index_error(&app, &notes_state, &collection_id, None, &error);
        return Err(error);
    }
    let had_index = notes_state.has_open_index(&collection_id);
    let rebuild_derived_index =
        should_rebuild_derived_index(&notes_state.index_root, &collection_id, force)?;
    let mut update = notes_state.prepare_update(&collection_id, force, had_index)?;
    update.rebuild_derived_index = rebuild_derived_index;
    let cancellation_epoch = llm_state.retrieval_epoch();
    check_cancelled(&cancellation_epoch, retrieval_epoch)?;
    let _model_lifecycle = llm_state.lifecycle().lock().await;
    check_cancelled(&cancellation_epoch, retrieval_epoch)?;
    crate::commands::llm::replace_state(&llm_state, None, None)?;

    let mut runtime = notes_state.runtime(&collection_id);
    if !matches!(
        runtime.status,
        NotesCollectionStatusDto::Indexing | NotesCollectionStatusDto::Updating
    ) {
        runtime.indexing_progress = Some(0);
    }
    runtime.status = if had_index {
        NotesCollectionStatusDto::Updating
    } else {
        NotesCollectionStatusDto::Indexing
    };
    runtime.last_error = None;
    notes_state.set_runtime(&collection_id, runtime);
    emit_state_changed(&app, &collection_id);
    let store = model_state.store();
    let embedding_asset = model::knowledge_embedding_model_asset();
    let embedding_path = model::llm_model_path(&store, &embedding_asset);
    let index_root = notes_state.index_root.clone();
    let update_generation = update.generation;
    let progress_app = app.clone();
    let progress_collection_id = collection_id.clone();
    let result = async_runtime::spawn_blocking(move || {
        index_collection_slice(
            &index_root,
            &collection,
            embedding_path.as_deref(),
            &cancellation_epoch,
            retrieval_epoch,
            &update,
            |progress| {
                State::report_indexing_progress(&progress_app, &progress_collection_id, progress);
            },
        )
    })
    .await
    .map_err(|_| ApiError::new("index_thread", "Notes indexing task failed"))?;

    let outcome = match result {
        Ok(outcome) => outcome,
        Err(error) => {
            report_index_error(
                &app,
                &notes_state,
                &collection_id,
                Some(update_generation),
                &error,
            );
            return Err(error);
        }
    };

    let opened_index = if outcome.ready() {
        match NotesCollectionIndex::open(&notes_state.index_root, collection_id.clone()) {
            Ok(index) => Some(index),
            Err(error) => {
                let error = notes_error(error);
                report_index_error(
                    &app,
                    &notes_state,
                    &collection_id,
                    Some(update_generation),
                    &error,
                );
                return Err(error);
            }
        }
    } else {
        None
    };

    notes_state.retain_unchecked_hints(
        &collection_id,
        update_generation,
        &outcome.unchecked_document_ids,
    );
    if let Some(document_id) = outcome.changed_during_indexing.clone() {
        mark_collection_dirty(&app, &collection_id, [document_id], false);
    }
    let completed_index_updated_at_ms = opened_index
        .as_ref()
        .and_then(NotesCollectionIndex::last_updated_at_ms);
    let (continue_slices, update_completed) = notes_state.apply_index_outcome(
        &collection_id,
        update_generation,
        &outcome,
        had_index,
        completed_index_updated_at_ms,
    );
    if update_completed {
        if let Some(index) = opened_index {
            notes_state
                .indexes
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .insert(collection_id.clone(), index);
        } else {
            notes_state
                .indexes
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .remove(&collection_id);
        }
    }
    emit_state_changed(&app, &collection_id);
    let dto = notes_state.collection_dto(&collection_id)?;
    Ok(NotesIndexResultDto {
        collection: dto,
        has_more: continue_slices,
    })
}

#[tauri::command]
pub fn notes_open_document(
    app: AppHandle,
    notes_state: TauriState<'_, State>,
    collection_id: String,
    document_id: String,
) -> Result<(), ApiError> {
    let collection = notes_state.registered_collection(&collection_id)?;
    let path = resolve_document_path(&collection.source_root, &document_id)?;
    if !is_supported_file(&path) {
        return Err(ApiError::new(
            "invalid_document",
            "Unsupported note document",
        ));
    }
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<String>)
        .map_err(|_| ApiError::new("open_failed", "Source note could not be opened"))
}

struct Inventory {
    documents: Vec<NotesSourceDocument>,
    paths: BTreeMap<String, PathBuf>,
}

struct IndexSliceOutcome {
    has_more: bool,
    changed_during_indexing: Option<String>,
    unchecked_document_ids: Vec<String>,
    indexed_document_count: u64,
}

impl IndexSliceOutcome {
    fn ready(&self) -> bool {
        !self.has_more && self.changed_during_indexing.is_none() && self.indexed_document_count > 0
    }
}

fn index_collection_slice(
    index_root: &Path,
    collection: &RegisteredCollection,
    embedding_path: Option<&Path>,
    cancellation_epoch: &std::sync::atomic::AtomicU64,
    retrieval_epoch: u64,
    update: &UpdateSnapshot,
    mut on_progress: impl FnMut(u8),
) -> Result<IndexSliceOutcome, ApiError> {
    check_cancelled(cancellation_epoch, retrieval_epoch)?;
    let canonical_root = canonical_source_root(&collection.source_root)?;
    if canonical_root != collection.source_root {
        return Err(ApiError::new(
            "source_changed",
            "Notes source folder identity changed",
        ));
    }
    let inventory = inventory_source_root(&canonical_root, || {
        check_cancelled(cancellation_epoch, retrieval_epoch)
    })?;
    if update.rebuild_derived_index {
        let derived_directory = index_root.join(&collection.id);
        if path_exists(&derived_directory)? {
            remove_owned_entry(&derived_directory)?;
        }
    }
    let mut writer =
        NotesIndexWriter::open(index_root, collection.id.clone()).map_err(notes_error)?;
    let index_was_ready = writer.initial_inventory_complete();
    let plan = writer
        .plan_reconciliation(
            &inventory.documents,
            &update.forced_document_ids,
            update.force_full_hash,
        )
        .map_err(notes_error)?;
    writer
        .commit_deletions(&plan.deleted_document_ids)
        .map_err(notes_error)?;

    let source_document_count = inventory.documents.len() as u64;
    let requested = plan.content_required_document_ids;
    let mut progress_document_count = source_document_count.saturating_sub(requested.len() as u64);
    on_progress(indexing_progress(
        progress_document_count,
        source_document_count,
    ));
    let mut processed_requested = 0_usize;
    let mut embedded_documents = 0_usize;
    let mut embedded_chunks = 0_usize;
    let mut embedding_context = None;
    for document_id in &requested {
        check_cancelled(cancellation_epoch, retrieval_epoch)?;
        let source_metadata = inventory
            .documents
            .iter()
            .find(|source| source.document_id == *document_id)
            .expect("reconciliation returns a source inventory document");
        let path = inventory
            .paths
            .get(document_id)
            .expect("source inventory contains every document path");
        let prepared = match read_supported_source(path) {
            Ok(bytes) => prepare_notes_document(document_id, &bytes).ok(),
            Err(error) if error.name == Some("invalid_document") => None,
            Err(error)
                if error.name == Some("source_changed")
                    && source_root_is_available(&canonical_root) =>
            {
                return changed_during_indexing_outcome(
                    &mut writer,
                    index_was_ready,
                    document_id,
                    &requested,
                    processed_requested,
                );
            }
            Err(error) => return Err(error),
        };
        let Some(prepared) = prepared else {
            writer
                .commit_deletions(std::slice::from_ref(document_id))
                .map_err(notes_error)?;
            processed_requested += 1;
            progress_document_count += 1;
            on_progress(indexing_progress(
                progress_document_count,
                source_document_count,
            ));
            continue;
        };
        let embedding_path = embedding_path.ok_or_else(|| {
            ApiError::new(
                "embedding_missing",
                "The knowledge embedding model is not downloaded",
            )
        })?;
        if embedding_context.is_none() {
            let model = llm::Model::load(llm::ModelLoadParams {
                model_path: embedding_path.display().to_string(),
                n_gpu_layers: Some(0),
                use_mmap: Some(true),
                use_mlock: Some(false),
            })
            .map_err(crate::commands::llm::llm_api_error)?;
            let threads = std::thread::available_parallelism()
                .map(|count| count.get().saturating_sub(1).max(1))
                .unwrap_or(1);
            embedding_context = Some(
                llm::Context::new_knowledge_embedding(
                    &model,
                    Some(i32::try_from(threads).unwrap_or(1)),
                )
                .map_err(crate::commands::llm::llm_api_error)?,
            );
        }
        let context = embedding_context
            .as_ref()
            .expect("embedding context was initialized");
        let mut embeddings = Vec::with_capacity(prepared.chunks.len());
        for chunk in &prepared.chunks {
            check_cancelled(cancellation_epoch, retrieval_epoch)?;
            let embedding_title = match chunk.section.as_deref() {
                Some(section) if section != prepared.title => {
                    format!("{} — {section}", prepared.title)
                }
                _ => prepared.title.clone(),
            };
            embeddings.push(
                context
                    .embed_document(&embedding_title, &chunk.text)
                    .map_err(crate::commands::llm::llm_api_error)?,
            );
        }
        check_cancelled(cancellation_epoch, retrieval_epoch)?;
        let current_bytes = match read_supported_source(path) {
            Ok(bytes) => bytes,
            Err(error)
                if error.name == Some("source_changed")
                    && source_root_is_available(&canonical_root) =>
            {
                return changed_during_indexing_outcome(
                    &mut writer,
                    index_was_ready,
                    document_id,
                    &requested,
                    processed_requested,
                );
            }
            Err(error) => return Err(error),
        };
        if notes_content_revision(&current_bytes) != prepared.revision {
            return changed_during_indexing_outcome(
                &mut writer,
                index_was_ready,
                document_id,
                &requested,
                processed_requested,
            );
        }
        writer
            .commit_document(&prepared, &embeddings, source_metadata)
            .map_err(notes_error)?;
        processed_requested += 1;
        progress_document_count += 1;
        on_progress(indexing_progress(
            progress_document_count,
            source_document_count,
        ));
        embedded_documents += 1;
        embedded_chunks += prepared.chunks.len();
        if embedded_documents >= MAX_DOCUMENTS_PER_INDEX_SLICE
            || embedded_chunks >= TARGET_CHUNKS_PER_INDEX_SLICE
        {
            break;
        }
    }

    let has_more = embedded_documents > 0 && processed_requested < requested.len();
    writer
        .publish(index_was_ready || !has_more)
        .map_err(notes_error)?;
    Ok(IndexSliceOutcome {
        has_more,
        changed_during_indexing: None,
        unchecked_document_ids: requested.into_iter().skip(processed_requested).collect(),
        indexed_document_count: writer.indexed_document_ids().count() as u64,
    })
}

fn indexing_progress(processed_document_count: u64, source_document_count: u64) -> u8 {
    if source_document_count == 0 {
        return 100;
    }
    (processed_document_count
        .min(source_document_count)
        .saturating_mul(100)
        / source_document_count) as u8
}

fn changed_during_indexing_outcome(
    writer: &mut NotesIndexWriter,
    index_was_ready: bool,
    document_id: &str,
    requested: &[String],
    processed_requested: usize,
) -> Result<IndexSliceOutcome, ApiError> {
    writer.publish(index_was_ready).map_err(notes_error)?;
    Ok(IndexSliceOutcome {
        has_more: false,
        changed_during_indexing: Some(document_id.to_string()),
        unchecked_document_ids: requested
            .iter()
            .skip(processed_requested)
            .cloned()
            .collect(),
        indexed_document_count: writer.indexed_document_ids().count() as u64,
    })
}

fn inventory_source_root(
    root: &Path,
    mut check_for_cancellation: impl FnMut() -> Result<(), ApiError>,
) -> Result<Inventory, ApiError> {
    let mut directories = vec![root.to_path_buf()];
    let mut documents = Vec::new();
    let mut paths = BTreeMap::new();
    while let Some(directory) = directories.pop() {
        check_for_cancellation()?;
        let entries = fs::read_dir(&directory).map_err(source_scan_error)?;
        for entry in entries {
            check_for_cancellation()?;
            let entry = entry.map_err(source_scan_error)?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            if name.starts_with('.') {
                continue;
            }
            let path = entry.path();
            let metadata = fs::symlink_metadata(&path).map_err(source_scan_error)?;
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                directories.push(path);
                continue;
            }
            if !metadata.is_file() || !is_supported_file(&path) {
                continue;
            }
            if metadata.len() > NOTES_MAX_SOURCE_BYTES as u64 {
                continue;
            }
            let Some(document_id) = relative_document_id(root, &path) else {
                continue;
            };
            let modified_at_ms = metadata.modified().ok().and_then(system_time_ms);
            let source = NotesSourceDocument {
                document_id: document_id.clone(),
                size: metadata.len(),
                modified_at_ms,
            };
            paths.insert(document_id, path);
            documents.push(source);
        }
    }
    documents.sort_by(|left, right| left.document_id.cmp(&right.document_id));
    Ok(Inventory { documents, paths })
}

fn should_rebuild_derived_index(
    index_root: &Path,
    collection_id: &str,
    force: bool,
) -> Result<bool, ApiError> {
    if !force {
        return Ok(false);
    }
    match NotesCollectionIndex::open(index_root, collection_id.to_string()) {
        Ok(_) | Err(NotesError::NotReady) => Ok(false),
        Err(NotesError::InvalidIndex(_) | NotesError::IncompatibleIndex | NotesError::Json(_)) => {
            Ok(true)
        }
        Err(NotesError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(notes_error(error)),
    }
}

fn relative_document_id(root: &Path, path: &Path) -> Option<String> {
    let document_id = path
        .strip_prefix(root)
        .ok()?
        .components()
        .map(|component| match component {
            Component::Normal(value) => value.to_str(),
            _ => None,
        })
        .collect::<Option<Vec<_>>>()?
        .join("/");
    validate_document_id(&document_id)
        .is_ok()
        .then_some(document_id)
}

fn resolve_document_path(root: &Path, document_id: &str) -> Result<PathBuf, ApiError> {
    validate_document_id(document_id)
        .map_err(|_| ApiError::new("invalid_document", "Invalid note document ID"))?;
    let mut path = root.to_path_buf();
    for component in document_id.split('/') {
        path.push(component);
        let metadata = fs::symlink_metadata(&path)
            .map_err(|_| ApiError::new("source_unavailable", "Source note is unavailable"))?;
        if metadata.file_type().is_symlink() {
            return Err(ApiError::new(
                "invalid_document",
                "Source note path is not allowed",
            ));
        }
    }
    let metadata = fs::symlink_metadata(&path)
        .map_err(|_| ApiError::new("source_unavailable", "Source note is unavailable"))?;
    if !metadata.is_file() || metadata.len() > NOTES_MAX_SOURCE_BYTES as u64 {
        return Err(ApiError::new(
            "invalid_document",
            "Source note is not supported",
        ));
    }
    let canonical = fs::canonicalize(&path)
        .map_err(|_| ApiError::new("source_unavailable", "Source note is unavailable"))?;
    if !canonical.starts_with(root) {
        return Err(ApiError::new(
            "invalid_document",
            "Source note escaped its collection",
        ));
    }
    Ok(canonical)
}

fn read_supported_source(path: &Path) -> Result<Vec<u8>, ApiError> {
    let metadata = fs::symlink_metadata(path).map_err(source_file_error)?;
    if !metadata.is_file() || metadata.len() > NOTES_MAX_SOURCE_BYTES as u64 {
        return Err(ApiError::new(
            "invalid_document",
            "Source note is not supported",
        ));
    }
    let bytes = fs::read(path).map_err(source_file_error)?;
    if bytes.len() > NOTES_MAX_SOURCE_BYTES {
        return Err(ApiError::new(
            "invalid_document",
            "Source note is too large",
        ));
    }
    Ok(bytes)
}

fn source_file_error(error: std::io::Error) -> ApiError {
    if error.kind() == std::io::ErrorKind::NotFound {
        ApiError::new(
            "source_changed",
            "Source note changed while it was being indexed",
        )
    } else {
        ApiError::new("source_io", "Source note could not be read")
    }
}

fn canonical_source_root(path: &Path) -> Result<PathBuf, ApiError> {
    if path.as_os_str().is_empty() {
        return Err(ApiError::new("invalid_folder", "Choose a Notes folder"));
    }
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| ApiError::new("unavailable", "The selected folder is unavailable"))?;
    if !metadata.is_dir() {
        return Err(ApiError::new(
            "invalid_folder",
            "Choose a folder, not a file",
        ));
    }
    let canonical = fs::canonicalize(path)
        .map_err(|_| ApiError::new("unavailable", "The selected folder is unavailable"))?;
    if canonical.to_str().is_none() {
        return Err(ApiError::new(
            "invalid_folder",
            "The selected folder name is not supported",
        ));
    }
    Ok(canonical)
}

fn compact_source_location(root: &Path) -> String {
    root.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("Selected folder")
        .to_string()
}

fn validate_new_source_root(
    collections: &[RegisteredCollection],
    source_root: &Path,
) -> Result<(), ApiError> {
    for existing in collections {
        if source_root == existing.source_root {
            return Err(ApiError::new(
                "duplicate",
                "That folder is already in Your Notes",
            ));
        }
        if source_root.starts_with(&existing.source_root)
            || existing.source_root.starts_with(source_root)
        {
            return Err(ApiError::new(
                "nested",
                "Notes collection folders must not contain one another",
            ));
        }
    }
    Ok(())
}

fn is_supported_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(extension.to_ascii_lowercase().as_str(), "md" | "markdown")
        })
}

fn check_cancelled(
    cancellation_epoch: &std::sync::atomic::AtomicU64,
    retrieval_epoch: u64,
) -> Result<(), ApiError> {
    if cancellation_epoch.load(Ordering::Relaxed) == retrieval_epoch {
        Ok(())
    } else {
        Err(ApiError::new("cancelled", "Notes indexing cancelled"))
    }
}

fn notes_error(error: NotesError) -> ApiError {
    let (code, message) = match error {
        NotesError::InvalidInput(_) => ("invalid_input", "Notes input is invalid"),
        NotesError::InvalidIndex(_) => ("invalid_index", "The Notes index is invalid"),
        NotesError::IncompatibleIndex => {
            ("incompatible_index", "The Notes index needs to be rebuilt")
        }
        NotesError::NotReady => ("not_ready", "The Notes collection is not ready"),
        NotesError::Io(_) => ("io", "The Notes index could not be accessed"),
        NotesError::Json(_) => ("json", "The Notes index could not be read"),
    };
    ApiError::new(code, message)
}

fn validate_registry(registry: &RegistryFile) -> Result<(), ApiError> {
    if registry.schema_version != NOTES_REGISTRY_SCHEMA_VERSION {
        return Err(ApiError::new(
            "incompatible_registry",
            "This version of Ensu cannot use the existing Notes registry",
        ));
    }
    let mut ids = std::collections::BTreeSet::new();
    let mut roots = Vec::<&Path>::new();
    for collection in &registry.collections {
        Uuid::parse_str(&collection.id)
            .map_err(|_| ApiError::new("registry", "Notes registry collection ID is invalid"))?;
        if !collection.source_root.is_absolute()
            || collection.source_root.to_str().is_none()
            || !ids.insert(&collection.id)
        {
            return Err(ApiError::new(
                "invalid_registry",
                "The Notes registry is invalid",
            ));
        }
        if roots.iter().any(|root| {
            collection.source_root.starts_with(root) || root.starts_with(&collection.source_root)
        }) {
            return Err(ApiError::new(
                "invalid_registry",
                "The Notes registry is invalid",
            ));
        }
        roots.push(&collection.source_root);
    }
    Ok(())
}

fn open_registry_file(directory: &Path) -> Result<RegistryFile, ApiError> {
    recover_registry_publication(directory)?;
    let path = directory.join(NOTES_REGISTRY_FILE);
    if !path_exists(&path)? {
        return Ok(RegistryFile::default());
    }
    load_valid_registry_file(&path)
}

fn load_valid_registry_file(path: &Path) -> Result<RegistryFile, ApiError> {
    let registry = load_registry_file(path)?;
    validate_registry(&registry)?;
    Ok(registry)
}

fn is_registry_content_error(error: &ApiError) -> bool {
    matches!(error.name, Some("registry" | "invalid_registry"))
}

fn quarantine_invalid_registry_files(directory: &Path) -> Result<(), ApiError> {
    for name in [NOTES_REGISTRY_FILE, NOTES_REGISTRY_BACKUP_FILE] {
        let path = directory.join(name);
        if path_exists(&path)? {
            let quarantined =
                directory.join(format!("{name}.invalid-{}", Uuid::new_v4().hyphenated()));
            fs::rename(path, quarantined).map_err(io_error)?;
        }
    }
    Ok(())
}

fn load_registry_file(path: &Path) -> Result<RegistryFile, ApiError> {
    let metadata = fs::symlink_metadata(path).map_err(io_error)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_REGISTRY_BYTES {
        return Err(ApiError::new(
            "invalid_registry",
            "The Notes registry is invalid",
        ));
    }
    let bytes = fs::read(path).map_err(io_error)?;
    let header = serde_json::from_slice::<RegistryHeader>(&bytes)
        .map_err(|_| ApiError::new("invalid_registry", "The Notes registry is invalid"))?;
    if header.schema_version != NOTES_REGISTRY_SCHEMA_VERSION {
        return Err(ApiError::new(
            "incompatible_registry",
            "This version of Ensu cannot use the existing Notes registry",
        ));
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| ApiError::new("invalid_registry", "The Notes registry is invalid"))
}

fn publish_registry(directory: &Path, registry: &RegistryFile) -> Result<(), ApiError> {
    let active = directory.join(NOTES_REGISTRY_FILE);
    let backup = directory.join(NOTES_REGISTRY_BACKUP_FILE);
    if path_exists(&backup)? {
        remove_owned_entry(&backup)?;
    }
    let temporary = directory.join(format!(".collections.tmp-{}", Uuid::new_v4().hyphenated()));
    let mut bytes = serde_json::to_vec_pretty(registry)
        .map_err(|_| ApiError::new("json", "The Notes registry could not be written"))?;
    bytes.push(b'\n');
    write_new_file(&temporary, &bytes)?;
    load_registry_file(&temporary)?;
    let had_active = path_exists(&active)?;
    if had_active {
        fs::rename(&active, &backup).map_err(io_error)?;
    }
    if let Err(error) = fs::rename(&temporary, &active) {
        if had_active && path_exists(&backup).unwrap_or(false) {
            let _ = fs::rename(&backup, &active);
        }
        let _ = fs::remove_file(&temporary);
        return Err(io_error(error));
    }
    if path_exists(&backup)? {
        remove_owned_entry(&backup)?;
    }
    Ok(())
}

fn recover_registry_publication(directory: &Path) -> Result<(), ApiError> {
    let active = directory.join(NOTES_REGISTRY_FILE);
    let backup = directory.join(NOTES_REGISTRY_BACKUP_FILE);
    match (path_exists(&active)?, path_exists(&backup)?) {
        (false, true) => {
            load_valid_registry_file(&backup)?;
            fs::rename(&backup, &active).map_err(io_error)?;
        }
        (true, true) => match load_valid_registry_file(&active) {
            Ok(_) => remove_owned_entry(&backup)?,
            Err(error) if error.name == Some("incompatible_registry") => return Err(error),
            Err(_) => {
                load_valid_registry_file(&backup)?;
                remove_owned_entry(&active)?;
                fs::rename(&backup, &active).map_err(io_error)?;
            }
        },
        _ => {}
    }
    for entry in fs::read_dir(directory).map_err(io_error)? {
        let entry = entry.map_err(io_error)?;
        if entry
            .file_name()
            .to_string_lossy()
            .starts_with(".collections.tmp-")
        {
            remove_owned_entry(&entry.path())?;
        }
    }
    Ok(())
}

fn ensure_directory(path: &Path) -> Result<(), ApiError> {
    if !path_exists(path)? {
        fs::create_dir_all(path).map_err(io_error)?;
    }
    if !fs::symlink_metadata(path).map_err(io_error)?.is_dir() {
        return Err(ApiError::new(
            "invalid_path",
            "Notes storage path is invalid",
        ));
    }
    #[cfg(unix)]
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(io_error)?;
    Ok(())
}

fn write_new_file(path: &Path, bytes: &[u8]) -> Result<(), ApiError> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    options.mode(0o600);
    let mut file = options.open(path).map_err(io_error)?;
    file.write_all(bytes).map_err(io_error)?;
    file.sync_all().map_err(io_error)
}

fn path_exists(path: &Path) -> Result<bool, ApiError> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(io_error(error)),
    }
}

fn remove_owned_entry(path: &Path) -> Result<(), ApiError> {
    let metadata = fs::symlink_metadata(path).map_err(io_error)?;
    if metadata.is_dir() {
        fs::remove_dir_all(path).map_err(io_error)
    } else {
        fs::remove_file(path).map_err(io_error)
    }
}

fn io_error(_: std::io::Error) -> ApiError {
    ApiError::new("io", "Notes storage operation failed")
}

fn source_scan_error(_: std::io::Error) -> ApiError {
    ApiError::new(
        "source_unavailable",
        "Notes source folder could not be read",
    )
}

fn now_ms() -> i64 {
    system_time_ms(SystemTime::now()).unwrap_or(0)
}

fn system_time_ms(time: SystemTime) -> Option<i64> {
    let millis = time.duration_since(UNIX_EPOCH).ok()?.as_millis();
    i64::try_from(millis).ok()
}

pub(crate) fn clear_for_exit(app: &AppHandle) {
    let Some(state) = app.try_state::<State>() else {
        return;
    };
    state
        .watchers
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clear();
    state
        .updates
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clear();
    state
        .indexes
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clear();
}
