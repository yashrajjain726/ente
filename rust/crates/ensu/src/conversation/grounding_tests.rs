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

fn pack_hit(text: &str, title: &str, row: u64) -> GroundedExcerpt {
    GroundedExcerpt {
        locator: PassageLocator::EnsuPack {
            dataset_id: "simplewiki".into(),
            revision_sha256: "a".repeat(64),
            row,
        },
        source: GroundedSource::EnsuPack {
            citation: retrieval::SourceCitation {
                dataset_id: "simplewiki".into(),
                dataset_label: "Wikipedia".into(),
                credit: "Wikipedia".into(),
                title: title.into(),
                source_url: format!("https://example.com/{title}"),
                license_label: "CC BY-SA 4.0".into(),
                license_url: "https://creativecommons.org/licenses/by-sa/4.0/".into(),
            },
        },
        score: 0.9,
        text: text.into(),
    }
}

fn followup_history(prior: &[GroundedExcerpt]) -> (Vec<Message>, Vec<AnswerEvidence>) {
    let old = retrieval::build_grounded_prompt_context(prior, MAX_GROUNDING_BYTES)
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
            text: "Explain the sources.".into(),
            attachments: vec![],
            created_at: i as i64,
        })
        .collect();
    history[1].text =
        retrieval::finalize_grounded_assistant_text("See the cited sources.", &old.sources)
            .unwrap();
    let evidence = vec![AnswerEvidence {
        assistant_message_uuid: history[1].uuid,
        prefix_fingerprint: fingerprint(&history[..2]),
        passages: old.included_passages,
    }];
    (history, evidence)
}

fn fit_followup(
    prior: &[GroundedExcerpt],
    searched: Vec<GroundedExcerpt>,
    query: &str,
    input_budget: usize,
) -> GroundedPromptContext {
    let (history, evidence) = followup_history(prior);
    let reloaded = direct_followup_references(&history, &evidence, query, &searched)
        .into_iter()
        .map(|reference| {
            let hit = prior
                .iter()
                .find(|hit| hit.locator == reference.locator)
                .unwrap();
            ReferencedPassage {
                passages: reference.verified_spans(&hit.text).unwrap(),
                source: hit.source.clone(),
                reference,
            }
        })
        .collect();
    let mut candidates = GroundingCandidates::new(reloaded, searched, MAX_GROUNDING_BYTES).unwrap();
    candidates.protect_named_sources(query).unwrap();
    let context = fit_grounding(&candidates, "System", query, input_budget, measure)
        .unwrap()
        .context
        .unwrap();
    assert!(context.text.len() <= MAX_GROUNDING_BYTES);
    assert!(
        measure(&answer_messages(
            &grounded_system("System", Some(&context)),
            None,
            &[],
            query
        ))
        .unwrap()
            <= input_budget
    );
    context
}

#[test]
fn followup_fitting_keeps_implicit_antecedents_and_allows_named_switches() {
    let cedar = hit("Cedar allows 30 days.", "cedar.md");
    let juniper = hit("Juniper allows 21 days.", "juniper.md");
    let old = retrieval::build_grounded_prompt_context(std::slice::from_ref(&cedar), 6000)
        .unwrap()
        .unwrap();
    for query in [
        "Is Juniper longer than that?",
        "Compare its deadline with Juniper.",
        "Is Juniper's return period longer than ours?",
        "Is Juniper's return period longer than mine?",
        "Compare Juniper's return period with our policy.",
        "Compare Juniper's return period with my policy.",
        "Does she get more time than Juniper?",
        "Compare her deadline with Juniper.",
        "Is Juniper's deadline longer than hers?",
        "Does he get more time than Juniper?",
        "Does Juniper get more time than him?",
        "Compare his deadline with Juniper.",
    ] {
        let context = fit_followup(
            std::slice::from_ref(&cedar),
            vec![juniper.clone()],
            query,
            7000,
        );
        assert!(context.text.contains(&cedar.text), "{query}");
        assert!(context.text.contains(&juniper.text), "{query}");
        assert!(
            context
                .included_passages
                .contains(&old.included_passages[0])
        );
    }
    let updated = hit("Cedar now requires seven days.", "cedar.md");
    for (query, fresh) in [
        ("What is Juniper's return period?", &juniper),
        ("What is within Juniper's coverage?", &juniper),
        ("What is Cedar's current deadline?", &updated),
    ] {
        let context = fit_followup(
            std::slice::from_ref(&cedar),
            vec![fresh.clone()],
            query,
            7000,
        );
        assert_eq!(context.sources, vec![fresh.source.clone()], "{query}");
        assert!(context.text.contains(&fresh.text), "{query}");
    }
}

