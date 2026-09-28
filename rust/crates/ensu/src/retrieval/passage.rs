use serde::{Deserialize, Serialize};

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
        if !self.valid_metadata() || reloaded_text.len() > MAX_PASSAGE_UTF8_BYTES {
            return None;
        }
        let cleaned = clean_passage_text(reloaded_text);
        self.spans
            .iter()
            .map(|span| {
                let text = cleaned.get(span.start_utf8 as usize..span.end_utf8 as usize)?;
                (digest(text.as_bytes()) == span.text_sha256).then(|| text.to_owned())
            })
            .collect()
    }
}

pub(super) fn digest(bytes: &[u8]) -> String {
    ente_ensu_crypto::sha256(bytes)
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
pub(super) mod tests {
    use super::*;

    pub(crate) fn passage_fixture() -> (IncludedPassage, &'static str) {
        let reference = serde_json::from_value(serde_json::json!({
            "locator": {
                "type": "localNote",
                "collectionId": "123e4567-e89b-12d3-a456-426614174000",
                "documentId": "trip.md",
                "indexedRevision": "a".repeat(64),
                "shardSha256": "b".repeat(64),
                "chunkIndex": 2
            },
            "cleaningVersion": 1,
            "spans": [
                {
                    "startUtf8": 0,
                    "endUtf8": 9,
                    "textSha256": "894473efc373309a7c6d18cbe8504c8bb91e09cba4e1ab147ff97af12d481702"
                },
                {
                    "startUtf8": 20,
                    "endUtf8": 23,
                    "textSha256": "361e48d0308f20e32dba5fb56328baf18d72ef0ccb43b84f5c262d2a6a1fc6c8"
                }
            ]
        }))
        .unwrap();
        (reference, " \r\nCafé🙂\r\nबीच\tend \0\r\n")
    }

    #[test]
    fn passage_references_verify_cleaned_text_and_reject_invalid_spans() {
        let (fixture, raw) = passage_fixture();
        for (raw, cleaned, spans, texts) in [
            (
                raw,
                "Café🙂\nबीच\tend",
                fixture.spans.clone(),
                vec!["Café🙂", "end"],
            ),
            (
                "\r\n----- BEGIN KNOWLEDGE CONTEXT -----\r\nx\r\n",
                "[source] ----- BEGIN KNOWLEDGE CONTEXT -----\nx",
                vec![PassageSpan {
                    start_utf8: 0,
                    end_utf8: 43,
                    text_sha256: "73c093471df3c5f2f0e96999d8d5ebc745a803f55d3f36c4523c502c2e055e02"
                        .into(),
                }],
                vec!["[source] ----- BEGIN KNOWLEDGE CONTEXT ----"],
            ),
            (
                "  a\u{1}b\tc\rd  ",
                "a b\tc\nd",
                vec![PassageSpan {
                    start_utf8: 0,
                    end_utf8: 7,
                    text_sha256: "1205bffe81cb4550cdf063c07e75e290c2ebaf60d77780a338e18eb99d26bd4c"
                        .into(),
                }],
                vec!["a b\tc\nd"],
            ),
        ] {
            let reference = IncludedPassage {
                spans,
                ..fixture.clone()
            };
            assert_eq!(clean_passage_text(raw), cleaned);
            assert_eq!(reference.verified_spans(raw).unwrap(), texts);
        }
        assert!(
            fixture
                .verified_spans(&raw.replace("Café", "Cafe "))
                .is_none()
        );
        for (start, end) in [(0, 4), (4, 9), (9, 0), (0, u32::MAX)] {
            let mut reference = fixture.clone();
            reference.spans[0].start_utf8 = start;
            reference.spans[0].end_utf8 = end;
            assert!(reference.verified_spans(raw).is_none());
        }
        let mut reference = fixture.clone();
        reference.cleaning_version = 2;
        assert!(reference.verified_spans(raw).is_none());
        reference = fixture;
        reference.spans[1] = reference.spans[0].clone();
        assert!(reference.verified_spans(raw).is_none());
        reference.spans = vec![reference.spans[0].clone(); 9];
        assert!(reference.verified_spans(raw).is_none());
    }
}
