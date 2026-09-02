mod chunk;
mod document;
mod index;
mod indexing;
mod manifest;
mod reconcile;
mod shard;
mod source;
mod writer;

use thiserror::Error;
use uuid::Uuid;

const NOTES_INDEX_CONTRACT_VERSION: u32 = 2;
pub const NOTES_MAX_SOURCE_BYTES: usize = 2 * 1024 * 1024;
pub const NOTES_MAX_COLLECTION_SOURCE_BYTES: u64 = 128 * 1024 * 1024;
pub const NOTES_MAX_COLLECTION_DOCUMENTS: usize = 20_000;
const NOTES_MAX_COLLECTION_CHUNKS: u64 = 131_072;
const NOTES_CHUNK_UTF8_BYTES: usize = 1_400;
const NOTES_CHUNK_OVERLAP_UTF8_BYTES: usize = 200;
const NOTES_HEADING_MAX_UTF8_BYTES: usize = 512;

#[derive(Debug, Error)]
pub enum NotesError {
    #[error("invalid Notes input: {0}")]
    InvalidInput(String),
    #[error("invalid Notes index: {0}")]
    InvalidIndex(String),
    #[error("incompatible Notes index contract")]
    IncompatibleIndex,
    #[error("Notes collection is not ready")]
    NotReady,
    #[error("Notes collection is too large: {0}")]
    CollectionTooLarge(String),
    #[error("Notes index I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("Notes index JSON failed: {0}")]
    Json(#[from] serde_json::Error),
}

pub use document::{
    NotesSourceDocument, PreparedNotesChunk, PreparedNotesDocument, prepare_notes_document,
};
pub use index::{NotesCollectionIndex, NotesCollectionIndexSummary, NotesSearchHit};
pub use indexing::{
    NotesDocumentLoad, NotesIndexInput, NotesIndexOutcome, NotesIndexingError, NotesRevisionStatus,
    index_notes_collection,
};
pub use reconcile::NotesReconciliationPlan;
pub use source::NoteSourceReference;
pub use writer::NotesIndexWriter;

pub fn notes_content_revision(bytes: &[u8]) -> String {
    sha256_hex(bytes)
}

fn sha256_hex(bytes: &[u8]) -> String {
    ente_ensu_crypto::sha256_hex(bytes)
}

pub fn validate_document_id(document_id: &str) -> Result<(), NotesError> {
    if document_id.is_empty() || document_id.len() > 4_096 {
        return Err(NotesError::InvalidInput(
            "document ID length is outside the supported range".to_string(),
        ));
    }
    if document_id.chars().any(char::is_control) {
        return Err(NotesError::InvalidInput(
            "document ID contains a control character".to_string(),
        ));
    }
    #[cfg(windows)]
    if document_id.contains('\\') {
        return Err(NotesError::InvalidInput(
            "document ID contains an invalid path separator".to_string(),
        ));
    }
    if looks_like_absolute_local_path(document_id) {
        return Err(NotesError::InvalidInput(
            "document ID must not be an absolute local path".to_string(),
        ));
    }
    if document_id
        .split('/')
        .any(|component| component.is_empty() || matches!(component, "." | ".."))
    {
        return Err(NotesError::InvalidInput(
            "document ID contains an invalid path component".to_string(),
        ));
    }
    Ok(())
}

fn validate_collection_id(collection_id: &str) -> Result<(), NotesError> {
    let parsed = Uuid::parse_str(collection_id)
        .map_err(|_| NotesError::InvalidInput("collection ID must be a UUID".to_string()))?;
    if parsed.hyphenated().to_string() != collection_id {
        return Err(NotesError::InvalidInput(
            "collection ID must use canonical lowercase UUID form".to_string(),
        ));
    }
    Ok(())
}

fn looks_like_absolute_local_path(value: &str) -> bool {
    value.starts_with('/')
        || value.starts_with('\\')
        || value
            .get(..5)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("file:"))
        || (value.len() >= 3
            && value.as_bytes()[0].is_ascii_alphabetic()
            && value.as_bytes()[1] == b':'
            && matches!(value.as_bytes()[2], b'/' | b'\\'))
}

fn validate_revision(revision: &str) -> Result<(), NotesError> {
    if revision.len() != 64
        || !revision
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(NotesError::InvalidInput(
            "revision must be a lowercase SHA-256 digest".to_string(),
        ));
    }
    Ok(())
}

fn is_valid_label(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 4_096 && !value.chars().any(char::is_control)
}

fn contains_unsupported_control(value: &str) -> bool {
    value
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
}

fn invalid_index_input(error: NotesError) -> NotesError {
    NotesError::InvalidIndex(match error {
        NotesError::InvalidInput(detail) => detail,
        _ => "index field is invalid".to_string(),
    })
}
