use std::sync::Arc;

use ente_core::{
    Session,
    crypto::SecretVec,
    http::{ApiConfig, Auth},
};
use flutter_rust_bridge::frb;

#[frb]
pub enum ContactsError {
    Other { message: String },
}

impl From<ente_contacts::Error> for ContactsError {
    fn from(e: ente_contacts::Error) -> Self {
        Self::Other {
            message: ente_core::error::chain(&e),
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
    session: Arc<Session>,
    contacts: Arc<ente_contacts::ContactsClient>,
}

#[frb]
pub async fn open_contacts_ctx(
    input: OpenContactsCtxInput,
) -> Result<OpenContactsCtxResult, ContactsError> {
    let session = Arc::new(
        Session::new(
            ApiConfig {
                origin: input.base_url,
                client_package: input.client_package,
                client_version: input.client_version,
                user_agent: input.user_agent,
                auth: Some(Auth::User(input.auth_token)),
            },
            SecretVec::new(input.master_key),
        )
        .map_err(ente_contacts::Error::from)?,
    );
    let opened = ente_contacts::ContactsClient::open(
        Arc::clone(&session),
        ente_contacts::OpenContactsInput {
            user_id: input.user_id,
            cached_wrapped_root_contact_key: input.cached_wrapped_root_contact_key.map(Into::into),
        },
    )?;

    Ok(OpenContactsCtxResult {
        ctx: ContactsCtx {
            session,
            contacts: Arc::new(opened.client),
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
        self.session.api.set_auth(Some(Auth::User(auth_token)));
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
}
