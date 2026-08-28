use ente_core::{
    Session, b64,
    crypto::{self, Header, Key, Nonce, PublicKey, SecretKey, blob, sealed, secretbox},
    http,
};
use serde::Deserialize;
use zeroize::Zeroizing;

const DEFAULT_HIDDEN_SUBTYPE: u8 = 1;
const ARCHIVED_VISIBILITY: u8 = 1;
const HIDDEN_VISIBILITY: u8 = 2;

#[derive(Debug)]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub kind: String,
    pub visibility: Visibility,
    pub owner_id: i64,
    pub updated_at_micros: i64,
}

#[derive(Debug)]
pub enum Visibility {
    Visible,
    Archived,
    Hidden,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Http(#[from] http::Error),
    #[error(transparent)]
    Crypto(#[from] crypto::Error),
    #[error(transparent)]
    Base64(#[from] b64::DecodeError),
    #[error("invalid collection {id}: {reason}")]
    InvalidCollection { id: i64, reason: &'static str },
}

pub async fn list(
    session: &Session,
    user_id: i64,
    public_key: &PublicKey,
    secret_key: &SecretKey,
) -> Result<Vec<Collection>, Error> {
    let response: CollectionsResponse = session
        .api
        .get("/collections/v2")
        .query(&[("sinceTime", 0)])
        .send()
        .await?
        .error_for_code()
        .await?
        .json()
        .await?;
    let master_key = Key::try_from_slice(&session.master_key)?;

    response
        .collections
        .into_iter()
        .filter(|c| c.is_deleted != Some(true))
        .map(|c| {
            let owned = c.owner.id == user_id;
            let encrypted_key = b64::decode(&c.encrypted_key)?;
            let key_bytes = Zeroizing::new(if owned {
                let nonce = c.required(&c.key_decryption_nonce, "missing key nonce")?;
                secretbox::decrypt(
                    &encrypted_key,
                    &Nonce::try_from_slice(&b64::decode(nonce)?)?,
                    &master_key,
                )?
            } else {
                sealed::open(&encrypted_key, public_key, secret_key)?
            });
            let key = Key::try_from_slice(&key_bytes)?;
            let name = match c.name.as_deref().filter(|name| !name.is_empty()) {
                Some(name) => name.to_owned(),
                None => {
                    let encrypted_name = c.required(&c.encrypted_name, "missing name")?;
                    let nonce = c.required(&c.name_decryption_nonce, "missing name nonce")?;
                    let bytes = secretbox::decrypt(
                        &b64::decode(encrypted_name)?,
                        &Nonce::try_from_slice(&b64::decode(nonce)?)?,
                        &key,
                    )?;
                    String::from_utf8(bytes).map_err(|_| Error::InvalidCollection {
                        id: c.id,
                        reason: "name is not UTF-8",
                    })?
                }
            };
            let metadata = if owned {
                c.magic_metadata.as_ref()
            } else {
                c.shared_magic_metadata.as_ref()
            };
            let visibility = match metadata {
                Some(metadata) => {
                    let metadata = blob::decrypt_json::<Metadata>(
                        &blob::EncryptedBlob {
                            encrypted_data: b64::decode(&metadata.data)?,
                            decryption_header: Header::try_from_slice(&b64::decode(
                                &metadata.header,
                            )?)?,
                        },
                        &key,
                    )?;
                    if owned && metadata.sub_type == Some(DEFAULT_HIDDEN_SUBTYPE) {
                        HIDDEN_VISIBILITY
                    } else {
                        metadata.visibility.unwrap_or(0)
                    }
                }
                None => 0,
            };
            Ok(Collection {
                id: c.id,
                name,
                kind: c.kind,
                visibility: match visibility {
                    ARCHIVED_VISIBILITY => Visibility::Archived,
                    HIDDEN_VISIBILITY => Visibility::Hidden,
                    _ => Visibility::Visible,
                },
                owner_id: c.owner.id,
                updated_at_micros: c.updation_time,
            })
        })
        .collect()
}

#[derive(Deserialize)]
struct CollectionsResponse {
    collections: Vec<RemoteCollection>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteCollection {
    id: i64,
    owner: Owner,
    encrypted_key: String,
    key_decryption_nonce: Option<String>,
    encrypted_name: Option<String>,
    name_decryption_nonce: Option<String>,
    name: Option<String>,
    #[serde(rename = "type")]
    kind: String,
    updation_time: i64,
    is_deleted: Option<bool>,
    magic_metadata: Option<EncryptedMetadata>,
    shared_magic_metadata: Option<EncryptedMetadata>,
}

impl RemoteCollection {
    fn required<'a>(
        &self,
        value: &'a Option<String>,
        reason: &'static str,
    ) -> Result<&'a str, Error> {
        value.as_deref().ok_or(Error::InvalidCollection {
            id: self.id,
            reason,
        })
    }
}

#[derive(Deserialize)]
struct Owner {
    id: i64,
}

#[derive(Deserialize)]
struct EncryptedMetadata {
    data: String,
    header: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Metadata {
    visibility: Option<u8>,
    sub_type: Option<u8>,
}
