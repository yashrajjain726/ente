use md5::{Digest, Md5};

use ente_core::b64;
use ente_core::crypto::{self, blob};
use serde::{Deserialize, Serialize};

use super::contact::ContactEntityResponse;
use super::{ContactRecord, ContactsClient};
use crate::{Error, Result};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttachmentType {
    ProfilePicture,
}

impl AttachmentType {
    fn as_str(self) -> &'static str {
        match self {
            Self::ProfilePicture => "profile_picture",
        }
    }
}

impl ContactsClient {
    pub async fn set_profile_picture(
        &self,
        contact_id: &str,
        profile_picture: &[u8],
    ) -> Result<ContactRecord> {
        self.set_attachment(contact_id, AttachmentType::ProfilePicture, profile_picture)
            .await
    }

    pub async fn get_profile_picture(&self, contact_id: &str) -> Result<Vec<u8>> {
        let current = self
            .api
            .get(&format!("/contacts/{contact_id}"))
            .send()
            .await?
            .error_for_status()?
            .json::<ContactEntityResponse>()
            .await?;
        if current.is_deleted {
            return Err(Error::ProfilePictureNotFound);
        }
        let attachment_id = current
            .profile_picture_attachment_id
            .as_deref()
            .ok_or(Error::ProfilePictureNotFound)?;
        self.ensure_confirmed_root_contact_key().await?;

        let encrypted_key = current
            .encrypted_key
            .as_deref()
            .ok_or(Error::MissingEncryptedKey)?;
        let contact_key = self.decrypt_contact_key(encrypted_key)?;
        let encrypted_picture = self
            .get_attachment_encrypted(AttachmentType::ProfilePicture, attachment_id)
            .await?;
        decrypt_attachment(&encrypted_picture, &contact_key)
    }

    pub async fn delete_profile_picture(&self, contact_id: &str) -> Result<ContactRecord> {
        self.delete_attachment(contact_id, AttachmentType::ProfilePicture)
            .await
    }

    pub async fn set_attachment(
        &self,
        contact_id: &str,
        attachment_type: AttachmentType,
        attachment_bytes: &[u8],
    ) -> Result<ContactRecord> {
        self.ensure_confirmed_root_contact_key().await?;

        let current = self
            .api
            .get(&format!("/contacts/{contact_id}"))
            .send()
            .await?
            .error_for_status()?
            .json::<ContactEntityResponse>()
            .await?;
        let encrypted_key = current
            .encrypted_key
            .as_deref()
            .ok_or(Error::MissingEncryptedKey)?;
        let contact_key = self.decrypt_contact_key(encrypted_key)?;
        let encrypted_attachment = encrypt_attachment(attachment_bytes, &contact_key)?;
        let content_md5 = content_md5_base64(&encrypted_attachment);
        let size = encrypted_attachment.len() as i64;

        let upload = self
            .api
            .post(&format!(
                "/attachments/{}/upload-url",
                attachment_type.as_str()
            ))
            .json(&AttachmentUploadUrlRequest {
                content_length: size,
                content_md5: content_md5.clone(),
            })
            .send()
            .await?
            .error_for_status()?
            .json::<AttachmentUploadUrlResponse>()
            .await?;

        self.api
            .http()
            .put(&upload.url)
            .header("Content-MD5", &content_md5)
            .body(encrypted_attachment)
            .send()
            .await?
            .error_for_status()?;

        let response = self
            .api
            .put(&format!(
                "/contacts/{contact_id}/attachments/{}",
                attachment_type.as_str()
            ))
            .json(&CommitAttachmentRequest {
                attachment_id: &upload.attachment_id,
                size,
            })
            .send()
            .await?
            .error_for_status()?
            .json::<ContactEntityResponse>()
            .await?;

        self.decode_contact(response)
    }

    pub async fn get_attachment_encrypted(
        &self,
        attachment_type: AttachmentType,
        attachment_id: &str,
    ) -> Result<Vec<u8>> {
        let download = self
            .api
            .get(&format!(
                "/attachments/{}/{attachment_id}",
                attachment_type.as_str()
            ))
            .send()
            .await?
            .error_for_status()?
            .json::<SignedUrlResponse>()
            .await?;
        Ok(self
            .api
            .http()
            .get(&download.url)
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?)
    }

    pub async fn delete_attachment(
        &self,
        contact_id: &str,
        attachment_type: AttachmentType,
    ) -> Result<ContactRecord> {
        self.ensure_confirmed_root_contact_key().await?;
        let response = self
            .api
            .delete(&format!(
                "/contacts/{contact_id}/attachments/{}",
                attachment_type.as_str()
            ))
            .send()
            .await?
            .error_for_status()?
            .json::<ContactEntityResponse>()
            .await?;
        self.decode_contact(response)
    }
}

fn encrypt_attachment(bytes: &[u8], contact_key: &[u8]) -> Result<Vec<u8>> {
    Ok(blob::encrypt_combined(
        bytes,
        &crypto::Key::try_from_slice(contact_key)?,
    )?)
}

fn decrypt_attachment(bytes: &[u8], contact_key: &[u8]) -> Result<Vec<u8>> {
    Ok(blob::decrypt_combined(
        bytes,
        &crypto::Key::try_from_slice(contact_key)?,
    )?)
}

fn content_md5_base64(bytes: &[u8]) -> String {
    b64::encode(Md5::digest(bytes).as_slice())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentUploadUrlRequest {
    content_length: i64,
    #[serde(rename = "contentMD5")]
    content_md5: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttachmentUploadUrlResponse {
    #[serde(rename = "attachmentID")]
    attachment_id: String,
    url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CommitAttachmentRequest<'a> {
    #[serde(rename = "attachmentID")]
    attachment_id: &'a str,
    size: i64,
}

#[derive(Deserialize)]
struct SignedUrlResponse {
    url: String,
}
