use super::chunk::prepare_chunks;
use super::{NOTES_MAX_SOURCE_BYTES, NotesError, notes_content_revision, validate_document_id};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotesSourceDocument {
    pub document_id: String,
    pub size: u64,
    pub modified_at_ms: Option<i64>,
}

impl NotesSourceDocument {
    pub fn validate(&self) -> Result<(), NotesError> {
        validate_document_id(&self.document_id)?;
        if self.size > NOTES_MAX_SOURCE_BYTES as u64 {
            return Err(NotesError::InvalidInput(
                "source document exceeds the supported size".to_string(),
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedNotesDocument {
    pub document_id: String,
    pub revision: String,
    pub title: String,
    pub chunks: Vec<PreparedNotesChunk>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedNotesChunk {
    pub section: Option<String>,
    pub text: String,
}

pub fn prepare_notes_document(
    document_id: &str,
    bytes: &[u8],
) -> Result<PreparedNotesDocument, NotesError> {
    validate_document_id(document_id)?;
    if bytes.len() > NOTES_MAX_SOURCE_BYTES {
        return Err(NotesError::InvalidInput(
            "source document exceeds the supported size".to_string(),
        ));
    }
    let text = std::str::from_utf8(bytes)
        .map_err(|_| NotesError::InvalidInput("source document is not valid UTF-8".to_string()))?;
    if text.trim().is_empty() {
        return Err(NotesError::InvalidInput(
            "source document must not be empty".to_string(),
        ));
    }

    let revision = notes_content_revision(bytes);
    let (title, chunks) = prepare_chunks(document_id, text)?;
    Ok(PreparedNotesDocument {
        document_id: document_id.to_string(),
        revision,
        title,
        chunks,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{NOTES_CHUNK_CHARACTERS, NOTES_CHUNK_OVERLAP_CHARACTERS};

    #[test]
    fn prepares_and_chunks_markdown() {
        let text = "preamble\r\n\r\n# Local Notes\r\n\r\nintro\r\n\r\n## Indexing\r\n\r\nfirst paragraph\r\n\r\nsecond paragraph\r\n";
        let prepared = prepare_notes_document("projects/notes.md", text.as_bytes()).unwrap();
        assert_eq!(prepared.title, "Local Notes");
        assert_eq!(prepared.chunks.len(), 3);
        assert_eq!(prepared.chunks[0].section, None);
        assert_eq!(prepared.chunks[0].text, "preamble");
        assert_eq!(prepared.chunks[1].text, "intro");
        assert_eq!(prepared.chunks[2].section.as_deref(), Some("Indexing"));
        assert_eq!(
            prepared.chunks[2].text,
            "first paragraph\n\nsecond paragraph"
        );

        let text = "é".repeat(1_600);
        let prepared = prepare_notes_document("unicode.md", text.as_bytes()).unwrap();
        assert_eq!(prepared.title, "unicode.md");
        assert_eq!(prepared.chunks.len(), 2);
        assert_eq!(
            prepared.chunks[0].text.chars().count(),
            NOTES_CHUNK_CHARACTERS
        );
        assert_eq!(prepared.chunks[1].text.chars().count(), 400);
        let overlap = prepared.chunks[0]
            .text
            .chars()
            .skip(NOTES_CHUNK_CHARACTERS - NOTES_CHUNK_OVERLAP_CHARACTERS)
            .collect::<String>();
        let next = prepared.chunks[1]
            .text
            .chars()
            .take(NOTES_CHUNK_OVERLAP_CHARACTERS)
            .collect::<String>();
        assert_eq!(overlap, next);
    }
}
