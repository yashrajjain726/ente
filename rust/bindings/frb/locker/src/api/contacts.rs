use std::sync::Arc;

use ente_core::{
    crypto::SecretVec,
    http::{Api, ApiConfig, Auth, Http},
};
use ente_legacy::{LegacyClient, LegacyKitOwnerRecoverySession, LegacyKitRecoveryInitiator};
use flutter_rust_bridge::frb;

#[frb]
pub enum ContactsError {
    ActiveRecoverySession { message: String },
    Other { message: String },
}

impl From<ente_contacts::Error> for ContactsError {
    fn from(e: ente_contacts::Error) -> Self {
        Self::Other {
            message: ente_core::error::chain(&e),
        }
    }
}

impl From<ente_legacy::Error> for ContactsError {
    fn from(e: ente_legacy::Error) -> Self {
        use ente_legacy::Error as E;

        let message = ente_core::error::chain(&e);
        match e {
            E::ActiveRecoverySession => Self::ActiveRecoverySession { message },
            _ => Self::Other { message },
        }
    }
}

#[frb]
#[derive(Clone)]
pub struct WrappedRootContactKey {
    pub encrypted_key: String,
    pub header: String,
}

impl From<ente_contacts::WrappedRootContactKey> for WrappedRootContactKey {
    fn from(value: ente_contacts::WrappedRootContactKey) -> Self {
        Self {
            encrypted_key: value.encrypted_key,
            header: value.header,
        }
    }
}

