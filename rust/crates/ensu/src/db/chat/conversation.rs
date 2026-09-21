use super::*;
use crate::conversation::{self, ConversationEnvelope, ConversationState, MAX_STATE_BYTES};

const MESSAGE_COLUMNS: &str =
    "message_uuid, session_uuid, parent_message_uuid, sender, text, attachments, created_at";

pub struct ConversationSnapshot {
    pub(super) session_uuid: Uuid,
    pub(super) messages: Vec<Message>,
    pub(super) state: Option<ConversationState>,
    rows: Vec<crate::db::Row>,
    envelope: Value,
}

impl ConversationSnapshot {
    pub fn messages(&self) -> &[Message] {
        &self.messages
    }
    pub fn state(&self) -> Option<&ConversationState> {
        self.state.as_ref()
    }
    pub fn session_uuid(&self) -> Uuid {
        self.session_uuid
    }
}

impl<B: Backend> ChatDb<B> {
    pub fn conversation_snapshot(
        &self,
        session: Uuid,
        path: &[Uuid],
    ) -> Result<ConversationSnapshot> {
        if path.len() > conversation::MAX_HISTORY_MESSAGES {
            return Err(Error::UnsupportedOperation(
                "Conversation history is too large".into(),
            ));
        }
        let (envelope, rows) = self.backend.transaction(|tx| {
            let envelope = session_envelope(tx, session)?.ok_or(Error::NotFound {
                entity: EntityType::Session,
                id: session,
            })?;
            let mut rows = Vec::with_capacity(path.len());
            let mut bytes = 0usize;
            for id in path {
                let row = message_row(tx, *id)?.ok_or(Error::NotFound {
                    entity: EntityType::Message,
                    id: *id,
                })?;
                bytes = bytes.saturating_add(row.get_blob(4)?.len());
                bytes = bytes.saturating_add(row.get_optional_string(5)?.map_or(0, |v| v.len()));
                if bytes > conversation::MAX_HISTORY_BYTES {
                    return Err(Error::UnsupportedOperation(
                        "Conversation history is too large".into(),
                    ));
                }
                rows.push(row);
            }
            Ok((envelope, rows))
        })?;
        let messages = rows
            .iter()
            .map(|row| self.message_from_row(row))
            .collect::<Result<Vec<_>>>()?;
        if messages
            .iter()
            .any(|message| message.session_uuid != session)
        {
            return Err(Error::UnsupportedOperation(
                "History belongs to another conversation".into(),
            ));
        }
        conversation::validate_path(&messages)
            .map_err(|e| Error::UnsupportedOperation(e.to_string()))?;
        let state = self
            .decode_conversation(&envelope, session)
            .and_then(ConversationEnvelope::summary_state);
        Ok(ConversationSnapshot {
            session_uuid: session,
            messages,
            state,
            rows,
            envelope,
        })
    }

    fn decode_conversation(&self, value: &Value, session: Uuid) -> Option<ConversationEnvelope> {
        let Value::Blob(blob) = value else {
            return None;
        };
        if blob.len() > MAX_STATE_BYTES + 1024 {
            return None;
        }
        let bytes = crypto::decrypt_blob(blob, &self.key).ok()?;
        ConversationEnvelope::decode(&bytes, session)
    }

    pub fn conversation_snapshot_matches(&self, snapshot: &ConversationSnapshot) -> Result<bool> {
        self.backend
            .transaction(|tx| snapshot_matches(tx, snapshot, false))
    }

    pub fn replace_conversation_state(
        &self,
        snapshot: &mut ConversationSnapshot,
        state: Option<ConversationState>,
    ) -> Result<bool> {
        if let Some(state) = &state {
            if state.session_uuid != snapshot.session_uuid
                || state.coverage(&snapshot.messages).is_none()
            {
                return Err(Error::UnsupportedOperation(
                    "Summary does not match the captured history".into(),
                ));
            }
            state
                .validate()
                .map_err(|_| Error::UnsupportedOperation("Invalid conversation state".into()))?;
        }
        let mut derived = ConversationEnvelope::empty(snapshot.session_uuid);
        derived.summary = state.as_ref().map(|state| state.summary.clone());
        let envelope = self.encode_conversation(&derived)?;
        let applied = self.replace_conversation_envelope(snapshot, envelope.clone())?;
        if applied {
            snapshot.envelope = envelope;
            snapshot.state = state;
        }
        Ok(applied)
    }

