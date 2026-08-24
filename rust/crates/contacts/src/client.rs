use std::sync::{Arc, RwLock};

use ente_core::crypto::{self, SecretVec};
use ente_core::http::Api;

use crate::crypto as contacts_crypto;
use crate::error::{Error, Result};
use crate::models::{AttachmentType, ContactData, ContactRecord, WrappedRootContactKey};
use crate::transport::{
    AttachmentUploadUrlRequest, AttachmentUploadUrlResponse, CommitAttachmentRequest,
    ContactDiffResponse, ContactEntityResponse, CreateContactRequest, CreateRootKeyRequest,
    RootKeyResponse, SignedUrlResponse, UpdateContactRequest,
};

const CONTACT_TYPE: &str = "contact";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RootKeySource {
    Cache,
    Unresolved,
}

pub struct OpenContactsInput {
    pub user_id: i64,
    pub cached_wrapped_root_contact_key: Option<WrappedRootContactKey>,
}

pub struct OpenContactsResult {
    pub client: ContactsClient,
    pub wrapped_root_contact_key: Option<WrappedRootContactKey>,
    pub root_key_source: RootKeySource,
}

pub struct ContactsClient {
    user_id: i64,
    api: Arc<Api>,
    master_key: Arc<SecretVec>,
    root_contact_key: Arc<RwLock<Option<SecretVec>>>,
    wrapped_root_contact_key: Arc<RwLock<Option<WrappedRootContactKey>>>,
}

fn wrapped_root_contact_key_from_response(
    remote_root_key: RootKeyResponse,
) -> WrappedRootContactKey {
    WrappedRootContactKey {
        encrypted_key: remote_root_key.encrypted_key,
        header: remote_root_key.header,
    }
}

impl ContactsClient {
    pub fn open(
        api: Arc<Api>,
        master_key: Arc<SecretVec>,
        input: OpenContactsInput,
    ) -> Result<OpenContactsResult> {
        let (root_contact_key, wrapped_root_contact_key, root_key_source) =
            if let Some(cached_wrapped_root_contact_key) = input.cached_wrapped_root_contact_key {
                let root_contact_key = contacts_crypto::decrypt_root_contact_key(
                    &cached_wrapped_root_contact_key,
                    master_key.as_ref(),
                )?;
                (
                    Some(SecretVec::new(root_contact_key)),
                    Some(cached_wrapped_root_contact_key),
                    RootKeySource::Cache,
                )
            } else {
                (None, None, RootKeySource::Unresolved)
            };
        let client = Self {
            user_id: input.user_id,
            api,
            master_key,
            root_contact_key: Arc::new(RwLock::new(root_contact_key)),
            wrapped_root_contact_key: Arc::new(RwLock::new(wrapped_root_contact_key.clone())),
        };

        Ok(OpenContactsResult {
            client,
            wrapped_root_contact_key,
            root_key_source,
        })
    }

    pub fn user_id(&self) -> i64 {
        self.user_id
    }

    pub fn current_wrapped_root_contact_key(&self) -> Option<WrappedRootContactKey> {
        self.wrapped_root_contact_key
            .read()
            .expect("wrapped root key lock poisoned")
            .clone()
    }

    fn apply_wrapped_root_contact_key(
        &self,
        wrapped_root_contact_key: WrappedRootContactKey,
    ) -> Result<()> {
        let decrypted_root_key = contacts_crypto::decrypt_root_contact_key(
            &wrapped_root_contact_key,
            self.master_key.as_ref(),
        )?;
        *self
            .root_contact_key
            .write()
            .expect("root contact key lock poisoned") = Some(SecretVec::new(decrypted_root_key));
        *self
            .wrapped_root_contact_key
            .write()
            .expect("wrapped root key lock poisoned") = Some(wrapped_root_contact_key);
        Ok(())
    }