impl From<WrappedRootContactKey> for ente_contacts::WrappedRootContactKey {
    fn from(value: WrappedRootContactKey) -> Self {
        Self {
            encrypted_key: value.encrypted_key,
            header: value.header,
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
#[derive(Clone)]
pub struct ContactData {
    pub contact_user_id: i64,
    pub name: String,
}

impl From<ContactData> for ente_contacts::ContactData {
    fn from(value: ContactData) -> Self {
        Self {
            contact_user_id: value.contact_user_id,
            name: value.name,
        }
    }
}

#[frb]
#[derive(Clone)]
pub struct ContactRecord {
    pub id: String,
    pub contact_user_id: i64,
    pub email: Option<String>,
    pub name: Option<String>,
    pub profile_picture_attachment_id: Option<String>,
    pub is_deleted: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

impl From<ente_contacts::ContactRecord> for ContactRecord {
    fn from(value: ente_contacts::ContactRecord) -> Self {
        Self {
            id: value.id,
            contact_user_id: value.contact_user_id,
            email: value.email,
            name: value.name,
            profile_picture_attachment_id: value.profile_picture_attachment_id,
            is_deleted: value.is_deleted,
            created_at: value.created_at,
            updated_at: value.updated_at,
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

#[frb]
#[derive(Clone)]
pub enum RootKeySource {
    Cache,
    Unresolved,
}

impl From<ente_contacts::RootKeySource> for RootKeySource {
    fn from(value: ente_contacts::RootKeySource) -> Self {
        match value {
            ente_contacts::RootKeySource::Cache => RootKeySource::Cache,
            ente_contacts::RootKeySource::Unresolved => RootKeySource::Unresolved,
        }
    }
}

#[frb]
#[derive(Clone, Copy)]
pub enum AttachmentType {
    ProfilePicture,
}

impl From<AttachmentType> for ente_contacts::AttachmentType {
    fn from(value: AttachmentType) -> Self {
        match value {
            AttachmentType::ProfilePicture => ente_contacts::AttachmentType::ProfilePicture,
        }
    }
}

#[frb]
pub struct OpenContactsCtxInput {
    pub base_url: String,
    pub auth_token: String,
    pub user_id: i64,
    pub master_key: Vec<u8>,
    pub cached_wrapped_root_contact_key: Option<WrappedRootContactKey>,
    pub user_agent: Option<String>,
    pub client_package: Option<String>,
    pub client_version: Option<String>,
}

#[frb]
pub struct OpenContactsCtxResult {
    pub ctx: ContactsCtx,
    pub wrapped_root_contact_key: Option<WrappedRootContactKey>,
    pub root_key_source: RootKeySource,
}

#[frb(opaque)]
#[derive(Clone)]
pub struct ContactsCtx {
    api: Arc<Api>,
    contacts: Arc<ente_contacts::ContactsClient>,
    legacy: Arc<LegacyClient>,
}

#[frb]
pub async fn open_contacts_ctx(
    input: OpenContactsCtxInput,
) -> Result<OpenContactsCtxResult, ContactsError> {
    let api = Arc::new(Api::new(
        Http::new().map_err(ente_contacts::Error::from)?,
        ApiConfig {
            origin: input.base_url,
            client_package: input.client_package,
            client_version: input.client_version,
            user_agent: input.user_agent,
            auth: Some(Auth::User(input.auth_token)),
        },
    ));
    let master_key = Arc::new(SecretVec::new(input.master_key));
    let opened = ente_contacts::ContactsClient::open(
        Arc::clone(&api),
        Arc::clone(&master_key),
        ente_contacts::OpenContactsInput {
            user_id: input.user_id,
            cached_wrapped_root_contact_key: input.cached_wrapped_root_contact_key.map(Into::into),
        },
    )?;
    let legacy = LegacyClient::new(Arc::clone(&api), master_key);

    Ok(OpenContactsCtxResult {
        ctx: ContactsCtx {
            api,
            contacts: Arc::new(opened.client),
            legacy: Arc::new(legacy),
        },
        wrapped_root_contact_key: opened.wrapped_root_contact_key.map(Into::into),
        root_key_source: opened.root_key_source.into(),
    })
}

impl ContactsCtx {
    #[frb(sync)]
    pub fn user_id(&self) -> i64 {
        self.contacts.user_id()
    }

    pub fn update_auth_token(&self, auth_token: String) {
        self.api.set_auth(Some(Auth::User(auth_token)));
    }

    #[frb(sync)]
    pub fn current_wrapped_root_contact_key(&self) -> Option<WrappedRootContactKey> {
        self.contacts
            .current_wrapped_root_contact_key()
            .map(Into::into)
    }

    pub async fn create_contact(&self, data: ContactData) -> Result<ContactRecord, ContactsError> {
        self.contacts
            .create_contact(&data.into())
            .await
            .map(Into::into)
            .map_err(Into::into)
    }

    pub async fn get_contact(&self, contact_id: String) -> Result<ContactRecord, ContactsError> {
        self.contacts
            .get_contact(&contact_id)
            .await
            .map(Into::into)
            .map_err(Into::into)
    }

    pub async fn get_diff(
        &self,
        since_time: i64,
        limit: u16,
    ) -> Result<Vec<ContactRecord>, ContactsError> {
        self.contacts
            .get_diff(since_time, limit)
            .await
            .map(|records| records.into_iter().map(Into::into).collect())
            .map_err(Into::into)
    }

    pub async fn update_contact(
        &self,
        contact_id: String,
        data: ContactData,
    ) -> Result<ContactRecord, ContactsError> {
        self.contacts
            .update_contact(&contact_id, &data.into())
            .await
            .map(Into::into)
            .map_err(Into::into)
    }

    pub async fn delete_contact(&self, contact_id: String) -> Result<(), ContactsError> {
        self.contacts
            .delete_contact(&contact_id)
            .await
            .map_err(Into::into)
    }

    pub async fn set_attachment(
        &self,
        contact_id: String,
        attachment_type: AttachmentType,
        attachment_bytes: Vec<u8>,
    ) -> Result<ContactRecord, ContactsError> {
        self.contacts
            .set_attachment(&contact_id, attachment_type.into(), &attachment_bytes)
            .await
            .map(Into::into)
            .map_err(Into::into)
    }

    pub async fn delete_attachment(
        &self,
        contact_id: String,
        attachment_type: AttachmentType,
    ) -> Result<ContactRecord, ContactsError> {
        self.contacts
            .delete_attachment(&contact_id, attachment_type.into())
            .await
            .map(Into::into)
            .map_err(Into::into)
    }

    pub async fn get_profile_picture(&self, contact_id: String) -> Result<Vec<u8>, ContactsError> {
        self.contacts
            .get_profile_picture(&contact_id)
            .await
            .map_err(Into::into)
    }

    pub async fn legacy_kits(&self) -> Result<Vec<LegacyKit>, ContactsError> {
        self.legacy
            .kits()
            .await
            .map(|kits| kits.into_iter().map(Into::into).collect())
            .map_err(Into::into)
    }

    pub async fn legacy_kit_create(
        &self,
        current_user_key_attrs: AccountKeyAttributes,
        part_names: Vec<String>,
        notice_period_in_hours: i32,
    ) -> Result<LegacyKitCreateResult, ContactsError> {
        let part_names: [String; 3] = part_names.try_into().map_err(|_| ContactsError::Other {
            message: "legacy kit requires exactly three part names".into(),
        })?;
        self.legacy
            .create_kit(
                &current_user_key_attrs.into(),
                part_names,
                notice_period_in_hours,
            )
            .await
            .map(Into::into)
            .map_err(Into::into)
    }

    pub async fn legacy_kit_download_shares(
        &self,
        kit_id: String,
    ) -> Result<Vec<LegacyKitShare>, ContactsError> {
        self.legacy
            .download_kit_shares(&kit_id)
            .await
            .map(|shares| shares.into_iter().map(Into::into).collect())
            .map_err(Into::into)
    }

    pub async fn legacy_kit_recovery_session(
        &self,
        kit_id: String,
    ) -> Result<LegacyKitOwnerRecoverySessionDetails, ContactsError> {
        self.legacy
            .kit_recovery_session(&kit_id)
            .await
            .map(Into::into)
            .map_err(Into::into)
    }

    pub async fn legacy_kit_update_recovery_notice(
        &self,
        kit_id: String,
        notice_period_in_hours: i32,
    ) -> Result<(), ContactsError> {
        self.legacy
            .update_kit_recovery_notice(&kit_id, notice_period_in_hours)
            .await
            .map_err(Into::into)
    }

    pub async fn legacy_kit_block_recovery(&self, kit_id: String) -> Result<(), ContactsError> {
        self.legacy
            .block_kit_recovery(&kit_id)
            .await
            .map_err(Into::into)
    }

    pub async fn legacy_kit_delete(&self, kit_id: String) -> Result<(), ContactsError> {
        self.legacy.delete_kit(&kit_id).await.map_err(Into::into)
    }
}
