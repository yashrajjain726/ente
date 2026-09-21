use super::*;

fn message(index: u128, sender: Sender, text: &str) -> Message {
    Message {
        uuid: Uuid::from_u128(index),
        session_uuid: Uuid::from_u128(100),
        parent_message_uuid: (index > 1).then(|| Uuid::from_u128(index - 1)),
        sender,
        text: text.into(),
        attachments: vec![],
        created_at: index as i64,
    }
}

#[test]
fn shared_conversation_fingerprints_and_exchange_boundaries() {
    #[derive(Deserialize)]
    struct Attachment {
        id: String,
        kind: AttachmentKind,
        size: i64,
        name: String,
    }
    #[derive(Deserialize)]
    struct Row {
        uuid: Uuid,
        session_uuid: Uuid,
        parent_message_uuid: Option<Uuid>,
        sender: String,
        text: String,
        attachments: Vec<Attachment>,
    }
    #[derive(Deserialize)]
    struct Fixture {
        name: String,
        messages: Vec<Row>,
        fingerprint: String,
        exchange_ends: Vec<usize>,
    }
    let fixtures: Vec<Fixture> = serde_json::from_str(include_str!(
        "../../tests/fixtures/conversation-core-v1.json"
    ))
    .unwrap();
    for fixture in fixtures {
        let history: Vec<_> = fixture
            .messages
            .into_iter()
            .map(|row| Message {
                uuid: row.uuid,
                session_uuid: row.session_uuid,
                parent_message_uuid: row.parent_message_uuid,
                sender: row.sender.parse().unwrap(),
                text: row.text,
                attachments: row
                    .attachments
                    .into_iter()
                    .map(|attachment| crate::db::AttachmentMeta {
                        id: attachment.id,
                        kind: attachment.kind,
                        size: attachment.size,
                        name: attachment.name,
                    })
                    .collect(),
                created_at: 0,
            })
            .collect();
        assert_eq!(
            fingerprint(&history),
            fixture.fingerprint,
            "{}",
            fixture.name
        );
        assert_eq!(
            exchanges(&history)
                .into_iter()
                .map(|range| range.end)
                .collect::<Vec<_>>(),
            fixture.exchange_ends,
            "{}",
            fixture.name
        );
        assert!(validate_path(&history).is_ok());
        let mut invalid = history;
        invalid[1].parent_message_uuid = None;
        assert!(validate_path(&invalid).is_err());
    }
}

#[test]
fn coverage_tracks_original_text_and_branch_but_not_recent_tail() {
    let mut history = vec![
        message(1, Sender::SelfUser, "Keep data offline"),
        message(2, Sender::Other, "<think>private</think>Okay"),
        message(3, Sender::SelfUser, "Next"),
    ];
    let state =
        ConversationState::new(Uuid::from_u128(100), &history[..2], "Offline".into()).unwrap();
    history[2].text = "Edited recent request".into();
    assert_eq!(state.coverage(&history), Some(2));
    history[1].text = "<think>edited private</think>Okay".into();
    assert_eq!(state.coverage(&history), None);
}

#[test]
fn summary_requires_completion_but_not_exact_headings() {
    assert_eq!(
        completed_summary("Useful memory", FinishReason::Eog).unwrap(),
        "Useful memory"
    );
    assert!(completed_summary("<think>unfinished", FinishReason::Eog).is_err());
    for reason in [
        FinishReason::Unknown,
        FinishReason::ContextLimit,
        FinishReason::OutputLimit,
        FinishReason::StopSequence,
    ] {
        assert!(completed_summary("Partial memory", reason).is_err());
    }
}

