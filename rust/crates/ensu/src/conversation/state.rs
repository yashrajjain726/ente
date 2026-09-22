use serde::Serialize;
use uuid::Uuid;

use super::{ConversationState, MAX_STATE_BYTES, Summary, validate_summary_text};

pub const ENVELOPE_VERSION: u32 = 2;

#[derive(Debug, Serialize)]
pub struct ConversationEnvelope {
    pub format_version: u32,
    #[serde(serialize_with = "super::uuid_text::serialize")]
    pub session_uuid: Uuid,
    pub summary: Option<Summary>,
}

impl ConversationEnvelope {
    pub fn empty(session: Uuid) -> Self {
        Self {
            format_version: ENVELOPE_VERSION,
            session_uuid: session,
            summary: None,
        }
    }

    pub fn decode(bytes: &[u8], session: Uuid) -> Option<Self> {
        if bytes.len() > MAX_STATE_BYTES {
            return None;
        }
        let value: serde_json::Value = serde_json::from_slice(bytes).ok()?;
        let version = value.get("format_version")?.as_u64()?;
        if version != u64::from(ENVELOPE_VERSION)
            || value.get("session_uuid")?.as_str()? != session.to_string()
        {
            return None;
        }
        let summary = value
            .get("summary")
            .cloned()
            .and_then(|value| serde_json::from_value::<Summary>(value).ok())
            .filter(|summary| validate_summary_text(&summary.text).is_ok());
        Some(Self {
            format_version: ENVELOPE_VERSION,
            session_uuid: session,
            summary,
        })
    }

    pub fn summary_state(self) -> Option<ConversationState> {
        self.summary.map(|summary| ConversationState {
            session_uuid: self.session_uuid,
            summary,
        })
    }
}
