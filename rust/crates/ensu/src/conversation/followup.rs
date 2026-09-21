use super::{AnswerEvidence, valid_answer_passages};
use crate::db::Message;
use crate::retrieval::IncludedPassage;

pub fn direct_followup_references(
    history: &[Message],
    evidence: &[AnswerEvidence],
    question: &str,
    searched: &[crate::retrieval::GroundedExcerpt],
) -> Option<Vec<IncludedPassage>> {
    let Some((message, entry)) = history.iter().rev().skip(1).find_map(|message| {
        evidence
            .iter()
            .find(|entry| entry.assistant_message_uuid == message.uuid && entry.matches(history))
            .map(|entry| (message, entry))
    }) else {
        return Some(Vec::new());
    };
    if !valid_answer_passages(&entry.passages) {
        return None;
    }
    let prior = crate::retrieval::parse_grounded_assistant_text(&message.text).sources;
    let named = super::grounding::named_source_keys(
        question,
        prior.iter().chain(searched.iter().map(|hit| &hit.source)),
    );
    if !named.is_empty()
        && named.iter().all(|key| {
            searched
                .iter()
                .any(|hit| super::grounding::source_key(&hit.source) == *key)
        })
    {
        Some(Vec::new())
    } else {
        Some(entry.passages.clone())
    }
}