#[derive(Default)]
struct Fake {
    calls: usize,
    checkpoints: Vec<ConversationState>,
    incomplete: usize,
    generation_error: bool,
    incomplete_finish: Option<FinishReason>,
    cancel_after_generation: bool,
    cancel_during_measure: bool,
    cancelled: bool,
    stale: bool,
    stale_after_lookup: bool,
    fragments: Vec<(usize, usize)>,
}
impl Effects for Fake {
    fn check_current(&mut self) -> Result<(), PrepareError> {
        if self.cancelled || (self.cancel_after_generation && self.calls > 0) {
            return Err(PrepareError::Cancelled);
        }
        if self.stale {
            return Err(PrepareError::Stale);
        }
        Ok(())
    }
    fn check_cancelled(&mut self) -> Result<(), PrepareError> {
        if self.stale_after_lookup {
            self.stale = true;
            Ok(())
        } else {
            self.check_current()
        }
    }
    fn measure(&mut self, messages: &[ChatMessage]) -> Result<usize, PrepareError> {
        self.cancelled |= self.cancel_during_measure;
        Ok(messages
            .iter()
            .map(|m| m.content.len().div_ceil(4) + 8)
            .sum())
    }
    fn summarize(
        &mut self,
        messages: Vec<ChatMessage>,
        _output: usize,
    ) -> Result<(String, FinishReason), PrepareError> {
        self.calls += 1;
        if self.generation_error {
            return Err(PrepareError::Backend("Summary generation failed".into()));
        }
        let payload: serde_json::Value = serde_json::from_str(&messages[1].content).unwrap();
        if let Some(fragment) = payload["history_fragment"].as_str() {
            self.fragments.push((
                payload["fragment_start_byte"].as_u64().unwrap() as usize,
                fragment.len(),
            ));
        }
        Ok((
            "Keep data offline. Budget INR 3500. Restore checklist pending.".into(),
            if self.calls <= self.incomplete {
                self.incomplete_finish.unwrap_or(FinishReason::OutputLimit)
            } else {
                FinishReason::Eog
            },
        ))
    }
    fn checkpoint(&mut self, state: &ConversationState) -> Result<(), PrepareError> {
        self.check_current()?;
        self.checkpoints.push(state.clone());
        Ok(())
    }
}

fn long_history(exchanges: usize, size: usize) -> Vec<Message> {
    (1..=exchanges * 2)
        .map(|i| {
            message(
                i as u128,
                if i % 2 == 1 {
                    Sender::SelfUser
                } else {
                    Sender::Other
                },
                &"x".repeat(size),
            )
        })
        .collect()
}
fn work(history: Vec<Message>, state: Option<ConversationState>) -> Preparation {
    Preparation::new(
        Uuid::from_u128(100),
        history,
        "System".into(),
        "What is pending?".into(),
        2048,
        512,
        state,
    )
    .unwrap()
}

#[test]
fn required_original_excerpt_survives_compaction_without_duplicate_lookup() {
    let mut history = long_history(8, 800);
    history[0].text = "The reservation code is ZX-82Q.".into();
    let query = "Recall the reservation code I gave earlier.";
    history.push(message(17, Sender::SelfUser, query));
    let mut input = turn_input(history);
    input.history_query = Some(query.into());
    let mut effects = Fake::default();
    let prepared = prepare_turn(input, &mut effects).unwrap();
    assert_eq!(prepared.budget.output, 512);
    let mut prep = prepared.preparation;
    let messages = prep.run(&mut effects).unwrap().messages;
    assert!(effects.calls > 0);
    assert!(messages.last().unwrap().content.ends_with(query));
    assert_eq!(
        messages.last().unwrap().content.matches("ZX-82Q").count(),
        1
    );
    assert!(effects.measure(&messages).unwrap() <= 1280);
}

#[test]
fn fits_without_inference_and_reuses_saved_memory_after_restore() {
    let history = long_history(6, 800);
    let mut prep = work(history.clone(), None);
    let mut effects = Fake::default();
    prep.run(&mut effects).unwrap();
    assert!(effects.calls > 0);
    assert!(prep.covered() > 0);
    let state = prep.state().cloned();
    let mut reopened = work(history.clone(), state.clone());
    let mut fresh = Fake::default();
    let PreparationResult {
        messages,
        prompt_tokens,
    } = reopened.run(&mut fresh).unwrap();
    assert_eq!(fresh.calls, 0);
    assert!(prompt_tokens <= 1280);
    assert_eq!(messages.last().unwrap().content, "What is pending?");
    assert!(messages[0].content.contains("Keep data offline"));
    let mut expanded = Preparation::new(
        Uuid::from_u128(100),
        history.clone(),
        "System".into(),
        "What is pending?".into(),
        8192,
        1024,
        state.clone(),
    )
    .unwrap();
    let PreparationResult {
        messages,
        prompt_tokens,
    } = expanded.run(&mut fresh).unwrap();
    assert_eq!(
        serde_json::to_value(&messages).unwrap(),
        serde_json::to_value(answer_messages(
            "System",
            None,
            &history,
            "What is pending?"
        ))
        .unwrap()
    );
    assert_eq!(prompt_tokens, fresh.measure(&messages).unwrap());
    assert_eq!(expanded.state(), state.as_ref());
    assert_eq!(fresh.calls, 0);
    assert!(fresh.checkpoints.is_empty());
}

