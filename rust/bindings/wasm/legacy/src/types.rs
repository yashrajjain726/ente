use serde::{Deserialize, Serialize};
use tsify::Tsify;

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct LegacyInfo {
    contacts: Vec<LegacyContactRecord>,
    recover_sessions: Vec<LegacyRecoverySession>,
    others_emergency_contact: Vec<LegacyContactRecord>,
    others_recovery_session: Vec<LegacyRecoverySession>,
}

impl From<ente_legacy::LegacyInfo> for LegacyInfo {
    fn from(value: ente_legacy::LegacyInfo) -> Self {
        Self {
            contacts: value.contacts.into_iter().map(Into::into).collect(),
            recover_sessions: value.recover_sessions.into_iter().map(Into::into).collect(),
            others_emergency_contact: value
                .others_emergency_contact
                .into_iter()
                .map(Into::into)
                .collect(),
            others_recovery_session: value
                .others_recovery_session
                .into_iter()
                .map(Into::into)
                .collect(),
        }
    }
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
struct LegacyContactRecord {
    user: LegacyUser,
    emergency_contact: LegacyUser,
    state: LegacyContactState,
    recovery_notice_in_days: i32,
}

impl From<ente_legacy::LegacyContactRecord> for LegacyContactRecord {
    fn from(value: ente_legacy::LegacyContactRecord) -> Self {
        Self {
            user: value.user.into(),
            emergency_contact: value.emergency_contact.into(),
            state: value.state.into(),
            recovery_notice_in_days: value.recovery_notice_in_days,
        }
    }
}

#[derive(Serialize, Deserialize, Tsify)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LegacyContactState {
    Invited,
    Revoked,
    Accepted,
    ContactLeft,
    ContactDenied,
}

impl From<ente_legacy::LegacyContactState> for LegacyContactState {
    fn from(value: ente_legacy::LegacyContactState) -> Self {
        match value {
            ente_legacy::LegacyContactState::Invited => Self::Invited,
            ente_legacy::LegacyContactState::Revoked => Self::Revoked,
            ente_legacy::LegacyContactState::Accepted => Self::Accepted,
            ente_legacy::LegacyContactState::ContactLeft => Self::ContactLeft,
            ente_legacy::LegacyContactState::ContactDenied => Self::ContactDenied,
        }
    }
}

impl From<LegacyContactState> for ente_legacy::LegacyContactState {
    fn from(value: LegacyContactState) -> Self {
        match value {
            LegacyContactState::Invited => Self::Invited,
            LegacyContactState::Revoked => Self::Revoked,
            LegacyContactState::Accepted => Self::Accepted,
            LegacyContactState::ContactLeft => Self::ContactLeft,
            LegacyContactState::ContactDenied => Self::ContactDenied,
        }
    }
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
struct LegacyRecoverySession {
    id: String,
    user: LegacyUser,
    emergency_contact: LegacyUser,
    status: LegacyRecoveryStatus,
    wait_till: i64,
    created_at: i64,
}

impl From<ente_legacy::LegacyRecoverySession> for LegacyRecoverySession {
    fn from(value: ente_legacy::LegacyRecoverySession) -> Self {
        Self {
            id: value.id,
            user: value.user.into(),
            emergency_contact: value.emergency_contact.into(),
            status: value.status.into(),
            wait_till: value.wait_till,
            created_at: value.created_at,
        }
    }
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum LegacyRecoveryStatus {
    Initiated,
    Waiting,
    Rejected,
    Recovered,
    Stopped,
    Ready,
}

impl From<ente_legacy::LegacyRecoveryStatus> for LegacyRecoveryStatus {
    fn from(value: ente_legacy::LegacyRecoveryStatus) -> Self {
        match value {
            ente_legacy::LegacyRecoveryStatus::Initiated => Self::Initiated,
            ente_legacy::LegacyRecoveryStatus::Waiting => Self::Waiting,
            ente_legacy::LegacyRecoveryStatus::Rejected => Self::Rejected,
            ente_legacy::LegacyRecoveryStatus::Recovered => Self::Recovered,
            ente_legacy::LegacyRecoveryStatus::Stopped => Self::Stopped,
            ente_legacy::LegacyRecoveryStatus::Ready => Self::Ready,
        }
    }
}

#[derive(Serialize, Tsify)]
struct LegacyUser {
    id: i64,
    email: String,
}

impl From<ente_legacy::LegacyUser> for LegacyUser {
    fn from(value: ente_legacy::LegacyUser) -> Self {
        Self {
            id: value.id,
            email: value.email,
        }
    }
}

#[derive(Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct KeyAttributes {
    kek_salt: String,
    #[tsify(optional)]
    kek_hash: Option<String>,
    encrypted_key: String,
    key_decryption_nonce: String,
    public_key: String,
    encrypted_secret_key: String,
    secret_key_decryption_nonce: String,
    mem_limit: u32,
    ops_limit: u32,
    #[tsify(optional)]
    master_key_encrypted_with_recovery_key: Option<String>,
    #[tsify(optional)]
    master_key_decryption_nonce: Option<String>,
    #[tsify(optional)]
    recovery_key_encrypted_with_master_key: Option<String>,
    #[tsify(optional)]
    recovery_key_decryption_nonce: Option<String>,
}

impl From<KeyAttributes> for ente_accounts::auth::KeyAttributes {
    fn from(value: KeyAttributes) -> Self {
        Self {
            kek_salt: value.kek_salt,
            kek_hash: value.kek_hash,
            encrypted_key: value.encrypted_key,
            key_decryption_nonce: value.key_decryption_nonce,
            public_key: value.public_key,
            encrypted_secret_key: value.encrypted_secret_key,
            secret_key_decryption_nonce: value.secret_key_decryption_nonce,
            mem_limit: value.mem_limit,
            ops_limit: value.ops_limit,
            master_key_encrypted_with_recovery_key: value.master_key_encrypted_with_recovery_key,
            master_key_decryption_nonce: value.master_key_decryption_nonce,
            recovery_key_encrypted_with_master_key: value.recovery_key_encrypted_with_master_key,
            recovery_key_decryption_nonce: value.recovery_key_decryption_nonce,
        }
    }
}
