use crate::{
    conversation::{ConversationError, error},
    db::EnsuDb,
    retrieval::{GroundedExcerpt, IncludedPassage},
};
use ente_ensu::{conversation as core, db, retrieval};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use uuid::Uuid;

#[derive(Clone, uniffi::Record)]
pub struct ConversationFollowupResult {
    pub referenced_passages: Vec<IncludedPassage>,
}

#[derive(uniffi::Object)]
pub struct ConversationFollowup {
    db: Arc<db::ChatDb<db::SqliteBackend>>,
    snapshot: db::chat::ConversationSnapshot,
    question: String,
    selection: Mutex<Option<SourceSelection>>,
    cancelled: AtomicBool,
}

struct SourceSelection {
    references: Vec<retrieval::IncludedPassage>,
    searched: Option<Vec<retrieval::GroundedExcerpt>>,
}

#[uniffi::export]
impl EnsuDb {
    pub fn start_conversation_followup(
        &self,
        session_uuid: String,
        path: Vec<String>,
        question: String,
        expected_user_text: String,
    ) -> Result<Arc<ConversationFollowup>, ConversationError> {
        if path.is_empty()
            || path.len() > core::MAX_HISTORY_MESSAGES
            || question.len() > core::MAX_HISTORY_BYTES
        {
            return Err(error(
                "Please name the subject or document in a shorter source question",
            ));
        }
        let path = path
            .iter()
            .map(|id| Uuid::parse_str(id))
            .collect::<Result<Vec<_>, _>>()
            .map_err(error)?;
        let snapshot = self
            .inner
            .conversation_snapshot(Uuid::parse_str(&session_uuid).map_err(error)?, &path)
            .map_err(error)?;
        if !snapshot
            .messages()
            .last()
            .is_some_and(|m| m.sender == db::Sender::SelfUser && m.text == expected_user_text)
        {
            return Err(ConversationError::Stale);
        }
        Ok(Arc::new(ConversationFollowup {
            db: self.inner.clone(),
            snapshot,
            question,
            selection: Mutex::new(None),
            cancelled: AtomicBool::new(false),
        }))
    }
}

impl ConversationFollowup {
    fn check(&self) -> Result<(), ConversationError> {
        if self.cancelled.load(Ordering::Acquire) {
            return Err(ConversationError::Cancelled);
        }
        if !self
            .db
            .conversation_snapshot_matches(&self.snapshot)
            .map_err(error)?
        {
            return Err(ConversationError::Stale);
        }
        Ok(())
    }

    pub(crate) fn prepare(
        &self,
        db: &Arc<db::ChatDb<db::SqliteBackend>>,
        snapshot: &db::chat::ConversationSnapshot,
        searched: &[GroundedExcerpt],
    ) -> Result<(String, Vec<retrieval::IncludedPassage>), ConversationError> {
        self.check()?;
        if !Arc::ptr_eq(db, &self.db)
            || snapshot.session_uuid() != self.snapshot.session_uuid()
            || core::fingerprint(snapshot.messages()) != core::fingerprint(self.snapshot.messages())
        {
            return Err(ConversationError::Stale);
        }
        let stored = self.selection.lock().map_err(error)?;
        let selected = stored
            .as_ref()
            .ok_or_else(|| error("Source selection is not complete"))?;
        if let Some(expected) = &selected.searched {
            let actual = core::GroundingCandidates::new(
                Vec::new(),
                searched.iter().cloned().map(Into::into).collect(),
                core::MAX_GROUNDING_BYTES,
            )
            .map_err(error)?
            .searched;
            if actual != *expected {
                return Err(error(
                    "Source search changed after selecting earlier passages; retry the reply",
                ));
            }
        }
        Ok((self.question.clone(), selected.references.clone()))
    }

    fn direct(
        &self,
        searched: Option<Vec<GroundedExcerpt>>,
    ) -> Result<ConversationFollowupResult, ConversationError> {
        self.check()?;
        let mut stored = self.selection.lock().map_err(error)?;
        if stored.is_some() {
            return Err(error("Source selection was already attempted"));
        }
        let searched = searched
            .map(|hits| {
                core::GroundingCandidates::new(
                    Vec::new(),
                    hits.into_iter().map(Into::into).collect(),
                    core::MAX_GROUNDING_BYTES,
                )
                .map(|candidates| candidates.searched)
                .map_err(error)
            })
            .transpose()?;
        let references = if let Some(searched) = &searched {
            let evidence = self
                .snapshot
                .evidence()
                .into_iter()
                .cloned()
                .collect::<Vec<_>>();
            core::direct_followup_references(
                self.snapshot.messages(),
                &evidence,
                &self.question,
                searched,
            )
            .unwrap_or_default()
        } else {
            Vec::new()
        };
        let result = ConversationFollowupResult {
            referenced_passages: references.iter().cloned().map(Into::into).collect(),
        };
        *stored = Some(SourceSelection {
            references,
            searched,
        });
        Ok(result)
    }
}

