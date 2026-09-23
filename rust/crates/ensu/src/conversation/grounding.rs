use super::*;
use crate::retrieval::{self, GroundedExcerpt, GroundedPromptContext};

pub const MAX_GROUNDING_BYTES: usize = 6000;
pub const MAX_CANDIDATE_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GroundingCandidates {
    pub searched: Vec<GroundedExcerpt>,
    pub max_utf8_bytes: usize,
}

impl GroundingCandidates {
    pub fn new(
        mut searched: Vec<GroundedExcerpt>,
        max_utf8_bytes: usize,
    ) -> Result<Self, PrepareError> {
        for hit in &mut searched {
            hit.text = retrieval::sanitize_excerpt(&hit.text);
            let mut end = hit.text.len().min(MAX_GROUNDING_BYTES);
            while !hit.text.is_char_boundary(end) {
                end -= 1;
            }
            hit.text.truncate(end);
        }
        let result = Self {
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
        if self.searched.len() > retrieval::MAX_GROUNDING_HITS
            || packs > retrieval::MAX_PACK_HITS
            || self.searched.len().saturating_sub(packs) > retrieval::MAX_NOTES_GROUNDING_HITS
            || self.max_utf8_bytes > MAX_GROUNDING_BYTES
            || self
                .searched
                .iter()
                .any(|h| h.text.len() > MAX_GROUNDING_BYTES || !h.score.is_finite())
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
        retrieval::build_grounded_prompt_context(&self.searched, budget.min(self.max_utf8_bytes))
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
    let initial = candidates.pack(candidates.max_utf8_bytes).ok().flatten();
    let allowance = 1500.min(input_budget / 4).min(room);
    let initial_count = count_context(initial.as_ref())?;
    let initial_tokens = initial_count.saturating_sub(base);
    if initial_count <= input_budget && initial_tokens <= allowance {
        return Ok(FittedGrounding {
            context: initial,
            repacked: false,
            evidence_tokens: initial_tokens,
            history_included: false,
        });
    }
    let initial_bytes = initial.as_ref().map_or(0, |c| c.text.len());
    let smaller =
        initial_bytes.saturating_mul(allowance).saturating_mul(4) / initial_tokens.max(1) / 5;
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
        context: None,
        repacked: true,
        evidence_tokens: 0,
        history_included: false,
    })
}

#[cfg(test)]
#[path = "grounding_tests.rs"]
mod tests;
