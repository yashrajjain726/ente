use super::*;
use crate::retrieval::{self, GroundedExcerpt, GroundedPromptContext, ReferencedPassage};

pub const MAX_GROUNDING_BYTES: usize = 6000;
pub const MAX_CANDIDATE_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GroundingCandidates {
    pub referenced: Vec<ReferencedPassage>,
    pub searched: Vec<GroundedExcerpt>,
    pub max_utf8_bytes: usize,
}

pub(super) fn source_key(source: &retrieval::GroundedSource) -> (u8, String, String) {
    match source {
        retrieval::GroundedSource::LocalNote { reference } => (
            0,
            reference.collection_id.clone(),
            reference.document_id.clone(),
        ),
        retrieval::GroundedSource::EnsuPack { citation } => {
            (1, citation.dataset_id.clone(), citation.source_url.clone())
        }
    }
}

pub(super) fn named_source_keys<'a>(
    query: &str,
    sources: impl Iterator<Item = &'a retrieval::GroundedSource>,
) -> std::collections::BTreeSet<(u8, String, String)> {
    use std::collections::{BTreeMap, BTreeSet};
    let words = |text: &str| -> BTreeSet<String> {
        text.split(|c: char| !c.is_alphanumeric())
            .filter(|s| s.chars().count() >= 3)
            .map(str::to_lowercase)
            .filter(|s| !"the and source sources note notes policy policies document documents return access equipment".split_whitespace().any(|w| w == s))
            .collect()
    };
    let tokens = |text: &str| -> Vec<String> {
        text.split(|c: char| !c.is_alphanumeric())
            .filter(|s| !s.is_empty())
            .map(str::to_lowercase)
            .collect()
    };
    let query_tokens = tokens(query);
    let mut title_matches = Vec::new();
    let mut documents = BTreeMap::<_, BTreeSet<String>>::new();
    for source in sources {
        let title = match source {
            retrieval::GroundedSource::LocalNote { reference } => &reference.title,
            retrieval::GroundedSource::EnsuPack { citation } => &citation.title,
        };
        let mut label_words = words(title);
        if !label_words.is_empty() {
            let title = tokens(title);
            for (start, window) in query_tokens.windows(title.len()).enumerate() {
                if window == title {
                    title_matches.push((source_key(source), start, start + title.len()));
                }
            }
        }
        if let retrieval::GroundedSource::LocalNote { reference } = source {
            label_words.extend(words(&reference.document_id));
        }
        documents
            .entry(source_key(source))
            .or_default()
            .extend(label_words);
    }
    let query_words = words(query);
    documents
        .iter()
        .filter(|(key, label)| {
            title_matches.iter().any(|(matched, start, end)| {
                matched == *key
                    && !title_matches.iter().any(|(_, other_start, other_end)| {
                        other_start <= start
                            && other_end >= end
                            && other_end - other_start > end - start
                    })
            }) || label.iter().any(|word| {
                query_words.contains(word)
                    && documents
                        .values()
                        .filter(|other| other.contains(word))
                        .count()
                        == 1
            })
        })
        .map(|(key, _)| key.clone())
        .collect()
}