#[uniffi::export]
impl ConversationFollowup {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
    }

    pub fn search_as_written(&self) -> Result<ConversationFollowupResult, ConversationError> {
        self.direct(None)
    }

    pub fn search_with_history(
        &self,
        searched: Vec<GroundedExcerpt>,
    ) -> Result<ConversationFollowupResult, ConversationError> {
        self.direct(Some(searched))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_selection_is_bound_to_search_history_and_cancellation() {
        let db = EnsuDb {
            inner: Arc::new(db::ChatDb::open_in_memory(vec![7; 32]).unwrap()),
        };
        let session = db.inner.create_session("Direct follow-up").unwrap();
        let user = db
            .inner
            .insert_message(session.uuid, "self", "What does Cedar cover?", None, vec![])
            .unwrap();
        let source = retrieval::GroundedExcerpt {
            locator: retrieval::PassageLocator::LocalNote {
                collection_id: Uuid::from_u128(10).to_string(),
                document_id: "cedar.md".into(),
                indexed_revision: "a".repeat(64),
                shard_sha256: "b".repeat(64),
                chunk_index: 0,
            },
            score: 0.9,
            text: "Cedar requires 30 days.".into(),
            source: retrieval::GroundedSource::LocalNote {
                reference: ente_ensu::notes::NoteSourceReference {
                    collection_id: Uuid::from_u128(10).to_string(),
                    collection_label: None,
                    document_id: "cedar.md".into(),
                    indexed_revision: "a".repeat(64),
                    title: "Cedar".into(),
                    section: None,
                },
            },
        };
        let grounded =
            retrieval::build_grounded_prompt_context(std::slice::from_ref(&source), 6000)
                .unwrap()
                .unwrap();
        let before = db
            .inner
            .conversation_snapshot(session.uuid, &[user.uuid])
            .unwrap();
        let text =
            retrieval::finalize_grounded_assistant_text("Cedar covers returns.", &grounded.sources)
                .unwrap();
        let answer = db
            .inner
            .insert_message(session.uuid, "other", &text, Some(user.uuid), vec![])
            .unwrap();
        assert!(
            db.inner
                .save_answer_evidence(&before, answer.uuid, grounded.included_passages.clone())
                .unwrap()
        );
        let current = db
            .inner
            .insert_message(
                session.uuid,
                "self",
                "And the deadline?",
                Some(answer.uuid),
                vec![],
            )
            .unwrap();
        let snapshot = db
            .inner
            .conversation_snapshot(session.uuid, &[user.uuid, answer.uuid, current.uuid])
            .unwrap();
        let start = || {
            db.start_conversation_followup(
                session.uuid.to_string(),
                vec![
                    user.uuid.to_string(),
                    answer.uuid.to_string(),
                    current.uuid.to_string(),
                ],
                current.text.clone(),
                current.text.clone(),
            )
            .unwrap()
        };
        let turn = start();
        assert!(turn.prepare(&db.inner, &snapshot, &[]).is_err());
        let result = turn.search_with_history(vec![]).unwrap();
        assert_eq!(
            turn.prepare(&db.inner, &snapshot, &[]).unwrap().1,
            grounded.included_passages
        );
        assert_eq!(result.referenced_passages.len(), 1);
        assert!(
            turn.prepare(&db.inner, &snapshot, &[source.into()])
                .is_err()
        );
        assert!(turn.search_with_history(vec![]).is_err());
        let direct = start();
        assert!(
            direct
                .search_as_written()
                .unwrap()
                .referenced_passages
                .is_empty()
        );
        assert!(
            direct
                .prepare(&db.inner, &snapshot, &[])
                .unwrap()
                .1
                .is_empty()
        );
        let other = Arc::new(db::ChatDb::open_in_memory(vec![7; 32]).unwrap());
        assert!(matches!(
            turn.prepare(&other, &snapshot, &[]),
            Err(ConversationError::Stale)
        ));
        let cancelled = start();
        cancelled.cancel();
        assert!(matches!(
            cancelled.search_with_history(vec![]),
            Err(ConversationError::Cancelled)
        ));
        db.inner
            .update_message_text(user.uuid, "Edited original")
            .unwrap();
        assert!(matches!(
            turn.prepare(&db.inner, &snapshot, &[]),
            Err(ConversationError::Stale)
        ));
    }
}