    fn encode_conversation(&self, derived: &ConversationEnvelope) -> Result<Value> {
        if derived.summary.is_none() {
            return Ok(Value::Null);
        }
        let bytes = serde_json::to_vec(derived)?;
        if bytes.len() > MAX_STATE_BYTES {
            return Err(Error::UnsupportedOperation(
                "Conversation state is too large".into(),
            ));
        }
        Ok(Value::Blob(crypto::encrypt_blob(&bytes, &self.key)?))
    }

    fn replace_conversation_envelope(
        &self,
        snapshot: &ConversationSnapshot,
        envelope: Value,
    ) -> Result<bool> {
        self.backend.transaction(|tx| {
            if !snapshot_matches(tx, snapshot, true)? {
                return Ok(false);
            }
            Ok(tx.execute(
                "UPDATE sessions SET conversation_state = ? WHERE session_uuid = ?",
                &[envelope, Value::Text(snapshot.session_uuid.to_string())],
            )? == 1)
        })
    }

    pub(super) fn invalidate_conversation_for_edit<T: BackendTx>(
        &self,
        tx: &T,
        session: Uuid,
        edited: Uuid,
    ) -> Result<()> {
        let Some(envelope) = session_envelope(tx, session)? else {
            return Ok(());
        };
        if envelope == Value::Null {
            return Ok(());
        }
        let clear = match self
            .decode_conversation(&envelope, session)
            .and_then(|envelope| envelope.summary)
        {
            Some(summary) => depends_on(tx, summary.covered_boundary_message_uuid, edited)?,
            None => true,
        };
        if clear {
            tx.execute(
                "UPDATE sessions SET conversation_state = NULL WHERE session_uuid = ?",
                &[Value::Text(session.to_string())],
            )?;
        }
        Ok(())
    }
}

fn depends_on<T: BackendTx>(tx: &T, boundary: Uuid, edited: Uuid) -> Result<bool> {
    let rows = tx.query("WITH RECURSIVE prefix(id, parent) AS (
        SELECT message_uuid, parent_message_uuid FROM messages WHERE message_uuid = ?
        UNION ALL
        SELECT m.message_uuid, m.parent_message_uuid FROM messages m JOIN prefix p ON m.message_uuid = p.parent
        LIMIT 20001) SELECT id FROM prefix", &[Value::Text(boundary.to_string())])?;
    let edited = Value::Text(edited.to_string());
    Ok(rows.is_empty()
        || rows.len() > conversation::MAX_HISTORY_MESSAGES
        || rows.iter().any(|row| row.first() == Some(&edited)))
}

fn session_envelope<T: BackendTx>(tx: &T, session: Uuid) -> Result<Option<Value>> {
    Ok(tx
        .query_row(
            "SELECT conversation_state FROM sessions WHERE session_uuid = ?",
            &[Value::Text(session.to_string())],
        )?
        .and_then(|row| row.into_iter().next()))
}

fn message_row<T: BackendTx>(tx: &T, id: Uuid) -> Result<Option<crate::db::Row>> {
    tx.query_row(
        &format!("SELECT {MESSAGE_COLUMNS} FROM messages WHERE message_uuid = ?"),
        &[Value::Text(id.to_string())],
    )
}

pub(super) fn snapshot_matches<T: BackendTx>(
    tx: &T,
    snapshot: &ConversationSnapshot,
    compare_envelope: bool,
) -> Result<bool> {
    let Some(envelope) = session_envelope(tx, snapshot.session_uuid)? else {
        return Ok(false);
    };
    if compare_envelope && envelope != snapshot.envelope {
        return Ok(false);
    }
    for (message, expected) in snapshot.messages.iter().zip(&snapshot.rows) {
        if message_row(tx, message.uuid)?.as_ref() != Some(expected) {
            return Ok(false);
        }
    }
    Ok(true)
}