impl GroundingCandidates {
    pub(super) fn protect_named_sources(&mut self, query: &str) -> Result<(), PrepareError> {
        self.validate()?;
        if query.len() > super::lookup::LOOKUP_MAX_QUERY_BYTES {
            return Ok(());
        }
        let named = named_source_keys(
            query,
            self.referenced
                .iter()
                .map(|r| &r.source)
                .chain(self.searched.iter().map(|r| &r.source)),
        );
        let fresh_index = if !self.referenced.is_empty() && named.is_empty() {
            self.searched.iter().position(|hit| {
                !hit.text.trim().is_empty()
                    && !self
                        .referenced
                        .iter()
                        .any(|r| r.reference.locator == hit.locator)
            })
        } else {
            None
        };
        if let Some(index) = fresh_index {
            self.searched[..=index].rotate_right(1);
        }
        let mut required: std::collections::BTreeSet<_> = self
            .referenced
            .iter()
            .map(|r| source_key(&r.source))
            .collect();
        let mut promoted = Vec::new();
        for (index, hit) in self.searched.iter().enumerate() {
            let fresh = fresh_index.is_some() && index == 0;
            let id = source_key(&hit.source);
            if !fresh && (!named.contains(&id) || required.contains(&id)) {
                continue;
            }
            let budgets = if fresh {
                [self.max_utf8_bytes / 2, self.max_utf8_bytes]
            } else {
                [usize::MAX; 2]
            };
            let Some(reference) = budgets.into_iter().find_map(|budget| {
                retrieval::build_grounded_prompt_context(std::slice::from_ref(hit), budget)
                    .ok()
                    .flatten()?
                    .included_passages
                    .into_iter()
                    .next()
            }) else {
                continue;
            };
            let Some(passages) = reference.verified_spans(&hit.text) else {
                continue;
            };
            required.insert(id);
            promoted.push(ReferencedPassage {
                reference,
                source: hit.source.clone(),
                passages,
            });
        }

        let (mut named_references, incidental): (Vec<_>, Vec<_>) =
            std::mem::take(&mut self.referenced)
                .into_iter()
                .partition(|r| named.contains(&source_key(&r.source)));
        named_references.extend(promoted);
        let mut seen = std::collections::BTreeSet::new();
        let (distinct, additional): (Vec<_>, Vec<_>) = named_references
            .into_iter()
            .partition(|r| seen.insert(source_key(&r.source)));
        let mut packs = 0;
        let mut notes = 0;
        for reference in distinct.into_iter().chain(additional).chain(incidental) {
            let (count, limit) = match &reference.source {
                retrieval::GroundedSource::EnsuPack { .. } => {
                    (&mut packs, retrieval::MAX_PACK_HITS)
                }
                retrieval::GroundedSource::LocalNote { .. } => {
                    (&mut notes, retrieval::MAX_NOTES_GROUNDING_HITS)
                }
            };
            if *count == limit {
                continue;
            }
            self.referenced.push(reference);
            if self.validate().is_err() {
                self.referenced.pop();
            } else {
                *count += 1;
            }
        }
        Ok(())
    }

    pub fn new(
        mut referenced: Vec<ReferencedPassage>,
        mut searched: Vec<GroundedExcerpt>,
        max_utf8_bytes: usize,
    ) -> Result<Self, PrepareError> {
        for hit in &mut searched {
            hit.text = retrieval::clean_passage_text(&hit.text);
            let mut end = hit.text.len().min(MAX_GROUNDING_BYTES);
            while !hit.text.is_char_boundary(end) {
                end -= 1;
            }
            hit.text.truncate(end);
        }
        referenced.truncate(retrieval::MAX_GROUNDING_HITS);
        while referenced
            .iter()
            .flat_map(|r| &r.passages)
            .map(String::len)
            .sum::<usize>()
            > MAX_GROUNDING_BYTES
        {
            referenced.pop();
        }
        let result = Self {
            referenced,
            searched,
            max_utf8_bytes: max_utf8_bytes.min(MAX_GROUNDING_BYTES),
        };
        result.validate()?;
        Ok(result)
    }

    pub fn validate(&self) -> Result<(), PrepareError> {
        let packs = self
            .searched
            .iter()
            .filter(|hit| matches!(hit.source, retrieval::GroundedSource::EnsuPack { .. }))
            .count();
        if self.referenced.len() > retrieval::MAX_GROUNDING_HITS
            || self.searched.len() > retrieval::MAX_GROUNDING_HITS
            || packs > retrieval::MAX_PACK_HITS
            || self.searched.len().saturating_sub(packs) > retrieval::MAX_NOTES_GROUNDING_HITS
            || self.max_utf8_bytes > MAX_GROUNDING_BYTES
            || self
                .searched
                .iter()
                .any(|h| h.text.len() > MAX_GROUNDING_BYTES || !h.score.is_finite())
            || self
                .referenced
                .iter()
                .flat_map(|r| &r.passages)
                .map(String::len)
                .sum::<usize>()
                > MAX_GROUNDING_BYTES
            || serde_json::to_vec(self)
                .map_err(|e| PrepareError::Backend(e.to_string()))?
                .len()
                > MAX_CANDIDATE_BYTES
        {
            return Err(PrepareError::Backend(
                "Source candidates exceed the supported preparation limits".into(),
            ));
        }
        Ok(())
    }

    pub fn pack(&self, budget: usize) -> Result<Option<GroundedPromptContext>, PrepareError> {
        retrieval::build_followup_prompt_context(
            &self.referenced,
            &self.searched,
            budget.min(self.max_utf8_bytes),
        )
        .map_err(|e| PrepareError::Backend(e.to_string()))
    }
}

