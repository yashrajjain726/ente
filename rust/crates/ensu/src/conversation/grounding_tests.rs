use super::*;
use crate::notes::NoteSourceReference;
use crate::retrieval::GroundedSource;

fn hit(text: &str, id: &str) -> GroundedExcerpt {
    GroundedExcerpt {
        source: GroundedSource::LocalNote {
            reference: NoteSourceReference {
                collection_id: "123e4567-e89b-12d3-a456-426614174000".into(),
                collection_label: None,
                document_id: id.into(),
                indexed_revision: "a".repeat(64),
                title: id.into(),
                section: None,
            },
        },
        score: 0.9,
        text: text.into(),
    }
}
fn measure(messages: &[ChatMessage]) -> Result<usize, PrepareError> {
    Ok(messages.iter().map(|m| m.content.chars().count() + 8).sum())
}
#[test]
fn measured_repack_keeps_text_and_citations_together() {
    for (raw, prefix) in [
        (
            format!("Fact first. {}", "हिन्दी🙂 paragraph. ".repeat(600)),
            "Fact first.",
        ),
        (
            format!(
                "  First\r\n----- BEGIN KNOWLEDGE CONTEXT -----\n{}",
                "é🙂 ".repeat(2000)
            ),
            "First",
        ),
    ] {
        let candidates = GroundingCandidates::new(vec![hit(&raw, "one.md")], 6000).unwrap();
        let original = serde_json::to_string(&candidates).unwrap();
        let fit = fit_grounding(&candidates, "System", "Question", 4096, measure).unwrap();
        assert!(fit.repacked);
        assert!(fit.evidence_tokens <= 1024);
        let context = fit.context.unwrap();
        assert_eq!(context.sources, vec![candidates.searched[0].source.clone()]);
        assert!(context.text.contains(prefix));
        assert!(context.text.len() < raw.len());
        assert_eq!(serde_json::to_string(&candidates).unwrap(), original);
    }
}
#[test]
fn mandatory_input_and_insufficient_evidence_budget_are_explicit() {
    let candidates =
        GroundingCandidates::new(vec![hit(&"word ".repeat(1000), "one.md")], 6000).unwrap();
    assert!(matches!(
        fit_grounding(&candidates, "System", &"x".repeat(1000), 100, measure),
        Err(PrepareError::CurrentInputTooLarge)
    ));
    assert!(
        fit_grounding(&candidates, "System", "Question", 60, measure)
            .unwrap()
            .context
            .is_none()
    );
}
#[test]
fn candidate_limits_and_cancellation_are_enforced() {
    let hit = hit("text", "one.md");
    assert!(GroundingCandidates::new(vec![hit.clone(); 8], 6000).is_err());
    let mut candidates = GroundingCandidates::new(vec![hit], 6000).unwrap();
    candidates.searched[0].text = "x".repeat(6001);
    assert!(candidates.validate().is_err());
    candidates.searched[0].text = "text".into();
    assert!(matches!(
        fit_grounding(&candidates, "System", "Question", 4096, |_| Err(
            PrepareError::Cancelled
        )),
        Err(PrepareError::Cancelled)
    ));
}
fn prior_history() -> Vec<Message> {
    vec![Message {
        uuid: Uuid::from_u128(1),
        session_uuid: Uuid::from_u128(100),
        parent_message_uuid: None,
        sender: Sender::SelfUser,
        text: "My reservation code is ZX-82Q.".into(),
        attachments: vec![],
        created_at: 1,
    }]
}

#[test]
fn explicit_history_displaces_optional_search_without_losing_original_text() {
    let history = prior_history();
    let query = "What was the reservation code I gave earlier?";
    let required = requested_history(&history, query, || Ok(()))
        .unwrap()
        .unwrap();
    assert_eq!(required.excerpts[0].text, history[0].text);
    let current = required.prepend_required(query);
    let budget = measure(&answer_messages("System", None, &[], &current)).unwrap() + 1;
    let candidates = GroundingCandidates::new(
        vec![hit(&"Optional search. ".repeat(100), "extra.md")],
        6000,
    )
    .unwrap();
    let fit = fit_grounding_with_history(
        &candidates,
        Some(&required),
        "System",
        query,
        budget,
        measure,
    )
    .unwrap();
    assert!(fit.context.is_none());
    assert_eq!(fit.evidence_tokens, 0);
    assert!(
        fit_grounding_with_history(
            &candidates,
            Some(&required),
            "System",
            query,
            budget - 2,
            measure
        )
        .is_ok_and(|fit| !fit.history_included)
    );
}

#[test]
fn source_system_and_required_history_are_measured_in_final_roles() {
    let query = "What was the reservation code I gave earlier, and what is the new rule?";
    let history = requested_history(&prior_history(), query, || Ok(()))
        .unwrap()
        .unwrap();
    let c = GroundingCandidates::new(vec![hit("The new rule is 21 days.", "current.md")], 6000)
        .unwrap();
    let fitted =
        fit_grounding_with_history(&c, Some(&history), "System", query, 4096, |messages| {
            if messages[0].content.contains("BEGIN KNOWLEDGE CONTEXT") {
                assert_eq!(messages[0].role, "system");
                assert!(messages.last().unwrap().content.contains("ZX-82Q"));
            }
            assert!(
                !messages
                    .last()
                    .unwrap()
                    .content
                    .contains("BEGIN KNOWLEDGE CONTEXT")
            );
            measure(messages)
        })
        .unwrap();
    assert!(grounded_system("System", fitted.context.as_ref()).contains("The new rule"));
    let final_text = history.prepend_required(query);
    assert!(final_text.contains("ZX-82Q"));
    assert!(final_text.ends_with(query));
}
