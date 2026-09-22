use serde::{Deserialize, Serialize};
use zeroize::ZeroizeOnDrop;

use crate::Result;
use crate::transport::{ProfileAvatarResponse, ProfileCoverResponse, SpaceKeyResponse};

#[derive(Clone)]
pub struct OpenAccountSpaceCtxInput {
    pub base_url: String,
    pub space_session_token: Option<String>,
    pub space_root_key: Vec<u8>,
    pub initial_owned_spaces: Option<Vec<SpaceKeyResponse>>,
    pub user_agent: Option<String>,
    pub client_package: Option<String>,
    pub client_version: Option<String>,
}

#[derive(Clone)]
pub struct OpenSpaceLinkCtxInput {
    pub base_url: String,
    pub space_slug: String,
    pub access_key: String,
    pub user_agent: Option<String>,
    pub client_package: Option<String>,
    pub client_version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreatedSpaceLink {
    pub space_id: String,
    pub space_slug: String,
    pub access_key: String,
}

#[derive(Clone)]
pub struct CreatedSpace {
    pub space_id: String,
    pub space_slug: String,
    pub key_version: i32,
    pub space_key: Vec<u8>,
    pub root_wrapped_space_key: String,
    pub encrypted_profile: String,
}

#[derive(Debug, Clone)]
pub struct DecryptedSpaceProfile {
    pub space_id: String,
    pub space_slug: String,
    pub version: i32,
    pub friends: i64,
    pub profile: Option<SpaceProfile>,
    pub avatar: Option<ProfileAvatarResponse>,
    pub cover: Option<ProfileCoverResponse>,
    pub updated_at: Option<String>,
}

pub struct Post {
    pub post_id: i64,
    pub space_id: String,
    pub space_slug: String,
    pub author: SpaceActor,
    pub content: Result<PostContent>,
    pub created_at: String,
    pub viewer_liked: bool,
}

pub struct SpaceActor {
    pub space_id: String,
    pub space_slug: String,
    pub public_key: String,
    pub key_version: i32,
    pub profile: Result<Option<SpaceProfile>>,
    pub avatar: Option<ProfileAvatarResponse>,
}

pub struct PostContent {
    pub caption: Option<String>,
    pub photos: Vec<PostPhoto>,
}

pub struct PostPhoto {
    pub asset: PostAsset,
    pub position: Option<i32>,
    pub metadata: Option<PostObjectMetadata>,
}

pub struct PostAsset {
    pub space_id: String,
    pub post_id: i64,
    pub object_key: String,
    pub encrypted_post_key: String,
    pub key_version: i32,
    pub size: Option<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SpaceProfile {
    pub full_name: Option<String>,
    pub display_name: Option<String>,
}

impl SpaceProfile {
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        if bytes.iter().all(u8::is_ascii_whitespace) {
            return Ok(Self::default());
        }
        let value: serde_json::Value = serde_json::from_slice(bytes).map_err(|error| {
            crate::Error::InvalidInput(format!("invalid profile JSON: {error}"))
        })?;
        let fields = value
            .as_object()
            .ok_or_else(|| crate::Error::InvalidInput("profile must be a JSON object".into()))?;
        let text = |key| {
            fields
                .get(key)
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        };
        Ok(Self {
            full_name: text("fullName"),
            display_name: text("displayName"),
        })
    }
}

pub struct PostPage {
    pub items: Vec<Post>,
    pub next_cursor: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PostObjectMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blur_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumb_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MessagePayload {
    pub version: i32,
    pub kind: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_object_key: Option<String>,
}

#[derive(Clone)]
pub struct DecryptedMessage {
    pub message_key: Vec<u8>,
    pub payload: MessagePayload,
}

#[derive(Clone, ZeroizeOnDrop)]
pub struct DecryptedFriendShare {
    pub friend: String,
    pub space_id: String,
    pub space_slug: String,
    pub space_key: Vec<u8>,
    pub key_version: i32,
}

#[derive(Clone)]
pub struct HydratedKeys {
    pub owned: Vec<(String, Vec<u8>)>,
    pub friends: Vec<DecryptedFriendShare>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_names_are_optional_trimmed_strings() {
        let profile = SpaceProfile::from_bytes(
            br#"{"fullName":" Alice ","displayName":" A ","bio":"hello"}"#,
        )
        .unwrap();
        assert_eq!(profile.full_name.as_deref(), Some("Alice"));
        assert_eq!(profile.display_name.as_deref(), Some("A"));
        for bytes in [b" ".as_slice(), br#"{"fullName":42,"displayName":" "}"#] {
            assert_eq!(
                SpaceProfile::from_bytes(bytes).unwrap(),
                SpaceProfile::default()
            );
        }
    }

    #[test]
    fn invalid_profile_payload_is_a_content_error() {
        for bytes in [b"{".as_slice(), b"null", b"[]", &[0xff]] {
            assert!(
                SpaceProfile::from_bytes(bytes)
                    .unwrap_err()
                    .is_content_error()
            );
        }
    }
}
