use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use ente_core::crypto;
use ente_ensu::db::{self, ChatDb, Error as DbError, SqliteBackend};
use serde::{Deserialize, Serialize};
use tauri::async_runtime;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::commands::common::{ApiError, app_data_dir};
use crate::logging;

#[derive(Default)]
pub struct ChatDbState {
    inner: Arc<Mutex<Option<ChatDbHolder>>>,
}

struct ChatDbHolder {
    key_b64: String,
    db: Arc<ChatDb<SqliteBackend>>,
}

const CHAT_DB_FILE_NAME: &str = "ensu_llmchat_v2.db";
const ATTACHMENTS_DIR_NAME: &str = "ensu_llmchat_attachments_v2";
const V1_CHAT_DB_FILE_NAME: &str = "ensu_llmchat.db";
const V1_ATTACHMENTS_DB_FILE_NAME: &str = "llmchat_sync.db";
const V1_ATTACHMENTS_DIR_NAME: &str = "ensu_llmchat_attachments";

fn chat_db_thread_error() -> ApiError {
    ApiError::new("db_thread", "Chat DB task failed")
}

fn image_thread_error() -> ApiError {
    ApiError::new("image_thread", "Image task failed")
}

impl From<DbError> for ApiError {
    fn from(error: DbError) -> Self {
        use db::Error as E;

        let code = match &error {
            E::InvalidKeyLength { .. } => "db_invalid_key_length",
            E::InvalidBlobLength { .. } => "db_invalid_blob_length",
            E::InvalidEncryptedField => "db_invalid_encrypted_field",
            E::UnsupportedValueType(_) => "db_unsupported_value_type",
            E::Row(_) => "db_row",
            E::InvalidSender(_) => "db_invalid_sender",
            E::NotFound { .. } => "db_not_found",
            E::Crypto(_) => "db_crypto",
            E::SerdeJson(_) => "db_serde_json",
            E::Uuid(_) => "db_uuid",
            E::Utf8(_) => "db_utf8",
            E::Io(_) => "db_io",
            E::ReadonlyDatabase => "db_readonly",
            E::Sqlite(_) => "db_sqlite",
            E::UnsupportedOperation(_) => "db_unsupported_operation",
            E::Migration(_) => "db_migration",
        };

        ApiError::new(code, error.to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSessionDto {
    session_uuid: String,
    title: String,
    created_at: i64,
    updated_at: i64,
}

impl From<db::Session> for ChatSessionDto {
    fn from(session: db::Session) -> Self {
        Self {
            session_uuid: session.uuid.to_string(),
            title: session.title,
            created_at: session.created_at,
            updated_at: session.updated_at,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSessionPreviewDto {
    session_uuid: String,
    title: String,
    created_at: i64,
    updated_at: i64,
    last_message_preview: Option<String>,
}

impl From<db::SessionWithPreview> for ChatSessionPreviewDto {
    fn from(session: db::SessionWithPreview) -> Self {
        Self {
            session_uuid: session.uuid.to_string(),
            title: session.title,
            created_at: session.created_at,
            updated_at: session.updated_at,
            last_message_preview: session.last_message_preview,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachmentDto {
    id: String,
    kind: String,
    size: i64,
    name: String,
}

impl From<db::AttachmentMeta> for ChatAttachmentDto {
    fn from(attachment: db::AttachmentMeta) -> Self {
        let kind = match attachment.kind {
            db::AttachmentKind::Image => "image",
            db::AttachmentKind::Document => "document",
        };
        Self {
            id: attachment.id,
            kind: kind.to_string(),
            size: attachment.size,
            name: attachment.name,
        }
    }
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachmentInput {
    id: String,
    kind: String,
    size: i64,
    name: String,
}

impl TryFrom<ChatAttachmentInput> for db::AttachmentMeta {
    type Error = ApiError;

    fn try_from(value: ChatAttachmentInput) -> Result<Self, Self::Error> {
        let kind = match value.kind.as_str() {
            "image" => db::AttachmentKind::Image,
            "document" => db::AttachmentKind::Document,
            other => {
                return Err(ApiError::new(
                    "db_invalid_attachment_kind",
                    format!("Unsupported attachment kind: {other}"),
                ));
            }
        };
        Ok(Self {
            id: value.id,
            kind,
            size: value.size,
            name: value.name,
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageDto {
    message_uuid: String,
    session_uuid: String,
    parent_message_uuid: Option<String>,
    sender: String,
    text: String,
    created_at: i64,
    attachments: Vec<ChatAttachmentDto>,
}

impl From<db::Message> for ChatMessageDto {
    fn from(message: db::Message) -> Self {
        let sender = match message.sender {
            db::Sender::SelfUser => "self",
            db::Sender::Other => "assistant",
        };
        Self {
            message_uuid: message.uuid.to_string(),
            session_uuid: message.session_uuid.to_string(),
            parent_message_uuid: message.parent_message_uuid.map(|value| value.to_string()),
            sender: sender.to_string(),
            text: message.text,
            created_at: message.created_at,
            attachments: message
                .attachments
                .into_iter()
                .map(ChatAttachmentDto::from)
                .collect(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageInsertInput {
    session_uuid: String,
    sender: String,
    text: String,
    parent_message_uuid: Option<String>,
    attachments: Option<Vec<ChatAttachmentInput>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSessionUpsertInput {
    session_uuid: String,
    title: String,
    created_at: i64,
    updated_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageUpsertInput {
    message_uuid: String,
    session_uuid: String,
    parent_message_uuid: Option<String>,
    sender: String,
    text: String,
    created_at: i64,
    attachments: Option<Vec<ChatAttachmentInput>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatDbImportV1Input {
    key_b64: String,
}

#[tauri::command]
pub async fn chat_db_list_sessions(
    state: State<'_, ChatDbState>,
    app: AppHandle,
    key_b64: String,
) -> Result<Vec<ChatSessionDto>, ApiError> {
    with_chat_db_async(&state, app, key_b64, |db| {
        Ok(db
            .list_sessions()?
            .into_iter()
            .map(ChatSessionDto::from)
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn chat_db_list_sessions_with_preview(
    state: State<'_, ChatDbState>,
    app: AppHandle,
    key_b64: String,
) -> Result<Vec<ChatSessionPreviewDto>, ApiError> {
    with_chat_db_async(&state, app, key_b64, |db| {
        Ok(db
            .list_sessions_with_preview()?
            .into_iter()
            .map(ChatSessionPreviewDto::from)
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn chat_db_get_session(
    state: State<'_, ChatDbState>,
    app: AppHandle,
    key_b64: String,
    session_uuid: String,
) -> Result<Option<ChatSessionDto>, ApiError> {
    let uuid = parse_uuid(&session_uuid)?;
    with_chat_db_async(&state, app, key_b64, move |db| {
        Ok(db.get_session(uuid)?.map(ChatSessionDto::from))
    })
    .await
}

#[tauri::command]
pub async fn chat_db_create_session(
    state: State<'_, ChatDbState>,
    app: AppHandle,
    key_b64: String,
    title: String,
) -> Result<ChatSessionDto, ApiError> {
    with_chat_db_async(&state, app, key_b64, move |db| {
        Ok(ChatSessionDto::from(db.create_session(&title)?))
    })
    .await
}

#[tauri::command]
pub async fn chat_db_update_session_title(
    state: State<'_, ChatDbState>,
    app: AppHandle,
    key_b64: String,
    session_uuid: String,
    title: String,
) -> Result<(), ApiError> {
    let uuid = parse_uuid(&session_uuid)?;
    with_chat_db_async(&state, app, key_b64, move |db| {
        db.update_session_title(uuid, &title)
    })
    .await
}

#[tauri::command]
pub async fn chat_db_delete_session(
    state: State<'_, ChatDbState>,
    app: AppHandle,
    key_b64: String,
    session_uuid: String,
) -> Result<Vec<String>, ApiError> {
    let uuid = parse_uuid(&session_uuid)?;
    with_chat_db_async(&state, app, key_b64, move |db| db.delete_session(uuid)).await
}

#[tauri::command]
pub async fn chat_db_get_messages(
    state: State<'_, ChatDbState>,
    app: AppHandle,
    key_b64: String,
    session_uuid: String,
) -> Result<Vec<ChatMessageDto>, ApiError> {
    let uuid = parse_uuid(&session_uuid)?;
    with_chat_db_async(&state, app, key_b64, move |db| {
        Ok(db
            .get_messages(uuid)?
            .into_iter()
            .map(ChatMessageDto::from)
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn chat_db_insert_message(
    state: State<'_, ChatDbState>,
    app: AppHandle,
    key_b64: String,
    input: ChatMessageInsertInput,
) -> Result<ChatMessageDto, ApiError> {
    let session_uuid = parse_uuid(&input.session_uuid)?;
    let parent = optional_uuid(&input.parent_message_uuid)?;
    let sender = normalize_sender(&input.sender)?;
    let attachments = convert_attachments(input.attachments)?;
    with_chat_db_async(&state, app, key_b64, move |db| {
        Ok(ChatMessageDto::from(db.insert_message(
            session_uuid,
            sender,
            &input.text,
            parent,
            attachments,
        )?))
    })
    .await
}

#[tauri::command]
pub async fn chat_db_update_message_text(
    state: State<'_, ChatDbState>,
    app: AppHandle,
    key_b64: String,
    message_uuid: String,
    text: String,
) -> Result<(), ApiError> {
    let uuid = parse_uuid(&message_uuid)?;
    with_chat_db_async(&state, app, key_b64, move |db| {
        db.update_message_text(uuid, &text)
    })
    .await
}

#[tauri::command]
pub async fn chat_db_upsert_session(
    state: State<'_, ChatDbState>,
    app: AppHandle,
    key_b64: String,
    input: ChatSessionUpsertInput,
) -> Result<ChatSessionDto, ApiError> {
    let uuid = parse_uuid(&input.session_uuid)?;
    with_chat_db_async(&state, app, key_b64, move |db| {
        Ok(ChatSessionDto::from(db.upsert_session(
            uuid,
            &input.title,
            input.created_at,
            input.updated_at,
        )?))
    })
    .await
}

#[tauri::command]
pub async fn chat_db_insert_message_with_uuid(
    state: State<'_, ChatDbState>,
    app: AppHandle,
    key_b64: String,
    input: ChatMessageUpsertInput,
) -> Result<ChatMessageDto, ApiError> {
    let message_uuid = parse_uuid(&input.message_uuid)?;
    let session_uuid = parse_uuid(&input.session_uuid)?;
    let parent = optional_uuid(&input.parent_message_uuid)?;
    let sender = normalize_sender(&input.sender)?;
    let attachments = convert_attachments(input.attachments)?;
    with_chat_db_async(&state, app, key_b64, move |db| {
        Ok(ChatMessageDto::from(db.insert_message_with_uuid(
            message_uuid,
            session_uuid,
            sender,
            &input.text,
            parent,
            attachments,
            input.created_at,
        )?))
    })
    .await
}

#[tauri::command]
pub async fn chat_db_import_v1(app: AppHandle, input: ChatDbImportV1Input) -> Result<(), ApiError> {
    async_runtime::spawn_blocking(move || import_v1_chat_db(&app, &input))
        .await
        .map_err(|_| chat_db_thread_error())?
}

#[tauri::command]
pub fn chat_db_cleanup_v1(app: AppHandle) -> Result<(), ApiError> {
    cleanup_v1_chat_artifacts(&app)
}

#[tauri::command]
pub fn chat_db_has_existing_store(app: AppHandle) -> Result<bool, ApiError> {
    let root = app_data_dir(&app)?;
    for name in [CHAT_DB_FILE_NAME, V1_CHAT_DB_FILE_NAME] {
        if root
            .join(name)
            .try_exists()
            .map_err(|error| ApiError::new("io", error.to_string()))?
        {
            return Ok(true);
        }
    }
    for name in [ATTACHMENTS_DIR_NAME, V1_ATTACHMENTS_DIR_NAME] {
        let path = root.join(name);
        if path
            .try_exists()
            .map_err(|error| ApiError::new("io", error.to_string()))?
            && fs::read_dir(path)
                .map_err(|error| ApiError::new("io", error.to_string()))?
                .next()
                .transpose()
                .map_err(|error| ApiError::new("io", error.to_string()))?
                .is_some()
        {
            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
pub async fn chat_db_compress_attachment_image_file(path: String) -> Result<Vec<u8>, ApiError> {
    async_runtime::spawn_blocking(move || {
        let data = fs::read(&path).map_err(|error| {
            ApiError::new("io", format!("failed to read image file '{path}': {error}"))
        })?;
        ente_ensu::image::compress_attachment_image(&data)
            .map_err(|error| ApiError::new("image", error.to_string()))
    })
    .await
    .map_err(|_| image_thread_error())?
}

fn convert_attachments(
    attachments: Option<Vec<ChatAttachmentInput>>,
) -> Result<Vec<db::AttachmentMeta>, ApiError> {
    attachments
        .unwrap_or_default()
        .into_iter()
        .map(db::AttachmentMeta::try_from)
        .collect()
}

fn normalize_sender(sender: &str) -> Result<&'static str, ApiError> {
    match sender {
        "self" => Ok("self"),
        "assistant" | "other" => Ok("other"),
        _ => Err(ApiError::new(
            "db_invalid_sender",
            format!("Unsupported sender: {sender}"),
        )),
    }
}

fn parse_uuid(value: &str) -> Result<Uuid, ApiError> {
    Uuid::parse_str(value).map_err(|error| ApiError::new("uuid", error.to_string()))
}

fn optional_uuid(value: &Option<String>) -> Result<Option<Uuid>, ApiError> {
    value.as_deref().map(parse_uuid).transpose()
}

fn chat_db_path(app: &AppHandle) -> Result<PathBuf, ApiError> {
    Ok(app_data_dir(app)?.join(CHAT_DB_FILE_NAME))
}

fn attachments_dir_path(app: &AppHandle) -> Result<PathBuf, ApiError> {
    let path = app_data_dir(app)?.join(ATTACHMENTS_DIR_NAME);
    fs::create_dir_all(&path).map_err(|error| ApiError::new("io", error.to_string()))?;
    Ok(path)
}

fn v1_chat_db_path(app: &AppHandle) -> Result<PathBuf, ApiError> {
    Ok(app_data_dir(app)?.join(V1_CHAT_DB_FILE_NAME))
}

fn v1_attachments_db_path(app: &AppHandle) -> Result<PathBuf, ApiError> {
    Ok(app_data_dir(app)?.join(V1_ATTACHMENTS_DB_FILE_NAME))
}

fn v1_attachments_dir_path(app: &AppHandle) -> Result<PathBuf, ApiError> {
    Ok(app_data_dir(app)?.join(V1_ATTACHMENTS_DIR_NAME))
}

fn remove_sqlite_files(path: &Path) -> Result<(), ApiError> {
    for candidate in [
        path.to_path_buf(),
        PathBuf::from(format!("{}-wal", path.display())),
        PathBuf::from(format!("{}-shm", path.display())),
    ] {
        if candidate
            .try_exists()
            .map_err(|error| ApiError::new("io", error.to_string()))?
        {
            fs::remove_file(candidate).map_err(|error| ApiError::new("io", error.to_string()))?;
        }
    }
    Ok(())
}

fn cleanup_v1_chat_artifacts(app: &AppHandle) -> Result<(), ApiError> {
    remove_sqlite_files(&v1_chat_db_path(app)?)?;
    remove_sqlite_files(&v1_attachments_db_path(app)?)?;
    let attachments_dir = v1_attachments_dir_path(app)?;
    if attachments_dir
        .try_exists()
        .map_err(|error| ApiError::new("io", error.to_string()))?
    {
        fs::remove_dir_all(attachments_dir)
            .map_err(|error| ApiError::new("io", error.to_string()))?;
    }
    Ok(())
}

fn copy_v1_attachment(source: &Path, destination: &Path) -> Result<(), ApiError> {
    if destination
        .try_exists()
        .map_err(|error| ApiError::new("io", error.to_string()))?
    {
        return Ok(());
    }
    let temporary = destination.with_extension("migrating");
    fs::copy(source, &temporary).map_err(|error| ApiError::new("io", error.to_string()))?;
    File::open(&temporary)
        .and_then(|file| file.sync_all())
        .map_err(|error| ApiError::new("io", error.to_string()))?;
    fs::rename(temporary, destination).map_err(|error| ApiError::new("io", error.to_string()))
}

#[cfg(unix)]
fn sync_dir(path: &Path) -> Result<(), ApiError> {
    File::open(path)
        .and_then(|file| file.sync_all())
        .map_err(|error| ApiError::new("io", error.to_string()))
}

#[cfg(not(unix))]
fn sync_dir(_path: &Path) -> Result<(), ApiError> {
    Ok(())
}

fn import_v1_chat_db(app: &AppHandle, input: &ChatDbImportV1Input) -> Result<(), ApiError> {
    let v1_db_path = v1_chat_db_path(app)?;
    if !v1_db_path
        .try_exists()
        .map_err(|error| ApiError::new("io", error.to_string()))?
    {
        return Ok(());
    }

    let key = crypto::decode_b64(&input.key_b64).map_err(ApiError::from)?;
    import_v1_chat_db_paths(
        &v1_db_path,
        &v1_attachments_dir_path(app)?,
        &chat_db_path(app)?,
        &attachments_dir_path(app)?,
        key,
    )
}

fn import_v1_chat_db_paths(
    v1_db_path: &Path,
    v1_attachments_dir: &Path,
    target_db_path: &Path,
    target_attachments_dir: &Path,
    key: Vec<u8>,
) -> Result<(), ApiError> {
    let v1_db =
        ChatDb::open_sqlite_with_defaults(&v1_db_path, key.clone()).map_err(ApiError::from)?;
    let target = ChatDb::open_sqlite_with_defaults(target_db_path, key).map_err(ApiError::from)?;

    for session in v1_db.list_sessions().map_err(ApiError::from)? {
        target
            .upsert_session(
                session.uuid,
                &session.title,
                session.created_at,
                session.updated_at,
            )
            .map_err(ApiError::from)?;

        for message in v1_db.get_messages(session.uuid).map_err(ApiError::from)? {
            target
                .insert_message_with_uuid(
                    message.uuid,
                    message.session_uuid,
                    message.sender.as_str(),
                    &message.text,
                    message.parent_message_uuid,
                    message.attachments.clone(),
                    message.created_at,
                )
                .map_err(ApiError::from)?;

            for attachment in message.attachments {
                let source = v1_attachments_dir.join(&attachment.id);
                let destination = target_attachments_dir.join(&attachment.id);
                if source
                    .try_exists()
                    .map_err(|error| ApiError::new("io", error.to_string()))?
                {
                    copy_v1_attachment(&source, &destination)?;
                }
            }
        }
    }
    sync_dir(&target_attachments_dir)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ente_ensu::db::{AttachmentKind, AttachmentMeta};

    fn migration_fixture() -> PathBuf {
        let root = std::env::temp_dir().join(format!("ensu-import-{}", Uuid::new_v4()));
        fs::create_dir_all(root.join("source-attachments")).unwrap();
        fs::create_dir_all(root.join("target-attachments")).unwrap();
        root
    }

    fn seed_source(root: &Path, key: &[u8]) -> (Uuid, String) {
        let source =
            ChatDb::open_sqlite_with_defaults(root.join("source.db"), key.to_vec()).unwrap();
        let session = source.create_session("Migrated chat").unwrap();
        let attachment_id = Uuid::new_v4().to_string();
        source
            .insert_message(
                session.uuid,
                "self",
                "Migrated message",
                None,
                vec![AttachmentMeta {
                    id: attachment_id.clone(),
                    kind: AttachmentKind::Document,
                    size: 7,
                    name: "note.txt".to_string(),
                }],
            )
            .unwrap();
        fs::write(
            root.join("source-attachments").join(&attachment_id),
            b"payload",
        )
        .unwrap();
        (session.uuid, attachment_id)
    }

    fn import_fixture(root: &Path, key: Vec<u8>) -> Result<(), ApiError> {
        import_v1_chat_db_paths(
            &root.join("source.db"),
            &root.join("source-attachments"),
            &root.join("target.db"),
            &root.join("target-attachments"),
            key,
        )
    }

    #[test]
    fn v1_import_is_restart_safe() {
        let root = migration_fixture();
        let key = vec![7; 32];
        let (session_id, attachment_id) = seed_source(&root, &key);

        import_fixture(&root, key.clone()).unwrap();
        import_fixture(&root, key.clone()).unwrap();

        let target = ChatDb::open_sqlite_with_defaults(root.join("target.db"), key).unwrap();
        assert_eq!(target.list_sessions().unwrap()[0].title, "Migrated chat");
        let messages = target.get_messages(session_id).unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].text, "Migrated message");
        assert_eq!(messages[0].attachments[0].name, "note.txt");
        assert_eq!(
            fs::read(root.join("target-attachments").join(attachment_id)).unwrap(),
            b"payload"
        );
        assert!(root.join("source.db").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn v1_import_recovers_after_wrong_key() {
        let root = migration_fixture();
        let key = vec![8; 32];
        let (session_id, attachment_id) = seed_source(&root, &key);

        assert!(import_fixture(&root, vec![9; 32]).is_err());
        assert!(root.join("source.db").exists());
        assert!(
            root.join("source-attachments")
                .join(&attachment_id)
                .exists()
        );

        import_fixture(&root, key.clone()).unwrap();
        let target = ChatDb::open_sqlite_with_defaults(root.join("target.db"), key).unwrap();
        assert_eq!(target.get_messages(session_id).unwrap().len(), 1);
        fs::remove_dir_all(root).unwrap();
    }
}

fn with_chat_db<T, F>(
    inner: &Arc<Mutex<Option<ChatDbHolder>>>,
    app: &AppHandle,
    key_b64: &str,
    operation: F,
) -> Result<T, ApiError>
where
    F: FnOnce(&ChatDb<SqliteBackend>) -> Result<T, DbError>,
{
    let db = {
        let mut guard = inner
            .lock()
            .map_err(|_| ApiError::new("lock", "Failed to lock chat DB state"))?;
        let needs_open = guard
            .as_ref()
            .map(|holder| holder.key_b64 != key_b64)
            .unwrap_or(true);

        if needs_open {
            let key = crypto::decode_b64(key_b64).map_err(ApiError::from)?;
            let path = chat_db_path(app)?;
            logging::log("ChatDb", format!("opening chat DB db={}", path.display()));
            let db = ChatDb::open_sqlite_with_defaults(path, key).map_err(|error| {
                logging::log("ChatDb", format!("failed to open chat DB error={error}"));
                ApiError::from(error)
            })?;
            *guard = Some(ChatDbHolder {
                key_b64: key_b64.to_string(),
                db: Arc::new(db),
            });
            logging::log("ChatDb", "chat DB opened");
        }

        guard
            .as_ref()
            .ok_or_else(|| ApiError::new("db", "Chat DB not initialized"))?
            .db
            .clone()
    };

    operation(db.as_ref()).map_err(ApiError::from)
}

async fn with_chat_db_async<T, F>(
    state: &ChatDbState,
    app: AppHandle,
    key_b64: String,
    operation: F,
) -> Result<T, ApiError>
where
    T: Send + 'static,
    F: FnOnce(&ChatDb<SqliteBackend>) -> Result<T, DbError> + Send + 'static,
{
    let inner = state.inner.clone();
    async_runtime::spawn_blocking(move || with_chat_db(&inner, &app, &key_b64, operation))
        .await
        .map_err(|_| chat_db_thread_error())?
}

pub(crate) fn clear_for_exit(app: &AppHandle) {
    if let Some(state) = app.try_state::<ChatDbState>() {
        match state.inner.lock() {
            Ok(mut guard) => {
                *guard = None;
                logging::log("App", "cleared chat DB state");
            }
            Err(_) => logging::log("App", "failed to lock chat DB state during exit"),
        }
    } else {
        logging::log("App", "chat DB state unavailable during exit");
    }
}
