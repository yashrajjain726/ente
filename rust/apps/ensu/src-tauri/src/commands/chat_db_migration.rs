use std::fs::{self, File};
use std::path::{Path, PathBuf};

use ente_ensu::db::{ChatDb, Error as DbError};

use super::common::ApiError;

const SOURCE_DB: &str = "ensu_llmchat.db";
const SOURCE_ATTACHMENTS_DB: &str = "llmchat_sync.db";
const SOURCE_ATTACHMENTS: &str = "ensu_llmchat_attachments";

pub(super) fn has_store(root: &Path) -> Result<bool, ApiError> {
    if exists(&root.join(SOURCE_DB))? {
        return Ok(true);
    }
    let attachments = root.join(SOURCE_ATTACHMENTS);
    Ok(exists(&attachments)?
        && fs::read_dir(attachments)
            .map_err(io_error)?
            .next()
            .transpose()
            .map_err(io_error)?
            .is_some())
}

pub(super) fn prepare(
    root: &Path,
    target_db: &Path,
    target_attachments: &Path,
    target_key: Vec<u8>,
    recovery_keys: Vec<Vec<u8>>,
) -> Result<(), ApiError> {
    let source_db = root.join(SOURCE_DB);
    if exists(&source_db)? {
        let source_key = select_source_key(&source_db, &recovery_keys)?;
        import(
            &source_db,
            &root.join(SOURCE_ATTACHMENTS),
            target_db,
            target_attachments,
            source_key,
            target_key,
        )?;
    }
    cleanup(root)
}

fn select_source_key(path: &Path, keys: &[Vec<u8>]) -> Result<Vec<u8>, ApiError> {
    for key in keys {
        let db = match ChatDb::open_sqlite_with_defaults(path, key.clone()) {
            Ok(db) => db,
            Err(DbError::InvalidKeyLength { .. }) => continue,
            Err(error) => return Err(ApiError::from(error)),
        };
        match db.list_sessions() {
            Ok(_) => return Ok(key.clone()),
            Err(
                DbError::Crypto(_)
                | DbError::InvalidBlobLength { .. }
                | DbError::InvalidEncryptedField
                | DbError::Utf8(_),
            ) => {}
            Err(error) => return Err(ApiError::from(error)),
        }
    }
    Err(ApiError::new(
        "db_crypto",
        "No stored key could decrypt the old chat database",
    ))
}

fn import(
    source_db: &Path,
    source_attachments: &Path,
    target_db: &Path,
    target_attachments: &Path,
    source_key: Vec<u8>,
    target_key: Vec<u8>,
) -> Result<(), ApiError> {
    let source =
        ChatDb::open_sqlite_with_defaults(source_db, source_key).map_err(ApiError::from)?;
    let target =
        ChatDb::open_sqlite_with_defaults(target_db, target_key).map_err(ApiError::from)?;

    for session in source.list_sessions().map_err(ApiError::from)? {
        target
            .upsert_session(
                session.uuid,
                &session.title,
                session.created_at,
                session.updated_at,
            )
            .map_err(ApiError::from)?;
        for message in source.get_messages(session.uuid).map_err(ApiError::from)? {
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
                let from = source_attachments.join(&attachment.id);
                let to = target_attachments.join(&attachment.id);
                if exists(&from)? && !exists(&to)? {
                    copy_attachment(&from, &to)?;
                }
            }
        }
    }
    for session in target.list_sessions().map_err(ApiError::from)? {
        target.get_messages(session.uuid).map_err(ApiError::from)?;
    }
    sync_dir(target_attachments)
}

fn copy_attachment(source: &Path, target: &Path) -> Result<(), ApiError> {
    let temporary = target.with_extension("migrating");
    fs::copy(source, &temporary).map_err(io_error)?;
    File::open(&temporary)
        .and_then(|file| file.sync_all())
        .map_err(io_error)?;
    fs::rename(temporary, target).map_err(io_error)
}

