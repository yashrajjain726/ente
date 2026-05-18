use serde::{Deserialize, Serialize};

use crate::transport::{PostObjectPayload, ProfileAvatarResponse, WallActorResponse};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthKeyAttributes {
    pub kek_salt: String,
    pub encrypted_key: String,
    pub key_decryption_nonce: String,
    pub public_key: String,
    pub encrypted_secret_key: String,
    pub secret_key_decryption_nonce: String,
    pub mem_limit: u32,
    pub ops_limit: u32,
}

#[derive(Debug, Clone)]
pub enum PrivateKeySource {
    Plain(Vec<u8>),
    EncryptedKeyAttributes(AuthKeyAttributes),
}

#[derive(Debug, Clone)]
pub struct OpenAccountWallCtxInput {
    pub base_url: String,
    pub auth_token: String,
    pub master_key: Vec<u8>,
    pub public_key: Vec<u8>,
    pub private_key_source: PrivateKeySource,
    pub user_id: Option<i64>,
    pub user_agent: Option<String>,
    pub client_package: Option<String>,
    pub client_version: Option<String>,
}

#[derive(Debug, Clone)]
pub struct OpenWallLinkCtxInput {
    pub base_url: String,
    pub wall_username: String,
    pub access_key: String,
    pub user_agent: Option<String>,
    pub client_package: Option<String>,
    pub client_version: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CreatedWall {
    pub wall_id: String,
    pub wall_slug: String,
    pub key_version: i32,
    pub wall_key: Vec<u8>,
    pub encrypted_wall_key: String,
    pub encrypted_profile: String,
}

#[derive(Debug, Clone)]
pub struct CreatedWallLink {
    pub access_key: String,
    pub wall_username: String,
    pub wall_id: String,
    pub wall_slug: String,
    pub key_version: i32,
}

#[derive(Debug, Clone)]
pub struct DecryptedWallProfile {
    pub wall_id: String,
    pub wall_slug: String,
    pub version: i32,
    pub friends: i64,
    pub profile: Vec<u8>,
    pub avatar: Option<ProfileAvatarResponse>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DecryptedPost {
    pub post_key: Vec<u8>,
    pub caption_plaintext: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MessageQuote {
    pub post_id: i64,
    pub wall_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub object_key: Option<String>,
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
    pub quote: Option<MessageQuote>,
}

#[derive(Debug, Clone)]
pub struct DecryptedMessage {
    pub message_key: Vec<u8>,
    pub payload: MessagePayload,
}

#[derive(Debug, Clone)]
pub struct DecryptedFriendShare {
    pub friend: String,
    pub wall_id: String,
    pub wall_slug: String,
    pub wall_key: Vec<u8>,
    pub key_version: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FeedItem {
    pub post_id: i64,
    pub wall_id: String,
    pub wall_slug: String,
    pub owner_user_id: i64,
    pub author: WallActorResponse,
    pub encrypted_post_key: String,
    #[serde(default)]
    pub caption_cipher: String,
    pub key_version: i32,
    #[serde(default)]
    pub objects: Vec<PostObjectPayload>,
    pub created_at: String,
    pub likes: i64,
    pub viewer_liked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FeedPage {
    pub items: Vec<FeedItem>,
    #[serde(default)]
    pub next_cursor: String,
}

#[derive(Debug, Clone)]
pub struct HydratedKeys {
    pub owned: Vec<(String, Vec<u8>)>,
    pub friends: Vec<DecryptedFriendShare>,
}