#[test]
fn rebuilds_context_when_a_branch_extends_a_summarized_unanswered_user() {
    let user = message(1, Sender::SelfUser, &"x".repeat(4000));
    let mut original = Preparation::new(
        user.session_uuid,
        vec![user.clone()],
        "System".into(),
        "y".repeat(3200),
        2048,
        512,
        None,
    )
    .unwrap();
    let mut initial = Fake::default();
    original.run(&mut initial).unwrap();
    let state = original.state().cloned().unwrap();
    assert_eq!(state.summary.covered_boundary_message_uuid, user.uuid);

    for answer_size in [20, 4000] {
        let history = vec![
            user.clone(),
            message(2, Sender::Other, &"a".repeat(answer_size)),
        ];
        let mut alternate = work(history.clone(), Some(state.clone()));
        let mut effects = Fake::default();
        let PreparationResult {
            messages,
            prompt_tokens,
        } = alternate.run(&mut effects).unwrap();
        assert!(prompt_tokens <= 1280);
        assert_eq!(messages.last().unwrap().content, "What is pending?");
        if answer_size == 20 {
            assert_eq!(effects.calls, 0);
            assert_eq!(alternate.covered(), 0);
            assert_eq!(messages[0].content, "System");
            assert_eq!(messages[1].content, history[0].text);
            assert_eq!(messages[2].content, history[1].text);
        } else {
            assert!(effects.calls > 0);
            assert_eq!(effects.checkpoints.len(), 1);
            assert_eq!(
                effects.checkpoints[0].summary.covered_boundary_message_uuid,
                history[1].uuid
            );
            let mut restored = work(history, alternate.state().cloned());
            let mut fresh = Fake::default();
            restored.run(&mut fresh).unwrap();
            assert_eq!(fresh.calls, 0);
        }
    }
}

#[test]
fn recovers_omitted_details_within_measured_allowance_without_new_summary_or_tail_duplication() {
    let mut history = vec![
        message(
            1,
            Sender::SelfUser,
            "The reservation code is ZX-82Q. Keep its exact spelling.",
        ),
        message(2, Sender::Other, "Noted."),
        message(
            3,
            Sender::SelfUser,
            "The reservation departure is tomorrow.",
        ),
        message(4, Sender::Other, "Pack an umbrella."),
    ];
    history[0].text.push_str(&" padding".repeat(1600));
    let state = ConversationState::new(
        Uuid::from_u128(100),
        &history[..2],
        "A reservation was discussed.".into(),
    )
    .unwrap();
    let current = "Fresh source excerpts: unrelated penguins.\nWhat is the reservation code?";
    let mut prep = Preparation::new(
        Uuid::from_u128(100),
        history.clone(),
        "System".into(),
        current.into(),
        4096,
        1024,
        Some(state.clone()),
    )
    .unwrap()
    .with_history_query(Some("What is the reservation code?".into()));
    let mut effects = Fake::default();
    let base = answer_messages("System", Some(&state.summary.text), &history[2..], current);
    let base_tokens = effects.measure(&base).unwrap();
    let PreparationResult {
        messages,
        prompt_tokens,
    } = prep.run(&mut effects).unwrap();
    assert_eq!(effects.calls, 0);
    assert!(effects.checkpoints.is_empty());
    assert_eq!(prep.state(), Some(&state));
    let recovered = &messages.last().unwrap().content;
    assert!(recovered.contains("ZX-82Q"));
    assert!(recovered.ends_with(current));
    assert!(!recovered.contains("departure is tomorrow"));
    assert_eq!(
        messages[1].content,
        "The reservation departure is tomorrow."
    );
    assert!(prompt_tokens - base_tokens <= 2816 / 8);
    assert_eq!(prompt_tokens, effects.measure(&messages).unwrap());
    assert!(prompt_tokens <= 2816);

    let mut disabled = Preparation::new(
        Uuid::from_u128(100),
        history,
        "System".into(),
        current.into(),
        4096,
        1024,
        Some(state),
    )
    .unwrap()
    .with_history_query(None);
    let PreparationResult { messages, .. } = disabled.run(&mut effects).unwrap();
    assert_eq!(messages.last().unwrap().content, current);
}

