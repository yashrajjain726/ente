use super::*;
use crate::notes::NoteSourceReference;
use crate::retrieval::{GroundedSource, PassageLocator};

fn hit(text: &str, id: &str) -> GroundedExcerpt {
    GroundedExcerpt {
        locator: PassageLocator::LocalNote {
            collection_id: "123e4567-e89b-12d3-a456-426614174000".into(),
            document_id: id.into(),
            indexed_revision: "a".repeat(64),
            shard_sha256: "b".repeat(64),
            chunk_index: 0,
        },
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
fn measured_repack_keeps_text_citations_and_exact_spans_together() {
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
        let candidates = GroundingCandidates::new(vec![], vec![hit(&raw, "one.md")], 6000).unwrap();
        let original = serde_json::to_string(&candidates).unwrap();
        let fit = fit_grounding(&candidates, "System", "Question", 4096, measure).unwrap();
        assert!(fit.repacked);
        assert!(fit.evidence_tokens <= 1024);
        let context = fit.context.unwrap();
        assert_eq!(context.sources.len(), context.included_passages.len());
        assert_eq!(context.included_passages.len(), 1);
        for reference in &context.included_passages {
            let spans = reference.verified_spans(&raw).unwrap();
            assert!(context.text.contains(&spans[0]));
            assert!(spans[0].starts_with(prefix));
        }
        assert_eq!(serde_json::to_string(&candidates).unwrap(), original);
    }
}
#[test]
fn requested_old_spans_raise_soft_allowance_and_are_never_cut() {
    let old = hit(&"Old fact. ".repeat(90), "old.md");
    let reference = retrieval::build_grounded_prompt_context(std::slice::from_ref(&old), 6000)
        .unwrap()
        .unwrap()
        .included_passages
        .remove(0);
    let passages = reference.verified_spans(&old.text).unwrap();
    let required = ReferencedPassage {
        reference: reference.clone(),
        source: old.source,
        passages,
    };
    let candidates = GroundingCandidates::new(
        vec![required],
        vec![hit(&"New fact. ".repeat(600), "new.md")],
        6000,
    )
    .unwrap();
    let fit = fit_grounding(&candidates, "System", "Question", 3000, measure).unwrap();
    assert!(fit.repacked && fit.evidence_tokens > 750);
    assert_eq!(fit.context.unwrap().included_passages[0], reference);
    assert!(
        fit_grounding(&candidates, "System", "Question", 700, measure)
            .unwrap()
            .repacked
    );
}
#[test]
fn mandatory_input_and_insufficient_evidence_budget_are_explicit() {
    let candidates =
        GroundingCandidates::new(vec![], vec![hit(&"word ".repeat(1000), "one.md")], 6000).unwrap();
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
fn candidate_limits_are_enforced() {
    let hit = hit("text", "one.md");
    assert!(GroundingCandidates::new(vec![], vec![hit.clone(); 8], 6000).is_err());
    let mut candidates = GroundingCandidates::new(vec![], vec![hit], 6000).unwrap();
    candidates.searched[0].text = "x".repeat(6001);
    assert!(candidates.validate().is_err());
}
#[test]
fn named_comparison_keeps_both_complete_passages_before_optional_hits() {
    let cedar = hit(
        &format!("{}Cedar permits 30 days.", "Cedar details. ".repeat(45)),
        "cedar-policy.md",
    );
    let juniper = hit(
        &format!("{}Juniper permits 21 days.", "Juniper details. ".repeat(25)),
        "juniper-policy.md",
    );
    let mut candidates = GroundingCandidates::new(
        vec![],
        vec![
            cedar.clone(),
            juniper.clone(),
            hit(&"Unrelated details. ".repeat(200), "glacier-policy.md"),
        ],
        6000,
    )
    .unwrap();
    candidates
        .protect_named_sources("Is the Juniper period longer than Cedar?")
        .unwrap();
    assert_eq!(candidates.referenced.len(), 2);
    let fit = fit_grounding(
        &candidates,
        "System",
        "Compare Cedar and Juniper.",
        2500,
        measure,
    )
    .unwrap();
    assert!(fit.repacked);
    let context = fit.context.unwrap();
    for hit in [&cedar, &juniper] {
        assert!(context.text.contains(&hit.text));
        let reference = context
            .included_passages
            .iter()
            .find(|r| r.locator == hit.locator)
            .unwrap();
        assert_eq!(
            reference.verified_spans(&hit.text).unwrap(),
            vec![hit.text.clone()]
        );
    }
    assert!(
        fit_grounding(
            &candidates,
            "System",
            "Compare Cedar and Juniper.",
            900,
            measure
        )
        .unwrap()
        .repacked
    );
}

#[test]
fn ordinary_questions_and_shared_label_words_do_not_promote_every_source() {
    let mut partial = GroundingCandidates::new(
        vec![],
        vec![hit(" ", "cedar.md"), hit("21 days", "juniper.md")],
        6000,
    )
    .unwrap();
    partial
        .protect_named_sources("Compare Cedar and Juniper")
        .unwrap();
    let context = fit_grounding(
        &partial,
        "System",
        "Compare Cedar and Juniper",
        4096,
        measure,
    )
    .unwrap()
    .context
    .unwrap();
    assert_eq!(context.sources.len(), 1);
    assert!(context.text.contains("21 days"));
    let base = GroundingCandidates::new(
        vec![],
        vec![
            hit("30 days", "cedar-policy.md"),
            hit("21 days", "juniper-policy.md"),
        ],
        6000,
    )
    .unwrap();
    for query in ["Compare the policies in my notes", "Explain photography"] {
        let mut c = base.clone();
        c.protect_named_sources(query).unwrap();
        assert!(c.referenced.is_empty());
        assert_eq!(c.pack(6000).unwrap(), base.pack(6000).unwrap());
    }
}

#[test]
fn an_old_reference_and_new_named_document_are_both_protected() {
    let old = hit("Cedar 30 days.", "cedar.md");
    let packed = retrieval::build_grounded_prompt_context(std::slice::from_ref(&old), 6000)
        .unwrap()
        .unwrap();
    let reference = packed.included_passages[0].clone();
    let required = ReferencedPassage {
        passages: reference.verified_spans(&old.text).unwrap(),
        source: old.source,
        reference: reference.clone(),
    };
    let juniper = hit("Juniper 21 days.", "juniper.md");
    let mut second_chunk = juniper.clone();
    if let PassageLocator::LocalNote { chunk_index, .. } = &mut second_chunk.locator {
        *chunk_index = 1;
    }
    let mut c =
        GroundingCandidates::new(vec![required], vec![juniper, second_chunk], 6000).unwrap();
    c.protect_named_sources("Is Juniper longer than that?")
        .unwrap();
    assert_eq!(c.referenced.len(), 2);
    assert_eq!(c.referenced[0].reference, reference);
    c.protect_named_sources("Compare Cedar and Juniper.")
        .unwrap();
    assert_eq!(c.referenced.len(), 2);
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
        vec![],
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
    let c = GroundingCandidates::new(
        vec![],
        vec![hit("The new rule is 21 days.", "current.md")],
        6000,
    )
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

#[test]
fn overlapping_pack_and_note_titles_preserve_both_sources_without_blocking_switches() {
    let mut pack = hit("Mars is the fourth planet.", "unused.md");
    pack.locator = PassageLocator::EnsuPack {
        dataset_id: "wiki".into(),
        revision_sha256: "a".repeat(64),
        row: 0,
    };
    pack.source = GroundedSource::EnsuPack {
        citation: crate::retrieval::SourceCitation {
            dataset_id: "wiki".into(),
            dataset_label: "Wiki".into(),
            credit: "Wiki".into(),
            title: "Mars".into(),
            source_url: "https://example.com/mars".into(),
            license_label: "CC BY-SA 4.0".into(),
            license_url: "https://creativecommons.org/licenses/by-sa/4.0/".into(),
        },
    };
    let mut note = hit("Check-in code COPPER-29.", "mars-expedition.md");
    if let GroundedSource::LocalNote { reference } = &mut note.source {
        reference.title = "Mars expedition checklist".into();
    }
    let query = "Using the Mars encyclopedia entry and the Mars expedition checklist, give its position from the Sun and our expedition check-in code. Answer briefly.";
    let mut c = GroundingCandidates::new(vec![], vec![pack.clone(), note.clone()], 6000).unwrap();
    c.protect_named_sources(query).unwrap();
    assert_eq!(c.referenced.len(), 2);
    assert_eq!(c.pack(6000).unwrap().unwrap().sources.len(), 2);
    assert!(c.pack(100).is_err());

    let context = retrieval::build_grounded_prompt_context(&[pack], 6000)
        .unwrap()
        .unwrap();
    let mut history: Vec<_> = (1..=3)
        .map(|i| Message {
            uuid: Uuid::from_u128(i),
            session_uuid: Uuid::from_u128(100),
            parent_message_uuid: (i > 1).then(|| Uuid::from_u128(i - 1)),
            sender: if i == 2 {
                Sender::Other
            } else {
                Sender::SelfUser
            },
            text: query.into(),
            attachments: vec![],
            created_at: i as i64,
        })
        .collect();
    history[1].text =
        retrieval::finalize_grounded_assistant_text("Fourth planet", &context.sources).unwrap();
    let evidence = vec![AnswerEvidence {
        assistant_message_uuid: history[1].uuid,
        prefix_fingerprint: fingerprint(&history[..2]),
        passages: context.included_passages.clone(),
    }];
    assert_eq!(
        direct_followup_references(&history, &evidence, query, std::slice::from_ref(&note))
            .unwrap(),
        context.included_passages
    );
    assert!(
        direct_followup_references(
            &history,
            &evidence,
            "What is the check-in code in the Mars expedition checklist?",
            &[note]
        )
        .unwrap()
        .is_empty()
    );
}

#[test]
fn direct_followups_reuse_saved_spans_but_named_search_can_change_sources() {
    let prior: Vec<_> = ["cedar", "pine", "birch", "oak", "maple"]
        .iter()
        .map(|name| hit("Archived policy fact.", &format!("{name}.md")))
        .collect();
    let context = retrieval::build_grounded_prompt_context(&prior, 6000)
        .unwrap()
        .unwrap();
    let mut history: Vec<_> = (1..=5)
        .map(|i| Message {
            uuid: Uuid::from_u128(i),
            session_uuid: Uuid::from_u128(100),
            parent_message_uuid: (i > 1).then(|| Uuid::from_u128(i - 1)),
            sender: if i % 2 == 0 {
                Sender::Other
            } else {
                Sender::SelfUser
            },
            text: "Please clarify the subject.".into(),
            attachments: vec![],
            created_at: i as i64,
        })
        .collect();
    history[1].text =
        retrieval::finalize_grounded_assistant_text("Saved facts", &context.sources).unwrap();
    let evidence = vec![AnswerEvidence {
        assistant_message_uuid: history[1].uuid,
        prefix_fingerprint: fingerprint(&history[..2]),
        passages: context.included_passages.clone(),
    }];
    let atlas = hit("Warranty lasts two years.", "atlas.md");
    assert_eq!(
        direct_followup_references(&history, &evidence, "And the deadline?", &[]).unwrap(),
        context.included_passages
    );
    assert!(
        direct_followup_references(
            &history,
            &evidence,
            "How long is the Atlas warranty?",
            std::slice::from_ref(&atlas)
        )
        .unwrap()
        .is_empty()
    );
    let mut candidates = GroundingCandidates::new(vec![], vec![atlas.clone()], 6000).unwrap();
    candidates
        .protect_named_sources("How long is the Atlas warranty?")
        .unwrap();
    assert!(
        candidates
            .pack(6000)
            .unwrap()
            .unwrap()
            .text
            .contains(&atlas.text)
    );
    let mut updated = prior[0].clone();
    updated.text = "Cedar now requires seven days.".into();
    assert!(
        direct_followup_references(
            &history,
            &evidence,
            "What is Cedar's current deadline?",
            &[updated]
        )
        .unwrap()
        .is_empty()
    );
    assert_eq!(
        direct_followup_references(&history, &evidence, "Compare Cedar and Atlas", &[atlas])
            .unwrap(),
        context.included_passages
    );
    history[0].text = "Edited history".into();
    assert!(
        direct_followup_references(&history, &evidence, "And the deadline?", &[])
            .unwrap()
            .is_empty()
    );
}
