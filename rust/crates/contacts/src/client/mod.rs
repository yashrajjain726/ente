mod attachment;
mod contact;

pub use attachment::AttachmentType;
pub use contact::{ContactData, ContactRecord};

use std::sync::{Arc, RwLock};

use ente_core::Session;
use ente_core::b64;
use ente_core::crypto::{self, SecretVec, secretbox};
use ente_core::http::Api;
use serde::{Deserialize, Serialize};

use crate::{Error, Result};

const CONTACT_TYPE: &str = "contact";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RootKeySource {
    Cache,
    Unresolved,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WrappedRootContactKey {
    pub encrypted_key: String,
    pub header: String,
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
    session: Arc<Session>,
    root_contact_key: Arc<RwLock<Option<SecretVec>>>,
    wrapped_root_contact_key: Arc<RwLock<Option<WrappedRootContactKey>>>,
}

impl ContactsClient {
    pub fn open(session: Arc<Session>, input: OpenContactsInput) -> Result<OpenContactsResult> {
        let (root_contact_key, wrapped_root_contact_key, root_key_source) =
            if let Some(cached_wrapped_root_contact_key) = input.cached_wrapped_root_contact_key {
                let root_contact_key = decrypt_root_contact_key(
                    &cached_wrapped_root_contact_key,
                    &session.master_key,
                )?;
                (
                    Some(root_contact_key),
                    Some(cached_wrapped_root_contact_key),
                    RootKeySource::Cache,
                )
            } else {
                (None, None, RootKeySource::Unresolved)
            };
        let client = Self {
            user_id: input.user_id,
            session,
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

    fn api(&self) -> &Api {
        &self.session.api
    }

    fn encrypt_contact_key(&self, contact_key: &[u8]) -> Result<String> {
        let root_contact_key = self
            .root_contact_key
            .read()
            .expect("root contact key lock poisoned");
        let root_contact_key = root_contact_key
            .as_ref()
            .ok_or_else(|| Error::InvalidInput("contacts root key is unresolved".into()))?;
        let encrypted = secretbox::encrypt_combined(
            contact_key,
            &crypto::Key::try_from_slice(root_contact_key)?,
        );
        Ok(b64::encode(&encrypted))
    }

    fn decrypt_contact_key(&self, encrypted_key: &str) -> Result<SecretVec> {
        let root_contact_key = self
            .root_contact_key
            .read()
            .expect("root contact key lock poisoned");
        let root_contact_key = root_contact_key
            .as_ref()
            .ok_or_else(|| Error::InvalidInput("contacts root key is unresolved".into()))?;
        let encrypted_key = b64::decode(encrypted_key)?;
        let contact_key = secretbox::decrypt_combined(
            &encrypted_key,
            &crypto::Key::try_from_slice(root_contact_key)?,
        )?;
        Ok(SecretVec::new(contact_key))
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

        if let Some(remote_root_key) = fetch_root_key(self.api()).await? {
            self.apply_wrapped_root_contact_key(remote_root_key.into())?;
        } else {
            let generated_root_contact_key = SecretVec::new(crypto::random_bytes(32));
            let generated_wrapped_root_contact_key =
                encrypt_root_contact_key(&generated_root_contact_key, &self.session.master_key)?;
            if let Some(remote_root_key) =
                create_root_key(self.api(), &generated_wrapped_root_contact_key).await?
            {
                self.apply_wrapped_root_contact_key(remote_root_key.into())?;
            } else {
                self.apply_wrapped_root_contact_key(generated_wrapped_root_contact_key)?;
            }
        }

        Ok(())
    }

    fn apply_wrapped_root_contact_key(
        &self,
        wrapped_root_contact_key: WrappedRootContactKey,
    ) -> Result<()> {
        let decrypted_root_key =
            decrypt_root_contact_key(&wrapped_root_contact_key, &self.session.master_key)?;
        *self
            .root_contact_key
            .write()
            .expect("root contact key lock poisoned") = Some(decrypted_root_key);
        *self
            .wrapped_root_contact_key
            .write()
            .expect("wrapped root key lock poisoned") = Some(wrapped_root_contact_key);
        Ok(())
    }
}

fn encrypt_root_contact_key(
    root_contact_key: &[u8],
    master_key: &[u8],
) -> Result<WrappedRootContactKey> {
    let encrypted = secretbox::encrypt(root_contact_key, &crypto::Key::try_from_slice(master_key)?);
    Ok(WrappedRootContactKey {
        encrypted_key: b64::encode(&encrypted.encrypted_data),
        header: b64::encode(encrypted.nonce.as_bytes()),
    })
}

fn decrypt_root_contact_key(
    wrapped_root_contact_key: &WrappedRootContactKey,
    master_key: &[u8],
) -> Result<SecretVec> {
    let encrypted_key = b64::decode(&wrapped_root_contact_key.encrypted_key)?;
    let header = b64::decode(&wrapped_root_contact_key.header)?;
    let root_contact_key = secretbox::decrypt(
        &encrypted_key,
        &crypto::Nonce::try_from_slice(&header)?,
        &crypto::Key::try_from_slice(master_key)?,
    )?;
    Ok(SecretVec::new(root_contact_key))
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RootKeyResponse {
    encrypted_key: String,
    header: String,
}

impl From<RootKeyResponse> for WrappedRootContactKey {
    fn from(value: RootKeyResponse) -> Self {
        Self {
            encrypted_key: value.encrypted_key,
            header: value.header,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateRootKeyRequest<'a> {
    r#type: &'a str,
    encrypted_key: &'a str,
    header: &'a str,
}