#[test]
fn recovery_never_displaces_current_input_or_triggers_extra_compaction_to_fit() {
    let history = vec![message(
        1,
        Sender::SelfUser,
        "The reservation code is ZX-82Q.",
    )];
    let state = ConversationState::new(
        Uuid::from_u128(100),
        &history,
        "Reservation discussed.".into(),
    )
    .unwrap();
    let mut effects = Fake::default();
    let current = "What is the reservation code?";
    let base = answer_messages("System", Some(&state.summary.text), &[], current);
    let context = effects.measure(&base).unwrap() + 128 + SAFETY_TOKENS;
    let mut prep = Preparation::new(
        Uuid::from_u128(100),
        history,
        "System".into(),
        current.into(),
        context,
        128,
        Some(state),
    )
    .unwrap();
    let PreparationResult { messages, .. } = prep.run(&mut effects).unwrap();
    assert_eq!(messages.last().unwrap().content, current);
    assert_eq!(effects.calls, 0);
}

#[test]
fn snapshot_is_revalidated_after_lightweight_lookup_polls() {
    let mut h = vec![message(
        1,
        Sender::SelfUser,
        "The reservation code is ZX-82Q.",
    )];
    h[0].text.push_str(&" padding".repeat(1600));
    let state = ConversationState::new(
        Uuid::from_u128(100),
        &h,
        "A reservation was discussed.".into(),
    )
    .unwrap();
    let mut prep = Preparation::new(
        Uuid::from_u128(100),
        h,
        "System".into(),
        "reservation code".into(),
        4096,
        1024,
        Some(state),
    )
    .unwrap();
    let mut race = Fake {
        stale_after_lookup: true,
        ..Default::default()
    };
    assert!(matches!(prep.run(&mut race), Err(PrepareError::Stale)));
    assert!(race.checkpoints.is_empty());
}

#[test]
fn incomplete_or_cancelled_summaries_never_advance_saved_coverage() {
    for finish in [FinishReason::StopSequence, FinishReason::OutputLimit] {
        let mut prep = work(long_history(6, 1400), None);
        let mut effects = Fake {
            incomplete: 1,
            incomplete_finish: Some(finish),
            ..Default::default()
        };
        prep.run(&mut effects).unwrap();
        assert!(prep.covered() > 0);
        assert!(!effects.checkpoints.is_empty());
        assert_eq!(effects.fragments[0].0, effects.fragments[1].0);
    }
    let mut prep = work(long_history(6, 800), None);
    let mut effects = Fake {
        incomplete: 2,
        ..Default::default()
    };
    let PreparationResult {
        messages,
        prompt_tokens,
    } = prep.run(&mut effects).unwrap();
    assert!(prompt_tokens <= input_budget(2048, 512).unwrap());
    assert_eq!(messages.last().unwrap().content, "What is pending?");
    assert!(messages.len() > 2);
    assert_eq!(messages[1].role, "user");
    assert_eq!(effects.calls, 2);
    assert!(effects.checkpoints.is_empty());
    assert_eq!(prep.covered(), 0);
    let mut prep = work(long_history(6, 800), None);
    let mut effects = Fake {
        cancel_after_generation: true,
        ..Default::default()
    };
    assert!(matches!(
        prep.run(&mut effects),
        Err(PrepareError::Cancelled)
    ));
    assert!(effects.checkpoints.is_empty());
}