pub struct FittedGrounding {
    pub history_included: bool,
    pub context: Option<GroundedPromptContext>,
    pub repacked: bool,
    pub evidence_tokens: usize,
}

pub(super) fn grounded_system(system: &str, context: Option<&GroundedPromptContext>) -> String {
    context.map_or_else(
        || system.to_owned(),
        |context| format!("{system}\n\n{}", context.text),
    )
}

pub(super) fn fit_grounding_with_history(
    candidates: &GroundingCandidates,
    history: Option<&HistoryLookup>,
    system: &str,
    current: &str,
    input_budget: usize,
    mut measure: impl FnMut(&[ChatMessage]) -> Result<usize, PrepareError>,
) -> Result<FittedGrounding, PrepareError> {
    let recovered = match history.map(|history| history.prepend_required(current)) {
        Some(recovered)
            if measure(&answer_messages(system, None, &[], &recovered))? <= input_budget =>
        {
            Some(recovered)
        }
        _ => None,
    };
    let mut fitted = fit_grounding(
        candidates,
        system,
        recovered.as_deref().unwrap_or(current),
        input_budget,
        measure,
    )?;
    fitted.history_included = recovered.is_some();
    Ok(fitted)
}

fn fit_grounding(
    candidates: &GroundingCandidates,
    system: &str,
    current: &str,
    input_budget: usize,
    mut measure: impl FnMut(&[ChatMessage]) -> Result<usize, PrepareError>,
) -> Result<FittedGrounding, PrepareError> {
    candidates.validate()?;
    let base = measure(&answer_messages(system, None, &[], current))?;
    let room = input_budget
        .checked_sub(base)
        .ok_or(PrepareError::CurrentInputTooLarge)?;
    let mut count_context = |context: Option<&GroundedPromptContext>| {
        measure(&answer_messages(
            &grounded_system(system, context),
            None,
            &[],
            current,
        ))
    };
    let original_references = candidates.referenced.len();
    let mut candidates = candidates.clone();
    let (initial, required, required_tokens) = loop {
        let packed = candidates.pack(candidates.max_utf8_bytes);
        let required = retrieval::build_followup_prompt_context(
            &candidates.referenced,
            &[],
            candidates.max_utf8_bytes,
        );
        if let (Ok(initial), Ok(required)) = (packed, required) {
            let tokens = count_context(required.as_ref())?.saturating_sub(base);
            if tokens <= room {
                break (initial, required, tokens);
            }
        }
        if candidates.referenced.pop().is_none() {
            break (None, None, 0);
        }
    };
    let allowance = 1500.min(input_budget / 4).max(required_tokens).min(room);
    let initial_count = count_context(initial.as_ref())?;
    let initial_tokens = initial_count.saturating_sub(base);
    if initial_count <= input_budget && initial_tokens <= allowance {
        return Ok(FittedGrounding {
            context: initial,
            repacked: candidates.referenced.len() != original_references,
            evidence_tokens: initial_tokens,
            history_included: false,
        });
    }
    let required_bytes = required.as_ref().map_or(0, |c| c.text.len());
    let initial_bytes = initial.as_ref().map_or(0, |c| c.text.len());
    let extra_tokens = initial_tokens.saturating_sub(required_tokens).max(1);
    let extra_allowance = allowance.saturating_sub(required_tokens);
    let smaller = required_bytes
        + initial_bytes
            .saturating_sub(required_bytes)
            .saturating_mul(extra_allowance)
            .saturating_mul(4)
            / extra_tokens
            / 5;
    let packed = candidates
        .pack(smaller.min(initial_bytes.saturating_sub(1)))
        .ok()
        .flatten();
    if let Some(packed) = packed {
        let final_count = count_context(Some(&packed))?;
        let final_tokens = final_count.saturating_sub(base);
        if final_count <= input_budget && final_tokens <= allowance {
            return Ok(FittedGrounding {
                context: Some(packed),
                repacked: true,
                evidence_tokens: final_tokens,
                history_included: false,
            });
        }
    }
    Ok(FittedGrounding {
        context: required,
        repacked: true,
        evidence_tokens: required_tokens,
        history_included: false,
    })
}

#[cfg(test)]
#[path = "grounding_tests.rs"]
mod tests;
