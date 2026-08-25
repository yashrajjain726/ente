use ente_legacy::{LegacyKitOwnerRecoverySession, LegacyKitRecoveryInitiator};
use flutter_rust_bridge::frb;

use super::session::Session;

#[frb]
pub enum LegacyError {
    ActiveRecoverySession { message: String },
    Other { message: String },
}

impl From<ente_legacy::Error> for LegacyError {
    fn from(error: ente_legacy::Error) -> Self {
        let message = ente_core::error::chain(&error);
        match error {
            ente_legacy::Error::ActiveRecoverySession => Self::ActiveRecoverySession { message },
            _ => Self::Other { message },
        }
    }
}

#[frb]
#[derive(Clone)]
pub struct AccountKeyAttributes {
    pub kek_salt: String,
    pub encrypted_key: String,
    pub key_decryption_nonce: String,
    pub public_key: String,
    pub encrypted_secret_key: String,
    pub secret_key_decryption_nonce: String,
    pub mem_limit: u32,
    pub ops_limit: u32,
    pub master_key_encrypted_with_recovery_key: Option<String>,
    pub master_key_decryption_nonce: Option<String>,
    pub recovery_key_encrypted_with_master_key: Option<String>,
    pub recovery_key_decryption_nonce: Option<String>,
}

impl From<AccountKeyAttributes> for ente_accounts::auth::KeyAttributes {
    fn from(value: AccountKeyAttributes) -> Self {
        Self {
            kek_salt: value.kek_salt,
            kek_hash: None,
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

#[frb]
#[derive(Clone, Copy)]
pub enum LegacyKitVariant {
    TwoOfThree,
}

impl From<ente_legacy::LegacyKitVariant> for LegacyKitVariant {
    fn from(value: ente_legacy::LegacyKitVariant) -> Self {
        match value {
            ente_legacy::LegacyKitVariant::TwoOfThree => Self::TwoOfThree,
        }
    }
}

#[frb]
#[derive(Clone, Copy)]
pub enum LegacyKitRecoveryStatus {
    Waiting,
    Ready,
    Blocked,
    Cancelled,
    Recovered,
}

impl From<ente_legacy::LegacyKitRecoveryStatus> for LegacyKitRecoveryStatus {
    fn from(value: ente_legacy::LegacyKitRecoveryStatus) -> Self {
        match value {
            ente_legacy::LegacyKitRecoveryStatus::Waiting => Self::Waiting,
            ente_legacy::LegacyKitRecoveryStatus::Ready => Self::Ready,
            ente_legacy::LegacyKitRecoveryStatus::Blocked => Self::Blocked,
            ente_legacy::LegacyKitRecoveryStatus::Cancelled => Self::Cancelled,
            ente_legacy::LegacyKitRecoveryStatus::Recovered => Self::Recovered,
        }
    }
}

#[frb]
#[derive(Clone)]
pub struct LegacyKitRecoverySession {
    pub id: String,
    pub kit_id: String,
    pub status: LegacyKitRecoveryStatus,
    pub wait_till: i64,
    pub created_at: i64,
}

impl From<ente_legacy::LegacyKitRecoverySession> for LegacyKitRecoverySession {
    fn from(value: ente_legacy::LegacyKitRecoverySession) -> Self {
        Self {
            id: value.id,
            kit_id: value.kit_id,
            status: value.status.into(),
            wait_till: value.wait_till,
            created_at: value.created_at,
        }
    }
}

#[frb]
#[derive(Clone)]
pub struct LegacyKitRecoveryInitiatorHint {
    pub used_part_indexes: Vec<u8>,
    pub ip: String,
    pub user_agent: String,
}

impl From<LegacyKitRecoveryInitiator> for LegacyKitRecoveryInitiatorHint {
    fn from(value: LegacyKitRecoveryInitiator) -> Self {
        Self {
            used_part_indexes: value.used_part_indexes,
            ip: value.ip,
            user_agent: value.user_agent,
        }
    }
}

#[frb]
#[derive(Clone)]
pub struct LegacyKitOwnerRecoverySessionDetails {
    pub session: Option<LegacyKitRecoverySession>,
    pub initiators: Vec<LegacyKitRecoveryInitiatorHint>,
}

impl From<LegacyKitOwnerRecoverySession> for LegacyKitOwnerRecoverySessionDetails {
    fn from(value: LegacyKitOwnerRecoverySession) -> Self {
        Self {
            session: value.session.map(Into::into),
            initiators: value.initiators.into_iter().map(Into::into).collect(),
        }
    }
}

#[frb]
#[derive(Clone)]
pub struct LegacyKitPart {
    pub index: u8,
    pub name: String,
}

impl From<ente_legacy::LegacyKitPart> for LegacyKitPart {
    fn from(value: ente_legacy::LegacyKitPart) -> Self {
        Self {
            index: value.index,
            name: value.name,
        }
    }
}

#[frb]
#[derive(Clone)]
pub struct LegacyKitMetadata {
    pub parts: Vec<LegacyKitPart>,
}

impl From<ente_legacy::LegacyKitMetadata> for LegacyKitMetadata {
    fn from(value: ente_legacy::LegacyKitMetadata) -> Self {
        Self {
            parts: value.parts.into_iter().map(Into::into).collect(),
        }
    }
}

#[frb]
#[derive(Clone)]
pub struct LegacyKit {
    pub id: String,
    pub variant: LegacyKitVariant,
    pub notice_period_in_hours: i32,
    pub legacy_url: String,
    pub metadata: LegacyKitMetadata,
    pub created_at: i64,
    pub updated_at: i64,
    pub active_recovery_session: Option<LegacyKitRecoverySession>,
}

impl From<ente_legacy::LegacyKit> for LegacyKit {
    fn from(value: ente_legacy::LegacyKit) -> Self {
        Self {
            id: value.id,
            variant: value.variant.into(),
            notice_period_in_hours: value.notice_period_in_hours,
            legacy_url: value.legacy_url,
            metadata: value.metadata.into(),
            created_at: value.created_at,
            updated_at: value.updated_at,
            active_recovery_session: value.active_recovery_session.map(Into::into),
        }
    }
}

#[frb]
#[derive(Clone)]
pub struct LegacyKitShare {
    pub payload_version: u8,
    pub variant: LegacyKitVariant,
    pub kit_id: String,
    pub share_index: u8,
    pub share: String,
    pub checksum: String,
    pub part_name: String,
}

impl From<ente_legacy::LegacyKitShare> for LegacyKitShare {
    fn from(value: ente_legacy::LegacyKitShare) -> Self {
        Self {
            payload_version: value.payload_version,
            variant: value.variant.into(),
            kit_id: value.kit_id,
            share_index: value.share_index,
            share: value.share,
            checksum: value.checksum,
            part_name: value.part_name,
        }
    }
}

#[frb]
#[derive(Clone)]
pub struct LegacyKitCreateResult {
    pub kit: LegacyKit,
    pub shares: Vec<LegacyKitShare>,
}

impl From<ente_legacy::LegacyKitCreateResult> for LegacyKitCreateResult {
    fn from(value: ente_legacy::LegacyKitCreateResult) -> Self {
        Self {
            kit: value.kit.into(),
            shares: value.shares.into_iter().map(Into::into).collect(),
        }
    }
}

pub async fn kits(session: &Session) -> Result<Vec<LegacyKit>, LegacyError> {
    ente_legacy::kits(session.inner())
        .await
        .map(|kits| kits.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

pub async fn create_kit(
    session: &Session,
    current_user_key_attrs: AccountKeyAttributes,
    part_names: Vec<String>,
    notice_period_in_hours: i32,
) -> Result<LegacyKitCreateResult, LegacyError> {
    let part_names: [String; 3] = part_names.try_into().map_err(|_| LegacyError::Other {
        message: "legacy kit requires exactly three part names".into(),
    })?;
    ente_legacy::create_kit(
        session.inner(),
        &current_user_key_attrs.into(),
        part_names,
        notice_period_in_hours,
    )
    .await
    .map(Into::into)
    .map_err(Into::into)
}

pub async fn download_kit_shares(
    session: &Session,
    kit_id: String,
) -> Result<Vec<LegacyKitShare>, LegacyError> {
    ente_legacy::download_kit_shares(session.inner(), &kit_id)
        .await
        .map(|shares| shares.into_iter().map(Into::into).collect())
        .map_err(Into::into)
}

pub async fn kit_recovery_session(
    session: &Session,
    kit_id: String,
) -> Result<LegacyKitOwnerRecoverySessionDetails, LegacyError> {
    ente_legacy::kit_recovery_session(session.inner(), &kit_id)
        .await
        .map(Into::into)
        .map_err(Into::into)
}

pub async fn update_kit_recovery_notice(
    session: &Session,
    kit_id: String,
    notice_period_in_hours: i32,
) -> Result<(), LegacyError> {
    ente_legacy::update_kit_recovery_notice(session.inner(), &kit_id, notice_period_in_hours)
        .await
        .map_err(Into::into)
}

pub async fn block_kit_recovery(session: &Session, kit_id: String) -> Result<(), LegacyError> {
    ente_legacy::block_kit_recovery(session.inner(), &kit_id)
        .await
        .map_err(Into::into)
}

pub async fn delete_kit(session: &Session, kit_id: String) -> Result<(), LegacyError> {
    ente_legacy::delete_kit(session.inner(), &kit_id)
        .await
        .map_err(Into::into)
}
