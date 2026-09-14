use std::collections::BTreeMap;

use ente_core::{
    Session, b64,
    crypto::{self, Header, Key, Nonce, blob, secretbox},
    http,
};
use serde::Deserialize;

use crate::collections::{Collection, Visibility};

#[derive(Debug)]
pub struct File {
    pub id: i64,
    pub owner_id: i64,
    pub updated_at_micros: i64,
    pub name: String,
    pub kind: Kind,
    pub created_at_micros: i64,
    pub modified_at_micros: i64,
    pub location: Option<Location>,
    pub caption: Option<String>,
    pub hash: Option<String>,
    pub date_time: Option<String>,
    pub offset_time: Option<String>,
    pub duration_seconds: Option<u64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub visibility: Visibility,
    pub key: Key,
    pub header: Header,
}

#[derive(Debug, Clone, Copy)]
pub enum Kind {
    Image,
    Video,
    LivePhoto,
    Unknown,
}

impl Kind {
    pub fn name(self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Video => "video",
            Self::LivePhoto => "livephoto",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug)]
pub struct Location {
    pub latitude: f64,
    pub longitude: f64,
}

pub struct Change {
    pub id: i64,
    pub file: Option<File>,
}

pub struct Page {
    pub changes: Vec<Change>,
    pub cursor: i64,
    pub has_more: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Http(#[from] http::Error),
    #[error(transparent)]
    Crypto(#[from] crypto::Error),
    #[error(transparent)]
    Base64(#[from] b64::DecodeError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error("file changes did not advance the cursor for collection {0}")]
    CursorDidNotAdvance(i64),
}

pub async fn diff(session: &Session, collection: &Collection, since: i64) -> Result<Page, Error> {
    let response: DiffResponse = http::retry(|| async {
        session
            .api
            .get("/collections/v2/diff")
            .query(&[("collectionID", collection.id), ("sinceTime", since)])
            .send()
            .await?
            .error_for_code()
            .await?
            .json()
            .await
    })
    .await?;
    let mut cursor = since;
    let mut changes = Vec::with_capacity(response.diff.len());
    for remote in response.diff {
        cursor = cursor.max(remote.updation_time);
        changes.push(Change {
            id: remote.id,
            file: if remote.is_deleted || remote.file.encrypted_data.as_deref() == Some("-") {
                None
            } else {
                Some(remote.open(&collection.key)?)
            },
        });
    }
    if response.has_more && cursor <= since {
        return Err(Error::CursorDidNotAdvance(collection.id));
    }
    Ok(Page {
        changes,
        cursor,
        has_more: response.has_more,
    })
}

pub async fn list(session: &Session, collection: &Collection) -> Result<Vec<File>, Error> {
    let mut files = BTreeMap::new();
    let mut cursor = 0;
    loop {
        let page = diff(session, collection, cursor).await?;
        for change in page.changes {
            if let Some(file) = change.file {
                files.insert(change.id, file);
            } else {
                files.remove(&change.id);
            }
        }
        cursor = page.cursor;
        if !page.has_more {
            return Ok(files.into_values().collect());
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub async fn download(
    session: &Session,
    file: &File,
    output: &mut impl std::io::Write,
) -> Result<(), Error> {
    use ente_core::crypto::stream::{DECRYPTION_CHUNK_SIZE, Decryptor};
    use futures_util::StreamExt;

    let response = http::retry(|| async {
        let signed: DownloadUrl = session
            .api
            .get(&format!("/files/download/v3/{}", file.id))
            .send()
            .await?
            .error_for_code()
            .await?
            .json()
            .await?;
        session
            .api
            .http()
            .get(&signed.url)
            .send()
            .await?
            .error_for_status()
    })
    .await?;
    let body = response.bytes_stream();
    let mut body = std::pin::pin!(body);
    let mut decryptor = Decryptor::new(&file.header, &file.key);
    let mut buffer = Vec::with_capacity(DECRYPTION_CHUNK_SIZE);
    let mut seen_final = false;
    while let Some(chunk) = body.next().await {
        let chunk = chunk?;
        let mut remaining = chunk.as_ref();
        while !remaining.is_empty() {
            if seen_final {
                return Err(crypto::Error::StreamTrailingData.into());
            }
            let count = remaining.len().min(DECRYPTION_CHUNK_SIZE - buffer.len());
            buffer.extend_from_slice(&remaining[..count]);
            remaining = &remaining[count..];
            if buffer.len() == DECRYPTION_CHUNK_SIZE {
                let (plaintext, is_final) = decryptor.pull(&buffer)?;
                output.write_all(&plaintext)?;
                seen_final = is_final;
                buffer.clear();
            }
        }
    }
    if !buffer.is_empty() {
        let (plaintext, _) = decryptor.pull(&buffer)?;
        output.write_all(&plaintext)?;
    }
    decryptor.finish()?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiffResponse {
    diff: Vec<RemoteFile>,
    has_more: bool,
}

#[cfg(not(target_arch = "wasm32"))]
#[derive(Deserialize)]
struct DownloadUrl {
    url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteFile {
    id: i64,
    #[serde(rename = "ownerID")]
    owner_id: i64,
    encrypted_key: String,
    key_decryption_nonce: String,
    file: FileAttributes,
    metadata: FileAttributes,
    is_deleted: bool,
    updation_time: i64,
    magic_metadata: Option<EncryptedMetadata>,
    pub_magic_metadata: Option<EncryptedMetadata>,
}

impl RemoteFile {
    fn open(self, collection_key: &Key) -> Result<File, Error> {
        let key = Key::try_from_slice(&secretbox::decrypt(
            &b64::decode(&self.encrypted_key)?,
            &Nonce::try_from_slice(&b64::decode(&self.key_decryption_nonce)?)?,
            collection_key,
        )?)?;
        let metadata: Metadata = blob::decrypt_json(
            &blob::EncryptedBlob {
                encrypted_data: b64::decode(self.metadata.encrypted_data.as_deref().unwrap_or(""))?,
                decryption_header: Header::try_from_slice(&b64::decode(
                    &self.metadata.decryption_header,
                )?)?,
            },
            &key,
        )?;
        let public: PublicMetadata = match self.pub_magic_metadata {
            Some(encrypted) => encrypted.open(&key)?,
            None => PublicMetadata::default(),
        };
        let private: PrivateMetadata = match self.magic_metadata {
            Some(encrypted) => encrypted.open(&key)?,
            None => PrivateMetadata::default(),
        };
        let kind = match metadata.file_type {
            0 => Kind::Image,
            1 => Kind::Video,
            2 => Kind::LivePhoto,
            _ => Kind::Unknown,
        };
        let hash = metadata.hash.filter(|hash| !hash.is_empty()).or_else(|| {
            if matches!(kind, Kind::LivePhoto) {
                metadata
                    .image_hash
                    .zip(metadata.video_hash)
                    .map(|(image, video)| format!("{image}:{video}"))
            } else {
                None
            }
        });
        let location = public
            .lat
            .zip(public.long)
            .or(metadata.latitude.zip(metadata.longitude))
            .filter(|&(lat, long)| lat != 0.0 || long != 0.0)
            .map(|(latitude, longitude)| Location {
                latitude,
                longitude,
            });
        Ok(File {
            id: self.id,
            owner_id: self.owner_id,
            updated_at_micros: self.updation_time,
            name: public.edited_name.unwrap_or(metadata.title),
            kind,
            created_at_micros: public.edited_time.unwrap_or(metadata.creation_time),
            modified_at_micros: metadata.modification_time.unwrap_or(metadata.creation_time),
            location,
            caption: public.caption.map(|caption| match caption {
                Caption::Text(text) => text,
                Caption::Number(number) => number.to_string(),
            }),
            hash,
            date_time: public.date_time,
            offset_time: public.offset_time,
            duration_seconds: metadata.duration,
            width: public.w,
            height: public.h,
            visibility: match private.visibility {
                Some(1) => Visibility::Archived,
                Some(2) => Visibility::Hidden,
                _ => Visibility::Visible,
            },
            key,
            header: Header::try_from_slice(&b64::decode(&self.file.decryption_header)?)?,
        })
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileAttributes {
    encrypted_data: Option<String>,
    decryption_header: String,
}

#[derive(Deserialize)]
struct EncryptedMetadata {
    data: String,
    header: String,
}

impl EncryptedMetadata {
    fn open<T: serde::de::DeserializeOwned>(&self, key: &Key) -> Result<T, Error> {
        Ok(blob::decrypt_json(
            &blob::EncryptedBlob {
                encrypted_data: b64::decode(&self.data)?,
                decryption_header: Header::try_from_slice(&b64::decode(&self.header)?)?,
            },
            key,
        )?)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Metadata {
    title: String,
    file_type: i32,
    creation_time: i64,
    modification_time: Option<i64>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    hash: Option<String>,
    image_hash: Option<String>,
    video_hash: Option<String>,
    duration: Option<u64>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublicMetadata {
    edited_name: Option<String>,
    edited_time: Option<i64>,
    date_time: Option<String>,
    offset_time: Option<String>,
    caption: Option<Caption>,
    lat: Option<f64>,
    long: Option<f64>,
    w: Option<u32>,
    h: Option<u32>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Caption {
    Text(String),
    Number(serde_json::Number),
}

#[derive(Default, Deserialize)]
struct PrivateMetadata {
    visibility: Option<u8>,
}
