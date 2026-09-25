use chrono::{DateTime, SecondsFormat};
use ente_core::{
    b64,
    crypto::{Key, kdf},
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

use crate::{
    collections::{Collection, Visibility},
    files::{File, Kind},
    source::MetadataError,
};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Root {
    pub format: String,
    pub version: u32,
    pub source_verifier: String,
}

impl Root {
    pub fn new(master_key: &Key) -> ente_core::crypto::Result<Self> {
        Ok(Self {
            format: "ente-photos-export".into(),
            version: 1,
            source_verifier: b64::encode(&kdf::derive_subkey(master_key, 32, 1, b"photoexp")?),
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Original,
    Image,
    Video,
}

impl Role {
    pub fn name(&self) -> &'static str {
        match self {
            Self::Original => "original",
            Self::Image => "image",
            Self::Video => "video",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Component {
    pub role: Role,
    pub path: String,
    pub size: u64,
    pub hash: String,
}

pub fn album(album: &Collection) -> Value {
    let mut metadata = json!({
        "albumID": album.id.to_string(), "type": album.kind.name(), "visibility": album.visibility.name(),
    }).as_object().cloned().unwrap_or_default();
    optional(&mut metadata, "displayOrder", album.display_order);
    optional(&mut metadata, "muted", album.muted);
    optional(
        &mut metadata,
        "sortOrder",
        album
            .ascending
            .map(|asc| if asc { "ascending" } else { "descending" }),
    );
    optional(&mut metadata, "description", album.description.as_deref());
    optional(
        &mut metadata,
        "coverFileID",
        album.cover_file_id.map(|id| id.to_string()),
    );
    optional(&mut metadata, "layout", album.layout.as_deref());
    json!({"title": album.name, "ente": metadata})
}

pub fn file(
    file: &File,
    components: &[Component],
    component: usize,
    favorited: bool,
) -> Result<Value, MetadataError> {
    let selected = components
        .get(component)
        .ok_or(MetadataError("missing media component"))?;
    let mut metadata = json!({
        "fileID": file.id.to_string(),
        "type": if file.kind == Kind::LivePhoto { "livePhoto" } else { file.kind.name() },
        "name": file.name,
        "creationTime": timestamp(file.created_at_micros)?,
        "component": selected.role,
        "components": components,
    })
    .as_object()
    .cloned()
    .unwrap_or_default();
    optional(
        &mut metadata,
        "modificationTime",
        file.modified_at_micros.map(timestamp).transpose()?,
    );
    optional(
        &mut metadata,
        "location",
        file.location
            .as_ref()
            .map(|l| json!({"latitude": l.latitude,"longitude": l.longitude})),
    );
    optional(&mut metadata, "localDateTime", file.date_time.as_deref());
    optional(&mut metadata, "utcOffset", file.offset_time.as_deref());
    optional(&mut metadata, "width", file.width);
    optional(&mut metadata, "height", file.height);
    optional(&mut metadata, "durationSeconds", file.duration_seconds);
    optional(
        &mut metadata,
        "visibility",
        file.visibility.map(Visibility::name),
    );
    optional(&mut metadata, "cameraMake", file.camera_make.as_deref());
    optional(&mut metadata, "cameraModel", file.camera_model.as_deref());
    optional(&mut metadata, "uploaderName", file.uploader_name.as_deref());
    optional(&mut metadata, "panorama", file.panorama);
    optional(
        &mut metadata,
        "motionPhotoVideoOffset",
        file.motion_video_offset,
    );
    let taken = common_time(file.created_at_micros)?;
    let mut record = json!({
        "title": selected.path,
        "photoTakenTime": taken,
        "creationTime": taken,
        "favorited": favorited,
        "ente": metadata,
    });
    let object = record
        .as_object_mut()
        .ok_or(MetadataError("invalid file record"))?;
    optional(
        object,
        "modificationTime",
        file.modified_at_micros.map(common_time).transpose()?,
    );
    optional(object, "description", file.caption.as_deref());
    optional(
        object,
        "geoData",
        file.location
            .as_ref()
            .map(|l| json!({"latitude":l.latitude,"longitude":l.longitude})),
    );
    Ok(record)
}

fn optional(object: &mut Map<String, Value>, name: &str, value: Option<impl Into<Value>>) {
    if let Some(value) = value {
        object.insert(name.into(), value.into());
    }
}

fn time(micros: i64) -> Result<DateTime<chrono::Utc>, MetadataError> {
    DateTime::from_timestamp_micros(micros)
        .ok_or(MetadataError("timestamp is outside the supported range"))
}

fn timestamp(micros: i64) -> Result<String, MetadataError> {
    Ok(time(micros)?.to_rfc3339_opts(SecondsFormat::Micros, true))
}

fn common_time(micros: i64) -> Result<Value, MetadataError> {
    let time = time(micros)?;
    Ok(
        json!({"timestamp":micros.div_euclid(1_000_000).to_string(),"formatted":time.format("%b %-d, %Y, %-I:%M:%S %p UTC").to_string()}),
    )
}