#[test]
fn followup_fitting_prioritizes_named_sources_at_source_and_byte_limits() {
    let mut prior: Vec<_> = ["pine", "birch", "oak", "maple", "cedar"]
        .iter()
        .map(|name| hit(&format!("{name} allows 30 days."), &format!("{name}.md")))
        .collect();
    let atlas = hit(&"Atlas allows 21 days. ".repeat(40), "atlas.md");
    let note_count = prior.len();
    prior.extend([
        pack_hit("Mars is the fourth planet.", "Mars", 0),
        pack_hit("Venus is the second planet.", "Venus", 1),
    ]);
    let byte_limited = [
        prior[note_count - 1].clone(),
        hit(&"Unrelated detail. ".repeat(400), "pine.md"),
    ];
    for prior in [&prior[..note_count], &prior[..], &byte_limited] {
        let context = fit_followup(prior, vec![atlas.clone()], "Compare Cedar and Atlas", 7000);
        assert!(context.text.contains("cedar allows 30 days."));
        assert!(context.text.contains(atlas.text.trim()));
        assert!(context.sources.len() <= retrieval::MAX_GROUNDING_HITS);
    }

    let mars = pack_hit("Mars is the fourth planet.", "Mars", 0);
    let venus = pack_hit("Venus is the second planet.", "Venus", 1);
    let jupiter = pack_hit("Jupiter is the fifth planet.", "Jupiter", 2);
    let another_mars_chunk = pack_hit("Mars also has two moons.", "Mars", 3);
    for prior in [[venus, mars.clone()], [mars.clone(), another_mars_chunk]] {
        let context = fit_followup(
            &prior,
            vec![jupiter.clone()],
            "Compare Mars and Jupiter",
            7000,
        );
        assert!(context.text.contains(&mars.text));
        assert!(context.text.contains(&jupiter.text));
        assert_eq!(context.sources.len(), 2);
    }
}

#[test]
fn unnamed_questions_keep_fresh_results_and_available_historical_passages() {
    let notes: Vec<_> = ["cedar", "pine", "birch", "oak", "maple"]
        .iter()
        .map(|name| hit(&format!("{name} allows 30 days."), &format!("{name}.md")))
        .collect();
    let biology = hit(
        "Photosynthesis converts light into energy.",
        "biology-chapter-seven.md",
    );
    let mut another_chunk = notes[0].clone();
    if let PassageLocator::LocalNote { chunk_index, .. } = &mut another_chunk.locator {
        *chunk_index += 1;
    }
    another_chunk.text = "International shipping has an extended deadline.".into();
    let old = retrieval::build_grounded_prompt_context(&notes, MAX_GROUNDING_BYTES)
        .unwrap()
        .unwrap();
    for (query, fresh) in [
        ("How does photosynthesis work?", &biology),
        ("And the deadline?", &biology),
        ("And the deadline?", &another_chunk),
    ] {
        let context = fit_followup(&notes, vec![fresh.clone()], query, 7000);
        assert!(context.text.contains(&fresh.text), "{query}");
        assert!(context.text.contains(&notes[0].text), "{query}");
        assert!(
            context
                .included_passages
                .contains(&old.included_passages[0])
        );
        assert!(context.sources.len() <= retrieval::MAX_NOTES_GROUNDING_HITS);
    }

    let packs = [
        pack_hit("Mars is the fourth planet.", "Mars", 0),
        pack_hit("Venus is the second planet.", "Venus", 1),
    ];
    let fresh = pack_hit("Plants use sunlight to produce sugar.", "Botany", 2);
    let context = fit_followup(
        &packs,
        vec![fresh.clone()],
        "How does photosynthesis work?",
        7000,
    );
    assert!(context.text.contains(&fresh.text));
    assert!(context.text.contains(&packs[0].text));
    assert_eq!(context.sources.len(), retrieval::MAX_PACK_HITS);

    let context = fit_followup(&notes, vec![], "And the deadline?", 7000);
    assert_eq!(context.included_passages, old.included_passages);
}