    pub async fn create_contact(&self, data: &ContactData) -> Result<ContactRecord> {
        contacts_crypto::validate_contact_data(data)?;
        self.ensure_confirmed_root_contact_key().await?;

        let contact_key = SecretVec::new(crypto::random_bytes(32));
        let wrapped_contact_key = {
            let root_contact_key_guard = self
                .root_contact_key
                .read()
                .expect("root contact key lock poisoned");
            let root_contact_key = root_contact_key_guard
                .as_ref()
                .ok_or_else(|| Error::InvalidInput("contacts root key is unresolved".into()))?;
            contacts_crypto::wrap_contact_key(&contact_key, root_contact_key)?
        };
        let encrypted_data = contacts_crypto::encrypt_contact_data(data, &contact_key)?;
        let response = self
            .api
            .post("/contacts")
            .json(&CreateContactRequest {
                contact_user_id: data.contact_user_id,
                encrypted_key: &wrapped_contact_key,
                encrypted_data: &encrypted_data,
            })
            .send()
            .await?
            .error_for_status()?
            .json::<ContactEntityResponse>()
            .await?;

        self.decode_contact(response)
    }

    pub async fn get_contact(&self, contact_id: &str) -> Result<ContactRecord> {
        let response = self
            .api
            .get(&format!("/contacts/{contact_id}"))
            .send()
            .await?
            .error_for_status()?
            .json::<ContactEntityResponse>()
            .await?;
        if !response.is_deleted {
            self.ensure_confirmed_root_contact_key().await?;
        }
        self.decode_contact(response)
    }

