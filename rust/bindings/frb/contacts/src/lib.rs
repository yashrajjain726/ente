use flutter_rust_bridge::frb;

use ente_frb_core::Session;

#[frb(non_opaque)]
pub enum ContactsError {
    Other { message: String },
}

impl From<ente_contacts::Error> for ContactsError {
    fn from(error: ente_contacts::Error) -> Self {
        Self::Other {
            message: ente_core::error::chain(&error),
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
pub struct ContactRecordOutput {
    pub record: ContactRecord,
    pub wrapped_root_contact_key: Option<WrappedRootContactKey>,
}

#[frb]
pub struct ContactDiffOutput {
    pub records: Vec<ContactRecord>,
    pub wrapped_root_contact_key: Option<WrappedRootContactKey>,
}

#[frb]
pub struct ProfilePictureOutput {
    pub bytes: Vec<u8>,
    pub wrapped_root_contact_key: Option<WrappedRootContactKey>,
}

pub async fn create_contact(
    session: &Session,
    wrapped_root_contact_key: Option<WrappedRootContactKey>,
    data: ContactData,
) -> Result<ContactRecordOutput, ContactsError> {
    let key = wrapped_root_contact_key.map(Into::into);
    let output = ente_contacts::create_contact(session.as_ref(), key.as_ref(), &data.into()).await?;
    Ok(ContactRecordOutput {
        record: output.value.into(),
        wrapped_root_contact_key: output.wrapped_root_contact_key.map(Into::into),
    })
}

pub async fn get_diff(
    session: &Session,
    wrapped_root_contact_key: Option<WrappedRootContactKey>,
    since_time: i64,
    limit: u16,
) -> Result<ContactDiffOutput, ContactsError> {
    let key = wrapped_root_contact_key.map(Into::into);
    let output = ente_contacts::get_diff(session.as_ref(), key.as_ref(), since_time, limit).await?;
    Ok(ContactDiffOutput {
        records: output.value.into_iter().map(Into::into).collect(),
        wrapped_root_contact_key: output.wrapped_root_contact_key.map(Into::into),
    })
}

pub async fn update_contact(
    session: &Session,
    wrapped_root_contact_key: Option<WrappedRootContactKey>,
    contact_id: String,
    data: ContactData,
) -> Result<ContactRecordOutput, ContactsError> {
    let key = wrapped_root_contact_key.map(Into::into);
    let output =
        ente_contacts::update_contact(session.as_ref(), key.as_ref(), &contact_id, &data.into())
            .await?;
    Ok(ContactRecordOutput {
        record: output.value.into(),
        wrapped_root_contact_key: output.wrapped_root_contact_key.map(Into::into),
    })
}

pub async fn delete_contact(session: &Session, contact_id: String) -> Result<(), ContactsError> {
    ente_contacts::delete_contact(session.as_ref(), &contact_id)
        .await
        .map_err(Into::into)
}

pub async fn set_attachment(
    session: &Session,
    wrapped_root_contact_key: Option<WrappedRootContactKey>,
    contact_id: String,
    attachment_type: AttachmentType,
    attachment_bytes: Vec<u8>,
) -> Result<ContactRecordOutput, ContactsError> {
    let key = wrapped_root_contact_key.map(Into::into);
    let output = ente_contacts::set_attachment(
        session.as_ref(),
        key.as_ref(),
        &contact_id,
        attachment_type.into(),
        &attachment_bytes,
    )
    .await?;
    Ok(ContactRecordOutput {
        record: output.value.into(),
        wrapped_root_contact_key: output.wrapped_root_contact_key.map(Into::into),
    })
}

pub async fn delete_attachment(
    session: &Session,
    wrapped_root_contact_key: Option<WrappedRootContactKey>,
    contact_id: String,
    attachment_type: AttachmentType,
) -> Result<ContactRecordOutput, ContactsError> {
    let key = wrapped_root_contact_key.map(Into::into);
    let output = ente_contacts::delete_attachment(
        session.as_ref(),
        key.as_ref(),
        &contact_id,
        attachment_type.into(),
    )
    .await?;
    Ok(ContactRecordOutput {
        record: output.value.into(),
        wrapped_root_contact_key: output.wrapped_root_contact_key.map(Into::into),
    })
}

pub async fn get_profile_picture(
    session: &Session,
    wrapped_root_contact_key: Option<WrappedRootContactKey>,
    contact_id: String,
) -> Result<ProfilePictureOutput, ContactsError> {
    let key = wrapped_root_contact_key.map(Into::into);
    let output =
        ente_contacts::get_profile_picture(session.as_ref(), key.as_ref(), &contact_id).await?;
    Ok(ProfilePictureOutput {
        bytes: output.value,
        wrapped_root_contact_key: output.wrapped_root_contact_key.map(Into::into),
    })
}