#[cfg(unix)]
fn sync_dir(path: &Path) -> Result<(), ApiError> {
    File::open(path)
        .and_then(|file| file.sync_all())
        .map_err(io_error)
}

#[cfg(not(unix))]
fn sync_dir(_path: &Path) -> Result<(), ApiError> {
    Ok(())
}

fn cleanup(root: &Path) -> Result<(), ApiError> {
    remove_sqlite_files(&root.join(SOURCE_DB))?;
    remove_sqlite_files(&root.join(SOURCE_ATTACHMENTS_DB))?;
    let attachments = root.join(SOURCE_ATTACHMENTS);
    if exists(&attachments)? {
        fs::remove_dir_all(attachments).map_err(io_error)?;
    }
    Ok(())
}

fn remove_sqlite_files(path: &Path) -> Result<(), ApiError> {
    for candidate in [
        path.to_path_buf(),
        PathBuf::from(format!("{}-wal", path.display())),
        PathBuf::from(format!("{}-shm", path.display())),
    ] {
        if exists(&candidate)? {
            fs::remove_file(candidate).map_err(io_error)?;
        }
    }
    Ok(())
}

fn exists(path: &Path) -> Result<bool, ApiError> {
    path.try_exists().map_err(io_error)
}

fn io_error(error: std::io::Error) -> ApiError {
    ApiError::new("io", error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ente_ensu::db::{AttachmentKind, AttachmentMeta};
    use uuid::Uuid;

    fn fixture(key: &[u8]) -> (PathBuf, Uuid, String) {
        let root = std::env::temp_dir().join(format!("ensu-import-{}", Uuid::new_v4()));
        let attachments = root.join(SOURCE_ATTACHMENTS);
        fs::create_dir_all(&attachments).unwrap();
        let source = ChatDb::open_sqlite_with_defaults(root.join(SOURCE_DB), key.to_vec()).unwrap();
        let session = source.create_session("Migrated chat").unwrap();
        let attachment = Uuid::new_v4().to_string();
        source
            .insert_message(
                session.uuid,
                "self",
                "Migrated message",
                None,
                vec![AttachmentMeta {
                    id: attachment.clone(),
                    kind: AttachmentKind::Document,
                    size: 7,
                    name: "note.txt".to_string(),
                }],
            )
            .unwrap();
        fs::write(attachments.join(&attachment), b"payload").unwrap();
        (root, session.uuid, attachment)
    }

    #[test]
    fn preparation_imports_with_a_recovery_key_and_cleans_up() {
        let source_key = vec![7; 32];
        let target_key = vec![8; 32];
        let (root, session, attachment) = fixture(&source_key);
        let target_db = root.join("target.db");
        let target_attachments = root.join("target-attachments");
        fs::create_dir(&target_attachments).unwrap();

        prepare(
            &root,
            &target_db,
            &target_attachments,
            target_key.clone(),
            vec![vec![9; 32], source_key],
        )
        .unwrap();
        prepare(
            &root,
            &target_db,
            &target_attachments,
            target_key.clone(),
            vec![],
        )
        .unwrap();

        let target = ChatDb::open_sqlite_with_defaults(target_db, target_key).unwrap();
        assert_eq!(
            target.get_messages(session).unwrap()[0].text,
            "Migrated message"
        );
        assert_eq!(
            fs::read(target_attachments.join(attachment)).unwrap(),
            b"payload"
        );
        assert!(!root.join(SOURCE_DB).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_key_recovery_preserves_the_source() {
        let source_key = vec![10; 32];
        let (root, _, attachment) = fixture(&source_key);
        let target_attachments = root.join("target-attachments");
        fs::create_dir(&target_attachments).unwrap();

        assert!(
            prepare(
                &root,
                &root.join("target.db"),
                &target_attachments,
                vec![11; 32],
                vec![vec![12; 32]],
            )
            .is_err()
        );
        assert!(root.join(SOURCE_DB).exists());
        assert!(root.join(SOURCE_ATTACHMENTS).join(attachment).exists());
        fs::remove_dir_all(root).unwrap();
    }
}
