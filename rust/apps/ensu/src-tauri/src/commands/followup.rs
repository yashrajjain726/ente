use super::{chat_db::ChatDbState, common::ApiError};
use ente_ensu::{
    conversation as core,
    db::{ChatDb, SqliteBackend, chat::ConversationSnapshot},
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, atomic::Ordering};
use tauri::{AppHandle, Manager, State as TauriState, WebviewWindow};
use uuid::Uuid;

#[derive(Default)]
pub struct State {
    guards: Mutex<HashMap<String, Guard>>,
}
struct Guard {
    token: String,
    fingerprint: String,
    db: Arc<ChatDb<SqliteBackend>>,
    candidates: Option<String>,
}

fn error(message: impl Into<String>) -> ApiError {
    ApiError::new("followup", message)
}

impl State {
    pub(crate) fn validate(
        &self,
        window: &str,
        token: &str,
        db: &Arc<ChatDb<SqliteBackend>>,
        snapshot: &ConversationSnapshot,
        candidates: Option<&core::GroundingCandidates>,
    ) -> Result<(), ApiError> {
        let guards = self
            .guards
            .lock()
            .map_err(|_| error("Follow-up state is unavailable"))?;
        if guards.get(window).is_some_and(|guard| {
            guard.token == token
                && guard.candidates.as_ref().is_some_and(|expected| {
                    candidates
                        .and_then(|c| serde_json::to_string(c).ok())
                        .as_ref()
                        == Some(expected)
                })
                && Arc::ptr_eq(&guard.db, db)
                && guard.fingerprint == core::fingerprint(snapshot.messages())
        }) {
            Ok(())
        } else {
            Err(ApiError::new(
                "stale",
                "Conversation changed after selecting sources; retry the reply",
            ))
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    token: String,
    session_uuid: Uuid,
    path: Vec<Uuid>,
    question: String,
    enabled_stable_ids: Vec<String>,
    cancellation_epoch: u64,
    candidates: Option<core::GroundingCandidates>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    token: String,
    candidates: core::GroundingCandidates,
}

#[tauri::command]
pub async fn conversation_resolve_followup(
    app: AppHandle,
    window: WebviewWindow,
    state: TauriState<'_, State>,
    llm_state: TauriState<'_, super::llm::State>,
    input: Request,
) -> Result<Response, ApiError> {
    if Uuid::parse_str(&input.token).is_err()
        || input.path.is_empty()
        || input.path.len() > core::MAX_HISTORY_MESSAGES
        || input.question.len() > core::MAX_HISTORY_BYTES
    {
        return Err(error(
            "Please restate the source question with its subject or document name",
        ));
    }
    let db = app.state::<ChatDbState>().database()?;
    let snapshot = db
        .conversation_snapshot(input.session_uuid, &input.path)
        .map_err(ApiError::from)?;
    let question = snapshot
        .messages()
        .last()
        .ok_or_else(|| error("Missing current question"))?;
    if question.sender != ente_ensu::db::Sender::SelfUser {
        return Err(error("Follow-up must end at a user question"));
    }
    {
        let mut guards = state
            .guards
            .lock()
            .map_err(|_| error("Follow-up state is unavailable"))?;
        if guards
            .get(window.label())
            .is_some_and(|guard| guard.token == input.token)
        {
            return Err(error(
                "This source selection was already attempted; retry the reply",
            ));
        }
        guards.insert(
            window.label().to_owned(),
            Guard {
                token: input.token.clone(),
                fingerprint: core::fingerprint(snapshot.messages()),
                db: db.clone(),
                candidates: None,
            },
        );
    }
    let epoch = llm_state.retrieval_epoch();
    let expected = input.cancellation_epoch;
    let check = || {
        if epoch.load(Ordering::Relaxed) == expected {
            Ok(())
        } else {
            Err(ApiError::new("cancelled", "Follow-up cancelled"))
        }
    };
    check()?;
    let evidence: Vec<_> = snapshot.evidence().into_iter().cloned().collect();
    let (searched, max_utf8_bytes) = input
        .candidates
        .map_or((Vec::new(), core::MAX_GROUNDING_BYTES), |fresh| {
            (fresh.searched, fresh.max_utf8_bytes)
        });
    let mut candidates = core::GroundingCandidates::new(Vec::new(), searched, max_utf8_bytes)
        .map_err(|cause| error(cause.to_string()))?;
    let references = core::direct_followup_references(
        snapshot.messages(),
        &evidence,
        &input.question,
        &candidates.searched,
    )
    .unwrap_or_default();
    for reference in references {
        check()?;
        match super::knowledge::reload_for_followup(
            &app,
            reference,
            input.enabled_stable_ids.clone(),
            expected,
        )
        .await
        {
            Ok(Some(passage)) => candidates.referenced.push(passage),
            Ok(None) => {}
            Err(error) if error.name == Some("cancelled") => return Err(error),
            Err(error) => crate::logging::log(
                "Conversation",
                format!("Source reload skipped: {}", error.message),
            ),
        }
    }
    candidates
        .validate()
        .map_err(|cause| error(cause.to_string()))?;
    check()?;
    if !db
        .conversation_snapshot_matches(&snapshot)
        .map_err(ApiError::from)?
        || !Arc::ptr_eq(&db, &app.state::<ChatDbState>().database()?)
    {
        return Err(ApiError::new(
            "stale",
            "Conversation changed while selecting sources; retry the reply",
        ));
    }
    let mut guards = state
        .guards
        .lock()
        .map_err(|_| error("Follow-up state is unavailable"))?;
    let guard = guards
        .get_mut(window.label())
        .filter(|guard| guard.token == input.token)
        .ok_or_else(|| ApiError::new("stale", "Source question was superseded"))?;
    guard.candidates =
        Some(serde_json::to_string(&candidates).map_err(|cause| error(cause.to_string()))?);
    Ok(Response {
        token: input.token,
        candidates,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn candidates() -> core::GroundingCandidates {
        core::GroundingCandidates::new(vec![], vec![], 6000).unwrap()
    }
    fn fixture() -> (Arc<ChatDb<SqliteBackend>>, ConversationSnapshot) {
        let db = Arc::new(ChatDb::open_in_memory(vec![4; 32]).unwrap());
        let session = db.create_session("Synthetic source question").unwrap();
        let question = db
            .insert_message(
                session.uuid,
                "self",
                "Where does she track it?",
                None,
                vec![],
            )
            .unwrap();
        let snapshot = db
            .conversation_snapshot(session.uuid, &[question.uuid])
            .unwrap();
        (db, snapshot)
    }
    #[test]
    fn preparation_requires_matching_completed_source_selection() {
        let (db, snapshot) = fixture();
        let state = State::default();
        let valid = candidates();
        state.guards.lock().unwrap().insert(
            "window".into(),
            Guard {
                token: "token".into(),
                fingerprint: core::fingerprint(snapshot.messages()),
                db: db.clone(),
                candidates: None,
            },
        );
        assert!(
            state
                .validate("window", "token", &db, &snapshot, Some(&valid))
                .is_err()
        );
        state
            .guards
            .lock()
            .unwrap()
            .get_mut("window")
            .unwrap()
            .candidates = Some(serde_json::to_string(&valid).unwrap());
        assert!(
            state
                .validate("window", "token", &db, &snapshot, Some(&valid))
                .is_ok()
        );
        let mut changed = candidates();
        changed.max_utf8_bytes = 3000;
        let (other_db, _) = fixture();
        for (token, db, candidates) in [
            ("token", &db, Some(&changed)),
            ("token", &db, None),
            ("another-token", &db, Some(&valid)),
            ("token", &other_db, Some(&valid)),
        ] {
            assert!(
                state
                    .validate("window", token, db, &snapshot, candidates)
                    .is_err()
            );
        }
        let question = snapshot.messages()[0].uuid;
        db.update_message_text(question, "Actually, use another source")
            .unwrap();
        let edited = db
            .conversation_snapshot(snapshot.session_uuid(), &[question])
            .unwrap();
        assert!(
            state
                .validate("window", "token", &db, &edited, Some(&valid))
                .is_err()
        );
    }
}