#[cfg(all(test, feature = "sqlite"))]
#[expect(clippy::unwrap_used, reason = "Test fixture setup must succeed")]
mod tests {
    use super::*;
    fn seeded() -> (ChatDb<crate::db::SqliteBackend>, Uuid, Vec<Message>) {
        let db = ChatDb::open_in_memory(vec![7; 32]).unwrap();
        let session = db.create_session("Original title").unwrap();
        let first = db
            .insert_message(session.uuid, "self", "Keep data offline", None, vec![])
            .unwrap();
        let answer = db
            .insert_message(
                session.uuid,
                "other",
                "A suggestion",
                Some(first.uuid),
                vec![],
            )
            .unwrap();
        let current = db
            .insert_message(
                session.uuid,
                "self",
                "Next question",
                Some(answer.uuid),
                vec![],
            )
            .unwrap();
        (db, session.uuid, vec![first, answer, current])
    }
    fn state(session: Uuid, messages: &[Message], text: &str) -> ConversationState {
        ConversationState::new(session, &messages[..2], text.into()).unwrap()
    }
    fn snapshot(
        db: &ChatDb<crate::db::SqliteBackend>,
        session: Uuid,
        messages: &[Message],
    ) -> ConversationSnapshot {
        db.conversation_snapshot(
            session,
            &messages.iter().map(|m| m.uuid).collect::<Vec<_>>(),
        )
        .unwrap()
    }