#[test]
fn fresh_followup_results_survive_byte_and_token_repacking() {
    let prefix = hit("Price: 100 rupees.", "cedar.md");
    let mut full = prefix.clone();
    full.text.push_str(" Warranty duration: 24 months.");
    let context = fit_followup(
        &[prefix],
        vec![full.clone()],
        "And what's its warranty duration?",
        7000,
    );
    assert!(context.text.contains(&full.text));
    assert_eq!(context.sources, vec![full.source]);
    assert_eq!(context.included_passages.len(), 1);
    assert_eq!(
        context.included_passages[0]
            .verified_spans(&full.text)
            .unwrap(),
        vec![full.text]
    );

    let old = hit(&"Cedar allows 30 days. ".repeat(280), "cedar.md");
    let fresh = hit(
        &format!(
            "Plants use light. {}",
            "Photosynthesis details. ".repeat(300)
        ),
        "biology-chapter-seven.md",
    );
    for input_budget in [7000, 1600] {
        let context = fit_followup(
            std::slice::from_ref(&old),
            vec![old.clone(), fresh.clone()],
            "How does photosynthesis work?",
            input_budget,
        );
        assert!(context.text.contains("Plants use light."));
        let reference = context
            .included_passages
            .iter()
            .find(|reference| reference.locator == fresh.locator)
            .unwrap();
        let spans = reference.verified_spans(&fresh.text).unwrap();
        assert!(context.text.contains(&spans[0]));
    }

    let mut long_label = hit("Plants use light.", "biology.md");
    if let GroundedSource::LocalNote { reference } = &mut long_label.source {
        reference.title = "Biology ".repeat(400);
    }
    let context = fit_followup(
        &[old],
        vec![long_label.clone()],
        "How does photosynthesis work?",
        7000,
    );
    assert!(context.text.contains(&long_label.text));
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
        let fit = fit_grounding(&candidates, "System", "Question", 4096, measure).unwrap();
        assert!(fit.repacked);
        assert!(fit.evidence_tokens <= 1024);
        let context = fit.context.unwrap();
        assert_eq!(context.sources, vec![candidates.searched[0].source.clone()]);
        assert_eq!(context.included_passages.len(), 1);
        let spans = context.included_passages[0].verified_spans(&raw).unwrap();
        assert!(context.text.contains(&spans[0]));
        assert!(spans[0].starts_with(prefix));
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
}

#[test]
fn ordinary_questions_and_shared_label_words_do_not_promote_every_source() {
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
    let pack = pack_hit("Mars is the fourth planet.", "Mars", 0);
    let mut note = hit("Check-in code COPPER-29.", "mars-expedition.md");
    if let GroundedSource::LocalNote { reference } = &mut note.source {
        reference.title = "Mars expedition checklist".into();
    }
    let query = "Using the Mars encyclopedia entry and the Mars expedition checklist, give its position from the Sun and our expedition check-in code. Answer briefly.";
    let mut c = GroundingCandidates::new(vec![], vec![pack.clone(), note.clone()], 6000).unwrap();
    c.protect_named_sources(query).unwrap();
    assert_eq!(c.referenced.len(), 2);
    assert_eq!(c.pack(6000).unwrap().unwrap().sources.len(), 2);

    let (history, evidence) = followup_history(&[pack]);
    assert_eq!(
        direct_followup_references(&history, &evidence, query, std::slice::from_ref(&note)),
        evidence[0].passages
    );
    assert!(
        direct_followup_references(
            &history,
            &evidence,
            "What is the check-in code in the Mars expedition checklist?",
            &[note]
        )
        .is_empty()
    );
}

#[test]
fn followups_use_last_available_evidence_until_its_history_changes() {
    let (mut history, evidence) = followup_history(&[hit("Archived policy fact.", "cedar.md")]);
    for i in 4..=5 {
        history.push(Message {
            uuid: Uuid::from_u128(i),
            parent_message_uuid: Some(Uuid::from_u128(i - 1)),
            sender: if i == 4 {
                Sender::Other
            } else {
                Sender::SelfUser
            },
            ..history[2].clone()
        });
    }
    assert_eq!(
        direct_followup_references(&history, &evidence, "And the deadline?", &[]),
        evidence[0].passages
    );
    history[0].text = "Edited history".into();
    assert!(direct_followup_references(&history, &evidence, "And the deadline?", &[]).is_empty());
}
