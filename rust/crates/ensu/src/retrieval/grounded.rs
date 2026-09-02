use serde::{Deserialize, Serialize};

use crate::config::knowledge_datasets;
use crate::notes::{NoteSourceReference, NotesSearchHit};

use super::citation::normalize_required;
use super::prompt::{CONTEXT_WARNING, truncate_utf8};
use super::{
    BEGIN_CONTEXT_SENTINEL, END_CONTEXT_SENTINEL, KnowledgePromptHit, RetrievalError,
    SourceCitation,
};

const MAX_PACK_HITS: usize = 2;
pub const MAX_NOTES_GROUNDING_HITS: usize = 5;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum GroundedSource {
    EnsuPack { citation: SourceCitation },
    LocalNote { reference: NoteSourceReference },
}

#[derive(Debug, Clone, PartialEq)]
pub struct GroundedExcerpt {
    pub score: f32,
    pub source: GroundedSource,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GroundedPromptContext {
    pub text: String,
    pub sources: Vec<GroundedSource>,
}

pub fn select_mixed_grounding_candidates(
    pack_hits: &[KnowledgePromptHit],
    notes_hits: &[NotesSearchHit],
    notes_limit: usize,
) -> Result<Vec<GroundedExcerpt>, RetrievalError> {
    let datasets = knowledge_datasets();
    let mut packs = pack_hits.iter().collect::<Vec<_>>();
    for item in &packs {
        if !item.hit.score.is_finite() {
            return Err(RetrievalError::InvalidInput(
                "Pack hit score must be finite".to_string(),
            ));
        }
    }
    packs.sort_unstable_by(|left, right| {
        right
            .hit
            .score
            .total_cmp(&left.hit.score)
            .then_with(|| left.dataset_id.cmp(&right.dataset_id))
            .then_with(|| left.hit.title.cmp(&right.hit.title))
            .then_with(|| left.hit.source_url.cmp(&right.hit.source_url))
    });
    let mut selected = packs
        .into_iter()
        .take(MAX_PACK_HITS)
        .map(|item| {
            let dataset = datasets
                .iter()
                .find(|dataset| dataset.stable_id == item.dataset_id)
                .ok_or_else(|| {
                    RetrievalError::InvalidInput("unknown knowledge dataset ID".to_string())
                })?;
            let title = display_title(&item.hit.title, item.hit.section.as_deref())?;
            Ok(GroundedExcerpt {
                score: item.hit.score,
                source: GroundedSource::EnsuPack {
                    citation: SourceCitation {
                        dataset_id: dataset.stable_id.clone(),
                        dataset_label: dataset.label.clone(),
                        credit: dataset.attribution.credit.clone(),
                        title,
                        source_url: item.hit.source_url.clone(),
                        license_label: dataset.attribution.license_label.clone(),
                        license_url: dataset.attribution.license_url.clone(),
                    },
                },
                text: item.hit.text.clone(),
            })
        })
        .collect::<Result<Vec<_>, RetrievalError>>()?;

    let mut notes = notes_hits.iter().collect::<Vec<_>>();
    for hit in &notes {
        if !hit.score.is_finite() {
            return Err(RetrievalError::InvalidInput(
                "Notes hit score must be finite".to_string(),
            ));
        }
    }
    notes.sort_unstable_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.collection_id.cmp(&right.collection_id))
            .then_with(|| left.document_id.cmp(&right.document_id))
            .then_with(|| left.section.cmp(&right.section))
            .then_with(|| left.text.cmp(&right.text))
    });
    for hit in notes.into_iter().take(notes_limit) {
        let reference = NoteSourceReference {
            collection_id: hit.collection_id.clone(),
            collection_label: None,
            document_id: hit.document_id.clone(),
            indexed_revision: hit.revision.clone(),
            title: normalize_required(&hit.title, "note title")?,
            section: hit
                .section
                .as_deref()
                .map(|section| normalize_required(section, "note section"))
                .transpose()?,
        };
        reference
            .validate()
            .map_err(|error| RetrievalError::InvalidInput(error.to_string()))?;
        selected.push(GroundedExcerpt {
            score: hit.score,
            source: GroundedSource::LocalNote { reference },
            text: hit.text.clone(),
        });
    }

    selected.sort_unstable_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| source_sort_key(&left.source).cmp(&source_sort_key(&right.source)))
    });
    Ok(selected)
}

pub fn build_grounded_prompt_context(
    excerpts: &[GroundedExcerpt],
    max_utf8_bytes: usize,
) -> Result<Option<GroundedPromptContext>, RetrievalError> {
    if excerpts.is_empty() || max_utf8_bytes == 0 {
        return Ok(None);
    }
    if excerpts.iter().any(|excerpt| !excerpt.score.is_finite()) {
        return Err(RetrievalError::InvalidInput(
            "grounded excerpt score must be finite".to_string(),
        ));
    }

    let header = format!("{BEGIN_CONTEXT_SENTINEL}\n{CONTEXT_WARNING}");
    let footer = format!("\n{END_CONTEXT_SENTINEL}");
    let mut text = header;
    let mut sources = Vec::new();
    for excerpt in excerpts {
        let label = grounded_label(&excerpt.source)?;
        let prefix = format!("\n\n# {label}\n");
        let reserved = text
            .len()
            .checked_add(prefix.len())
            .and_then(|size| size.checked_add(footer.len()))
            .ok_or_else(|| {
                RetrievalError::InvalidInput("grounded context byte budget overflow".to_string())
            })?;
        let Some(available) = max_utf8_bytes.checked_sub(reserved) else {
            continue;
        };
        let sanitized = sanitize_excerpt(&excerpt.text);
        let passage = truncate_utf8(&sanitized, available).trim();
        if passage.is_empty() {
            continue;
        }
        text.push_str(&prefix);
        text.push_str(passage);
        sources.push(excerpt.source.clone());
    }
    if sources.is_empty() {
        return Ok(None);
    }
    text.push_str(&footer);
    debug_assert!(text.len() <= max_utf8_bytes);
    Ok(Some(GroundedPromptContext { text, sources }))
}