    #[test]
    fn encrypted_summary_survives_reopen_and_branch_selection() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("conversation.db");
        let db = ChatDb::open_sqlite_with_defaults(&file, vec![7; 32]).unwrap();
        let session = db.create_session("Memory").unwrap().uuid;
        let question = db
            .insert_message(session, "self", "Keep data offline", None, vec![])
            .unwrap();
        let answer = db
            .insert_message(session, "other", "Understood", Some(question.uuid), vec![])
            .unwrap();
        let full = vec![question.clone(), answer];
        let mut captured = snapshot(&db, session, &full);
        let memory = ConversationState::new(session, &full, "Keep data offline".into()).unwrap();
        assert!(
            db.replace_conversation_state(&mut captured, Some(memory.clone()))
                .unwrap()
        );
        drop(captured);
        drop(db);
        let db = ChatDb::open_sqlite_with_defaults(&file, vec![7; 32]).unwrap();
        let reopened = snapshot(&db, session, &full);
        assert_eq!(reopened.state(), Some(&memory));
        let sibling = db
            .insert_message(
                session,
                "other",
                "Other branch",
                Some(question.uuid),
                vec![],
            )
            .unwrap();
        assert!(memory.coverage(&[question, sibling]).is_none());
        assert_eq!(snapshot(&db, session, &full).state(), Some(&memory));
    }

    #[test]
    fn encrypted_memory_survives_titles_appends_and_recent_edits() {
        let (db, session, messages) = seeded();
        let original = db.get_session(session).unwrap().unwrap();
        let mut captured = snapshot(&db, session, &messages);
        let memory = state(session, &messages, "CONFIDENTIAL_SUMMARY_TEXT");
        assert!(
            db.replace_conversation_state(&mut captured, Some(memory.clone()))
                .unwrap()
        );
        assert_eq!(db.get_session(session).unwrap().unwrap(), original);
        let Value::Blob(bytes) = &captured.envelope else {
            panic!("encrypted blob")
        };
        assert!(!bytes.windows(12).any(|w| w == b"CONFIDENTIAL"));
        db.update_session_title(session, "New title").unwrap();
        db.insert_message(
            session,
            "other",
            "Later append",
            Some(messages[2].uuid),
            vec![],
        )
        .unwrap();
        db.update_message_text(messages[2].uuid, "Edited recent question")
            .unwrap();
        assert_eq!(snapshot(&db, session, &messages).state, Some(memory));
        db.update_message_text(messages[0].uuid, "Constraint changed")
            .unwrap();
        assert!(snapshot(&db, session, &messages).state.is_none());
        assert!(
            !db.replace_conversation_state(&mut captured, Some(state(session, &messages, "stale")))
                .unwrap()
        );
    }

    #[test]
    fn concurrent_replacements_clears_and_guarded_answers() {
        let (db, session, messages) = seeded();
        let mut first = snapshot(&db, session, &messages);
        let mut second = snapshot(&db, session, &messages);
        assert!(
            db.replace_conversation_state(
                &mut first,
                Some(state(session, &messages, "Current memory"))
            )
            .unwrap()
        );
        assert!(!db.replace_conversation_state(&mut second, None).unwrap());
        assert!(
            !db.replace_conversation_state(
                &mut second,
                Some(state(session, &messages, "Old memory"))
            )
            .unwrap()
        );
        assert!(
            db.insert_message_guarded(
                session,
                "other",
                "Answer",
                Some(messages[2].uuid),
                vec![],
                Some(&second)
            )
            .is_ok()
        );
        db.update_message_text(messages[0].uuid, "Edited from another caller")
            .unwrap();
        assert!(
            db.insert_message_guarded(
                session,
                "other",
                "Stale answer",
                Some(messages[2].uuid),
                vec![],
                Some(&second)
            )
            .is_err()
        );
        db.delete_session(session).unwrap();
        assert!(!db.replace_conversation_state(&mut first, None).unwrap());
        assert!(db.get_session(session).unwrap().is_none());
    }

    #[test]
    fn corrupt_state_does_not_block_chat_and_failed_write_keeps_previous() {
        let (db, session, messages) = seeded();
        db.backend
            .execute(
                "UPDATE sessions SET conversation_state = ? WHERE session_uuid = ?",
                &[Value::Blob(vec![0; 16]), Value::Text(session.to_string())],
            )
            .unwrap();
        let mut captured = snapshot(&db, session, &messages);
        assert!(captured.state.is_none());
        assert_eq!(db.get_messages(session).unwrap().len(), 3);
        assert!(
            db.replace_conversation_state(
                &mut captured,
                Some(state(session, &messages, "Valid memory"))
            )
            .unwrap()
        );
        let mut encoded = ConversationEnvelope::empty(session);
        encoded.summary = captured.state().map(|state| state.summary.clone());
        encoded.format_version = 1;
        assert!(
            ConversationEnvelope::decode(&serde_json::to_vec(&encoded).unwrap(), session).is_none()
        );
        for text in [" \n".to_owned(), "x".repeat(MAX_STATE_BYTES)] {
            let mut invalid = state(session, &messages, "Valid memory");
            invalid.summary.text = text;
            assert!(
                db.replace_conversation_state(&mut captured, Some(invalid))
                    .is_err()
            );
            assert_eq!(captured.state().unwrap().summary.text, "Valid memory");
        }
        let escaped = state(session, &messages, &"\u{0001}".repeat(MAX_STATE_BYTES / 2));
        assert!(escaped.validate().is_ok());
        assert!(
            db.replace_conversation_state(&mut captured, Some(escaped))
                .is_err()
        );
        assert_eq!(
            snapshot(&db, session, &messages)
                .state()
                .unwrap()
                .summary
                .text,
            "Valid memory"
        );
        db.backend.execute_batch("CREATE TRIGGER fail_memory BEFORE UPDATE OF conversation_state ON sessions BEGIN SELECT RAISE(ABORT, 'write failed'); END;").unwrap();
        assert!(
            db.replace_conversation_state(
                &mut captured,
                Some(state(session, &messages, "Replacement"))
            )
            .is_err()
        );
        assert_eq!(
            snapshot(&db, session, &messages)
                .state
                .unwrap()
                .summary
                .text,
            "Valid memory"
        );
    }
}
