mod download;
mod footer;
mod index;
mod reconcile;

fn normalize_single_line(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub use download::download_knowledge_pack;
pub use footer::{
    ParsedAssistantText, SourceCitation, clean_assistant_text, finalize_assistant_text,
    knowledge_source_chip_label, parse_assistant_text,
};
pub use index::{RetrievalError, RetrievalHit, RetrievalIndex};
pub use reconcile::{
    KnowledgeReconciliation, KnowledgeReconciliationStatus,
    cleanup_obsolete_knowledge_pack_revisions, reconcile_knowledge_pack,
};
