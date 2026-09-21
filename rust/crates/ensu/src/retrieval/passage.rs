use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{BEGIN_CONTEXT_SENTINEL, END_CONTEXT_SENTINEL, GroundedSource, RetrievalError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PassageLocator {
    EnsuPack {
        dataset_id: String,
        revision_sha256: String,
        row: u64,
    },
    LocalNote {
        collection_id: String,
        document_id: String,
        indexed_revision: String,
        shard_sha256: String,
        chunk_index: u64,
    },
}

impl PassageLocator {
    pub(crate) fn matches_source(&self, source: &GroundedSource) -> bool {
        match (self, source) {
            (Self::EnsuPack { dataset_id, .. }, GroundedSource::EnsuPack { citation }) => {
                *dataset_id == citation.dataset_id
            }
            (
                Self::LocalNote {
                    collection_id,
                    document_id,
                    indexed_revision,
                    ..
                },
                GroundedSource::LocalNote { reference },
            ) => {
                *collection_id == reference.collection_id
                    && *document_id == reference.document_id
                    && *indexed_revision == reference.indexed_revision
            }
            _ => false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PassageSpan {
    pub start_utf8: u32,
    pub end_utf8: u32,
    pub text_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncludedPassage {
    pub locator: PassageLocator,
    pub cleaning_version: u32,
    pub spans: Vec<PassageSpan>,
}

const PASSAGE_CLEANING_VERSION: u32 = 1;
const MAX_PASSAGE_SPANS: usize = 8;
const MAX_PASSAGE_UTF8_BYTES: usize = 64 * 1024;

impl IncludedPassage {
    pub(crate) fn valid_metadata(&self) -> bool {
        let sha = |value: &str| {
            value.len() == 64
                && value
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        };
        if self.cleaning_version != PASSAGE_CLEANING_VERSION
            || self.spans.is_empty()
            || self.spans.len() > MAX_PASSAGE_SPANS
        {
            return false;
        }
        let valid_locator = match &self.locator {
            PassageLocator::EnsuPack {
                dataset_id,
                revision_sha256,
                ..
            } => !dataset_id.is_empty() && dataset_id.len() <= 256 && sha(revision_sha256),
            PassageLocator::LocalNote {
                collection_id,
                document_id,
                indexed_revision,
                shard_sha256,
                ..
            } => {
                uuid::Uuid::parse_str(collection_id).is_ok()
                    && crate::notes::validate_document_id(document_id).is_ok()
                    && sha(indexed_revision)
                    && sha(shard_sha256)
            }
        };
        let mut previous_end = 0;
        valid_locator
            && self.spans.iter().all(|span| {
                let valid = span.start_utf8 >= previous_end
                    && span.start_utf8 < span.end_utf8
                    && span.end_utf8 as usize <= MAX_PASSAGE_UTF8_BYTES
                    && sha(&span.text_sha256);
                previous_end = span.end_utf8;
                valid
            })
    }

    pub(super) fn prefix(locator: PassageLocator, text: &str) -> Result<Self, RetrievalError> {
        let end_utf8 = u32::try_from(text.len()).map_err(|_| {
            RetrievalError::InvalidInput("included passage is too large".to_string())
        })?;
        Ok(Self {
            locator,
            cleaning_version: PASSAGE_CLEANING_VERSION,
            spans: vec![PassageSpan {
                start_utf8: 0,
                end_utf8,
                text_sha256: digest(text.as_bytes()),
            }],
        })
    }

    pub fn verified_spans(&self, reloaded_text: &str) -> Option<Vec<String>> {
        if self.cleaning_version != PASSAGE_CLEANING_VERSION
            || self.spans.is_empty()
            || self.spans.len() > MAX_PASSAGE_SPANS
            || reloaded_text.len() > MAX_PASSAGE_UTF8_BYTES
        {
            return None;
        }
        let cleaned = clean_passage_text(reloaded_text);
        let mut end = 0;
        let mut texts = Vec::with_capacity(self.spans.len());
        for span in &self.spans {
            let start = usize::try_from(span.start_utf8).ok()?;
            let next_end = usize::try_from(span.end_utf8).ok()?;
            if start < end || start >= next_end {
                return None;
            }
            let text = cleaned.get(start..next_end)?;
            if digest(text.as_bytes()) != span.text_sha256 {
                return None;
            }
            texts.push(text.to_owned());
            end = next_end;
        }
        Some(texts)
    }
}

pub(super) fn digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(crate) fn clean_passage_text(value: &str) -> String {
    value
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(|line| {
            let line = line
                .chars()
                .map(|character| {
                    if character == '\t' || !character.is_control() {
                        character
                    } else {
                        ' '
                    }
                })
                .collect::<String>();
            let start = line.trim_start();
            if start.starts_with(BEGIN_CONTEXT_SENTINEL) || start.starts_with(END_CONTEXT_SENTINEL)
            {
                format!("[source] {line}")
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct Fixture {
        name: String,
        raw: String,
        cleaned: String,
        reference: IncludedPassage,
        texts: Vec<String>,
    }

    #[test]
    fn shared_passage_reference_fixtures() {
        let fixtures: Vec<Fixture> = serde_json::from_str(include_str!(
            "../../tests/fixtures/passage-references-v1.json"
        ))
        .unwrap();
        for fixture in fixtures {
            assert_eq!(
                clean_passage_text(&fixture.raw),
                fixture.cleaned,
                "{}",
                fixture.name
            );
            assert_eq!(
                fixture.reference.verified_spans(&fixture.raw),
                Some(fixture.texts),
                "{}",
                fixture.name
            );
        }
    }

    #[test]
    fn refuses_changed_text_invalid_offsets_and_unknown_versions() {
        let fixtures: Vec<Fixture> = serde_json::from_str(include_str!(
            "../../tests/fixtures/passage-references-v1.json"
        ))
        .unwrap();
        let fixture = &fixtures[0];
        assert!(
            fixture
                .reference
                .verified_spans(&fixture.raw.replace("Café", "Cafe"))
                .is_none()
        );
        for (start, end) in [(0, 4), (4, 9), (9, 0), (0, u32::MAX)] {
            let mut reference = fixture.reference.clone();
            reference.spans[0].start_utf8 = start;
            reference.spans[0].end_utf8 = end;
            assert!(reference.verified_spans(&fixture.raw).is_none());
        }
        let mut reference = fixture.reference.clone();
        reference.cleaning_version = 2;
        assert!(reference.verified_spans(&fixture.raw).is_none());
        reference = fixture.reference.clone();
        reference.spans[1] = reference.spans[0].clone();
        assert!(reference.verified_spans(&fixture.raw).is_none());
        reference.spans = vec![reference.spans[0].clone(); 9];
        assert!(reference.verified_spans(&fixture.raw).is_none());
    }
}