fn display_title(title: &str, section: Option<&str>) -> Result<String, RetrievalError> {
    let title = normalize_required(title, "Pack title")?;
    section
        .map(|section| normalize_required(section, "Pack section"))
        .transpose()
        .map(|section| section.map_or(title.clone(), |section| format!("{title} — {section}")))
}

fn source_sort_key(source: &GroundedSource) -> (u8, &str, &str, &str) {
    match source {
        GroundedSource::EnsuPack { citation } => (
            0,
            &citation.dataset_id,
            &citation.source_url,
            &citation.title,
        ),
        GroundedSource::LocalNote { reference } => (
            1,
            &reference.collection_id,
            &reference.document_id,
            &reference.indexed_revision,
        ),
    }
}

fn grounded_label(source: &GroundedSource) -> Result<String, RetrievalError> {
    match source {
        GroundedSource::EnsuPack { citation } => Ok(format!(
            "{} (Ensu Pack · {})",
            normalize_required(&citation.title, "Pack title")?,
            normalize_required(&citation.dataset_label, "Pack label")?
        )),
        GroundedSource::LocalNote { reference } => {
            reference
                .validate()
                .map_err(|error| RetrievalError::InvalidInput(error.to_string()))?;
            let title = display_title(&reference.title, reference.section.as_deref())?;
            Ok(format!("{title} (Your Notes · {})", reference.document_id))
        }
    }
}

fn sanitize_excerpt(value: &str) -> String {
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
            if matches!(line.as_str(), BEGIN_CONTEXT_SENTINEL | END_CONTEXT_SENTINEL) {
                format!("[source] {line}")
            } else {
                line
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::retrieval::RetrievalHit;

    const COLLECTION: &str = "123e4567-e89b-12d3-a456-426614174000";

    fn pack(dataset_id: &str, score: f32, title: &str) -> KnowledgePromptHit {
        KnowledgePromptHit {
            dataset_id: dataset_id.to_string(),
            hit: RetrievalHit {
                score,
                text: format!("{title} passage"),
                title: title.to_string(),
                section: None,
                source_url: format!("https://example.com/{title}"),
            },
        }
    }

    fn note(document_id: &str, score: f32) -> NotesSearchHit {
        NotesSearchHit {
            collection_id: COLLECTION.to_string(),
            document_id: document_id.to_string(),
            revision: "a".repeat(64),
            score,
            title: format!("Title {document_id}"),
            section: Some("Section".to_string()),
            text: format!("{document_id} passage"),
        }
    }

    #[test]
    fn selects_and_formats_mixed_grounding() {
        let packs = vec![
            pack("simplewiki", 0.95, "alpha"),
            pack("wikibooks", 0.90, "beta"),
            pack("fullwiki", 0.80, "gamma"),
        ];
        let notes = vec![
            note("one.md", 0.93),
            note("two.md", 0.91),
            note("three.md", 0.89),
        ];
        let selected =
            select_mixed_grounding_candidates(&packs, &notes, MAX_NOTES_GROUNDING_HITS).unwrap();

        assert_eq!(selected.len(), 5);
        assert_eq!(
            selected.iter().map(|item| item.score).collect::<Vec<_>>(),
            [0.95, 0.93, 0.91, 0.90, 0.89]
        );
        assert_eq!(
            selected
                .iter()
                .filter(|item| matches!(item.source, GroundedSource::EnsuPack { .. }))
                .count(),
            2
        );
        let context = build_grounded_prompt_context(&selected, usize::MAX)
            .unwrap()
            .unwrap();
        assert!(
            context
                .text
                .contains("(Ensu Pack · Simple English Wikipedia)")
        );
        assert!(context.text.contains("(Your Notes · one.md)"));
        assert_eq!(context.sources.len(), selected.len());
    }

    #[test]
    fn skips_an_unfit_source_label_and_uses_the_next_excerpt() {
        let long_document_id = format!("{}.md", "a".repeat(4_093));
        let selected = select_mixed_grounding_candidates(
            &[],
            &[
                NotesSearchHit {
                    title: long_document_id.clone(),
                    ..note(&long_document_id, 0.95)
                },
                note("short.md", 0.90),
            ],
            MAX_NOTES_GROUNDING_HITS,
        )
        .unwrap();
        let context = build_grounded_prompt_context(&selected, 512)
            .unwrap()
            .unwrap();
        assert_eq!(context.sources.len(), 1);
        assert!(context.text.contains("short.md passage"));
        assert!(!context.text.contains(&long_document_id));
    }
}