#[test]
fn large_exchange_is_chunked_without_gaps_or_partial_checkpoints() {
    let mut prep = work(long_history(1, 14000), None);
    let mut effects = Fake::default();
    prep.run(&mut effects).unwrap();
    assert!(effects.calls > 3);
    let mut next = 0;
    for (offset, length) in effects.fragments {
        assert_eq!(offset, next);
        next += length;
    }
    assert_eq!(effects.checkpoints.len(), 1);
    assert_eq!(prep.covered(), 2);
}

#[test]
fn current_request_is_never_cut() {
    let mut prep = Preparation::new(
        Uuid::from_u128(100),
        vec![],
        "system".into(),
        "x".repeat(12000),
        2048,
        512,
        None,
    )
    .unwrap();
    let mut effects = Fake::default();
    assert!(matches!(
        prep.run(&mut effects),
        Err(PrepareError::CurrentInputTooLarge)
    ));
    assert_eq!(effects.calls, 0);
}

#[test]
fn failed_summary_uses_fitting_history_without_changing_saved_memory() {
    let history = long_history(8, 800);
    let state = ConversationState::new(
        Uuid::from_u128(100),
        &history[..2],
        "Keep data offline.".into(),
    )
    .unwrap();
    let mut prep = work(history.clone(), Some(state.clone()));
    let mut effects = Fake {
        generation_error: true,
        ..Default::default()
    };
    let PreparationResult {
        messages,
        prompt_tokens,
    } = prep.run(&mut effects).unwrap();
    assert!(prompt_tokens <= input_budget(2048, 512).unwrap());
    assert!(
        messages
            .iter()
            .any(|m| m.content.contains("Keep data offline."))
    );
    assert_eq!(messages.last().unwrap().content, "What is pending?");
    assert_eq!(
        messages[messages.len() - 2].content,
        history.last().unwrap().text
    );
    assert_eq!(prep.state().unwrap(), &state);
    assert!(effects.checkpoints.is_empty());
    effects.cancel_after_generation = true;
    assert!(matches!(
        prep.run(&mut effects),
        Err(PrepareError::Cancelled)
    ));
}

fn turn_input(messages: Vec<Message>) -> TurnInput {
    let current = messages.last().unwrap().text.clone();
    TurnInput {
        session: Uuid::from_u128(100),
        messages,
        expected_user_text: current.clone(),
        system: "System".into(),
        current,
        history_query: None,
        context: 2048,
        output: None,
        state: None,
        candidates: GroundingCandidates::new(vec![], MAX_GROUNDING_BYTES).unwrap(),
    }
}

#[test]
fn turn_preparation_observes_cancellation_before_and_during_source_fitting() {
    for mut effects in [
        Fake {
            cancelled: true,
            ..Default::default()
        },
        Fake {
            cancel_during_measure: true,
            ..Default::default()
        },
    ] {
        let input = turn_input(vec![message(1, Sender::SelfUser, "Question")]);
        assert!(matches!(
            prepare_turn(input, &mut effects),
            Err(PrepareError::Cancelled)
        ));
        assert_eq!(effects.calls, 0);
        assert!(effects.checkpoints.is_empty());
    }
}

#[test]
fn turn_preparation_rejects_changed_current_messages_and_stale_history() {
    let mut input = turn_input(vec![message(1, Sender::SelfUser, "Question")]);
    input.messages[0].text = "Edited question".into();
    let mut effects = Fake::default();
    assert!(matches!(
        prepare_turn(input, &mut effects),
        Err(PrepareError::Stale)
    ));
    let mut input = turn_input(vec![
        message(1, Sender::SelfUser, "The reservation code is ZX-82Q."),
        message(2, Sender::Other, "Understood."),
        message(
            3,
            Sender::SelfUser,
            "Recall the reservation code I gave earlier.",
        ),
    ]);
    input.history_query = Some(input.current.clone());
    effects.stale_after_lookup = true;
    assert!(matches!(
        prepare_turn(input, &mut effects),
        Err(PrepareError::Stale)
    ));
    assert_eq!(effects.calls, 0);
    assert!(effects.checkpoints.is_empty());
}
