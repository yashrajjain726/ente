use super::{AnswerEvidence, valid_answer_passages};
use crate::db::Message;
use crate::retrieval::IncludedPassage;

fn refers_back(question: &str) -> bool {
    question.split(|c: char| !c.is_alphanumeric()).any(|word| {
        matches!(
            word.to_lowercase().as_str(),
            "it" | "its"
                | "this"
                | "that"
                | "these"
                | "those"
                | "my"
                | "mine"
                | "our"
                | "ours"
                | "they"
                | "them"
                | "their"
                | "theirs"
                | "she"
                | "her"
                | "hers"
                | "he"
                | "him"
                | "his"
                | "former"
                | "latter"
                | "above"
                | "previous"
                | "earlier"
        )
    })
}

pub fn direct_followup_references(
    history: &[Message],
    evidence: &[AnswerEvidence],
    question: &str,
    searched: &[crate::retrieval::GroundedExcerpt],
) -> Vec<IncludedPassage> {
    let Some((message, entry)) = history.iter().rev().skip(1).find_map(|message| {
        evidence
            .iter()
            .find(|entry| entry.assistant_message_uuid == message.uuid && entry.matches(history))
            .map(|entry| (message, entry))
    }) else {
        return Vec::new();
    };
    if !valid_answer_passages(&entry.passages) {
        return Vec::new();
    }
    let prior = crate::retrieval::parse_grounded_assistant_text(&message.text).sources;
    let named = super::grounding::named_source_keys(
        question,
        prior.iter().chain(searched.iter().map(|hit| &hit.source)),
    );
    if !refers_back(question)
        && !named.is_empty()
        && named.iter().all(|key| {
            searched
                .iter()
                .any(|hit| super::grounding::source_key(&hit.source) == *key)
        })
    {
        Vec::new()
    } else {
        entry.passages.clone()
    }
}