    pub async fn get_diff(&self, since_time: i64, limit: u16) -> Result<Vec<ContactRecord>> {
        let response = self
            .api
            .get("/contacts/diff")
            .query(&[
                ("sinceTime", since_time.to_string()),
                ("limit", limit.to_string()),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<ContactDiffResponse>()
            .await?;
        if response.diff.iter().any(|entity| !entity.is_deleted) {
            self.ensure_confirmed_root_contact_key().await?;
        }

        response
            .diff
            .into_iter()
            .map(|entity| self.decode_contact(entity))
            .collect()
    }

    pub async fn update_contact(
        &self,
        contact_id: &str,
        data: &ContactData,
    ) -> Result<ContactRecord> {
        contacts_crypto::validate_contact_data(data)?;
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
        let contact_key = {
            let root_contact_key_guard = self
                .root_contact_key
                .read()
                .expect("root contact key lock poisoned");
            let root_contact_key = root_contact_key_guard
                .as_ref()
                .ok_or_else(|| Error::InvalidInput("contacts root key is unresolved".into()))?;
            contacts_crypto::unwrap_contact_key(encrypted_key, root_contact_key)?
        };
        let encrypted_data = contacts_crypto::encrypt_contact_data(data, &contact_key)?;

        let response = self
            .api
            .put(&format!("/contacts/{contact_id}"))
            .json(&UpdateContactRequest {
                contact_user_id: data.contact_user_id,
                encrypted_data: &encrypted_data,
            })
            .send()
            .await?
            .error_for_status()?
            .json::<ContactEntityResponse>()
            .await?;

        self.decode_contact(response)
    }

    pub async fn delete_contact(&self, contact_id: &str) -> Result<()> {
        self.api
            .delete(&format!("/contacts/{contact_id}"))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
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
        let contact_key = {
            let root_contact_key_guard = self
                .root_contact_key
                .read()
                .expect("root contact key lock poisoned");
            let root_contact_key = root_contact_key_guard
                .as_ref()
                .ok_or_else(|| Error::InvalidInput("contacts root key is unresolved".into()))?;
            contacts_crypto::unwrap_contact_key(encrypted_key, root_contact_key)?
        };
        let encrypted_attachment =
            contacts_crypto::encrypt_profile_picture(attachment_bytes, &contact_key)?;
        let content_md5 = contacts_crypto::content_md5_base64(&encrypted_attachment);
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

    pub async fn get_profile_picture(&self, contact_id: &str) -> Result<Vec<u8>> {
        let current = self
            .api
            .get(&format!("/contacts/{contact_id}"))
            .send()
            .await?
            .error_for_status()?
            .json::<ContactEntityResponse>()
            .await?;
        if current.is_deleted || current.profile_picture_attachment_id.is_none() {
            return Err(Error::ProfilePictureNotFound);
        }
        self.ensure_confirmed_root_contact_key().await?;

        let encrypted_key = current
            .encrypted_key
            .as_deref()
            .ok_or(Error::MissingEncryptedKey)?;
        let contact_key = {
            let root_contact_key_guard = self
                .root_contact_key
                .read()
                .expect("root contact key lock poisoned");
            let root_contact_key = root_contact_key_guard
                .as_ref()
                .ok_or_else(|| Error::InvalidInput("contacts root key is unresolved".into()))?;
            contacts_crypto::unwrap_contact_key(encrypted_key, root_contact_key)?
        };
        let encrypted_picture = self
            .get_attachment_encrypted(
                AttachmentType::ProfilePicture,
                current.profile_picture_attachment_id.as_deref().unwrap(),
            )
            .await?;
        contacts_crypto::decrypt_profile_picture(&encrypted_picture, &contact_key)
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

    pub async fn set_profile_picture(
        &self,
        contact_id: &str,
        profile_picture: &[u8],
    ) -> Result<ContactRecord> {
        self.set_attachment(contact_id, AttachmentType::ProfilePicture, profile_picture)
            .await
    }

    pub async fn delete_profile_picture(&self, contact_id: &str) -> Result<ContactRecord> {
        self.delete_attachment(contact_id, AttachmentType::ProfilePicture)
            .await
    }

    fn decode_contact(&self, entity: ContactEntityResponse) -> Result<ContactRecord> {
        if entity.is_deleted {
            return Ok(ContactRecord {
                id: entity.id,
                contact_user_id: entity.contact_user_id,
                email: None,
                name: None,
                profile_picture_attachment_id: None,
                is_deleted: true,
                created_at: entity.created_at,
                updated_at: entity.updated_at,
            });
        }

        let encrypted_key = entity
            .encrypted_key
            .as_deref()
            .ok_or(Error::MissingEncryptedKey)?;
        let encrypted_data = entity
            .encrypted_data
            .as_deref()
            .ok_or(Error::MissingEncryptedData)?;
        let root_contact_key_guard = self
            .root_contact_key
            .read()
            .expect("root contact key lock poisoned");
        let root_contact_key = root_contact_key_guard
            .as_ref()
            .ok_or_else(|| Error::InvalidInput("contacts root key is unresolved".into()))?;
        let contact_key = contacts_crypto::unwrap_contact_key(encrypted_key, root_contact_key)?;
        let data = contacts_crypto::decrypt_contact_data(encrypted_data, &contact_key)?;

        Ok(ContactRecord {
            id: entity.id,
            contact_user_id: entity.contact_user_id,
            email: entity.email,
            name: Some(data.name),
            profile_picture_attachment_id: entity.profile_picture_attachment_id,
            is_deleted: false,
            created_at: entity.created_at,
            updated_at: entity.updated_at,
        })
    }

    async fn ensure_confirmed_root_contact_key(&self) -> Result<()> {
        if self
            .root_contact_key
            .read()
            .expect("root contact key lock poisoned")
            .is_some()
        {
            return Ok(());
        }

        if let Some(remote_root_key) = fetch_root_key(&self.api).await? {
            self.apply_wrapped_root_contact_key(wrapped_root_contact_key_from_response(
                remote_root_key,
            ))?;
        } else {
            let generated_root_contact_key = SecretVec::new(crypto::random_bytes(32));
            let generated_wrapped_root_contact_key = {
                contacts_crypto::encrypt_root_contact_key(
                    &generated_root_contact_key,
                    self.master_key.as_ref(),
                )?
            };
            if let Some(remote_root_key) =
                create_root_key(&self.api, &generated_wrapped_root_contact_key).await?
            {
                self.apply_wrapped_root_contact_key(wrapped_root_contact_key_from_response(
                    remote_root_key,
                ))?;
            } else {
                self.apply_wrapped_root_contact_key(generated_wrapped_root_contact_key)?;
            }
        }

        Ok(())
    }
}

async fn fetch_root_key(api: &Api) -> Result<Option<RootKeyResponse>> {
    let response = api
        .get("/user-entity/key")
        .query(&[("type", CONTACT_TYPE)])
        .send()
        .await?;
    if response.status() == 404 {
        return Ok(None);
    }
    Ok(Some(response.error_for_status()?.json().await?))
}

async fn create_root_key(
    api: &Api,
    wrapped_root_contact_key: &WrappedRootContactKey,
) -> Result<Option<RootKeyResponse>> {
    let request = CreateRootKeyRequest {
        r#type: CONTACT_TYPE,
        encrypted_key: &wrapped_root_contact_key.encrypted_key,
        header: &wrapped_root_contact_key.header,
    };

    let response = api.post("/user-entity/key").json(&request).send().await?;
    if response.status() == 409
        && let Some(remote_root_key) = fetch_root_key(api).await?
    {
        return Ok(Some(remote_root_key));
    }
    response.error_for_status()?;
    Ok(None)
}
