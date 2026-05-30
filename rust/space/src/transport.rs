use serde::{Deserialize, Serialize};

fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EntityKeyPayload {
    pub encrypted_key: String,
    pub header: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityKeyResponse {
    #[serde(rename = "type")]
    pub key_type: String,
    pub encrypted_key: String,
    pub header: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEntityKeyRequest {
    #[serde(rename = "type")]
    pub key_type: String,
    pub encrypted_key: String,
    pub header: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusResponse {
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpaceRequest {
    pub space_slug: String,
    pub encrypted_space_key: String,
    pub encrypted_profile: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceKeyResponse {
    pub space_id: String,
    pub space_slug: String,
    pub encrypted_space_key: String,
    #[serde(default)]
    pub encrypted_profile: String,
    pub key_version: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresignUploadRequest {
    pub size: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub purpose: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub space_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresignUploadResponse {
    pub url: String,
    pub method: String,
    pub headers: std::collections::BTreeMap<String, String>,
    pub object_key: String,
    pub expires_in: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDownloadResponse {
    pub url: String,
    pub expires_in: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PostObjectPayload {
    pub object_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata_cipher: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePostRequest {
    pub space_id: String,
    pub encrypted_post_key: String,
    pub key_version: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption_cipher: Option<String>,
    pub objects: Vec<PostObjectPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePostResponse {
    pub post_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LikePostRequest {
    pub like: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LikePostResponse {
    pub liked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkFeedReadRequest {
    pub post_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkNotificationsReadRequest {
    pub friend_space_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceUnreadStatusResponse {
    pub feed_unread: bool,
    pub notifications_unread: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LikeMessageRequest {
    pub like: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LikeMessageResponse {
    pub liked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMessageRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
    pub message_cipher: String,
    pub sender_encrypted_message_key: String,
    pub recipient_encrypted_message_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_message_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageResponse {
    pub message_id: String,
    pub kind: String,
    pub sender: SpaceActorResponse,
    pub recipient: SpaceActorResponse,
    #[serde(default)]
    pub message_cipher: String,
    #[serde(default)]
    pub encrypted_message_key: String,
    #[serde(default)]
    pub reply_post_id: Option<i64>,
    #[serde(default)]
    pub reply_message_id: Option<String>,
    #[serde(default)]
    pub likes: i64,
    #[serde(default)]
    pub viewer_liked: bool,
    #[serde(default)]
    pub is_deleted: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePage {
    pub items: Vec<MessageResponse>,
    #[serde(default)]
    pub next_cursor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageConversationResponse {
    pub friend: SpaceActorResponse,
    pub latest_activity: MessageConversationActivity,
    #[serde(default)]
    pub unread: bool,
    #[serde(default)]
    pub notification_unread: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageConversationActivity {
    pub id: String,
    #[serde(rename = "type")]
    pub activity_type: String,
    pub created_at: String,
    #[serde(default)]
    pub outgoing: bool,
    #[serde(default)]
    pub message: Option<MessageResponse>,
    #[serde(default)]
    pub post: Option<MessageConversationPost>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageConversationPost {
    pub post_id: i64,
    pub space_id: String,
    pub space_slug: String,
    #[serde(default)]
    pub owner_user_id: i64,
    #[serde(default)]
    pub is_deleted: bool,
    #[serde(default)]
    pub objects: Vec<PostObjectPayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageConversationPage {
    pub items: Vec<MessageConversationResponse>,
    #[serde(default)]
    pub next_cursor: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePostCaptionRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption_cipher: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostResponse {
    pub post_id: i64,
    pub space_id: String,
    pub space_slug: String,
    #[serde(default)]
    pub owner_user_id: i64,
    pub author: SpaceActorResponse,
    pub encrypted_post_key: String,
    #[serde(default)]
    pub caption_cipher: String,
    pub key_version: i32,
    #[serde(default)]
    pub objects: Vec<PostObjectPayload>,
    pub created_at: String,
    pub likes: i64,
    pub viewer_liked: bool,
    #[serde(default)]
    pub viewer_unread: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostPage {
    pub items: Vec<PostResponse>,
    #[serde(default)]
    pub next_cursor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SpaceActorResponse {
    #[serde(default)]
    pub user_id: i64,
    #[serde(default)]
    pub space_id: String,
    pub space_slug: String,
    #[serde(default)]
    pub public_key: String,
    #[serde(default)]
    pub key_version: i32,
    #[serde(default)]
    pub encrypted_profile: String,
    #[serde(default)]
    pub avatar: Option<ProfileAvatarResponse>,
    #[serde(default)]
    pub friends: Option<i64>,
    #[serde(default)]
    pub posts: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAvatarPayload {
    pub object_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAvatarResponse {
    pub object_key: String,
    #[serde(default)]
    pub size: i64,
    #[serde(default)]
    pub updated_at: String,
}

pub type ProfileCoverPayload = ProfileAvatarPayload;
pub type ProfileCoverResponse = ProfileAvatarResponse;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSpaceProfileRequest {
    pub space_id: String,
    pub key_version: i32,
    pub encrypted_profile: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<ProfileAvatarPayload>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover: Option<ProfileCoverPayload>,
    #[serde(skip_serializing_if = "is_false")]
    pub remove_avatar: bool,
    #[serde(skip_serializing_if = "is_false")]
    pub remove_cover: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSpaceProfileResponse {
    pub status: String,
    #[serde(default)]
    pub avatar: Option<ProfileAvatarResponse>,
    #[serde(default)]
    pub cover: Option<ProfileCoverResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceProfileResponse {
    pub space_id: String,
    pub space_slug: String,
    pub version: i32,
    #[serde(default)]
    pub friends: i64,
    #[serde(default)]
    pub encrypted_profile: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub avatar: Option<ProfileAvatarResponse>,
    #[serde(default)]
    pub cover: Option<ProfileCoverResponse>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RotateSpaceKeyRequest {
    pub space_id: String,
    pub encrypted_space_key: String,
    pub key_version: i32,
    pub wrapped_prev_key: String,
    pub encrypted_profile: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceKeyVersionResponse {
    pub version: i32,
    #[serde(default)]
    pub wrapped_prev_key: String,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::{AssetDownloadResponse, MessageConversationActivity};

    #[test]
    fn asset_download_response_deserializes_camel_case() {
        let response: AssetDownloadResponse =
            serde_json::from_str(r#"{"url":"http://127.0.0.1:3900/example","expiresIn":900}"#)
                .expect("asset download response should deserialize");
        assert_eq!(response.url, "http://127.0.0.1:3900/example");
        assert_eq!(response.expires_in, 900);
    }

    #[test]
    fn message_conversation_activity_deserializes_outgoing() {
        let activity: MessageConversationActivity = serde_json::from_str(
            r#"{"id":"friend_event:1","type":"friend_add","createdAt":"2026-05-25T00:00:00Z","outgoing":true}"#,
        )
        .expect("activity should deserialize");
        assert!(activity.outgoing);
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddFriendPayload {
    pub target_space_id: String,
    pub link_session_token: String,
    pub requester_space_id: String,
    pub target_encrypted_space_key: String,
    pub target_key_version: i32,
    pub requester_encrypted_space_key: String,
    pub requester_key_version: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendStatusResponse {
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendRelationshipResponse {
    pub relationship: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendTargetPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_space_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceFriendResponse {
    pub friend: SpaceActorResponse,
    #[serde(default)]
    pub share_key_version: i32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareUpdatePayload {
    pub friend_id: i64,
    pub friend_space_id: String,
    pub encrypted_space_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshFriendSharesRequest {
    pub space_id: String,
    pub key_version: i32,
    pub shares: Vec<ShareUpdatePayload>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendShareResponse {
    pub friend: String,
    pub space_id: String,
    pub space_slug: String,
    pub encrypted_space_key: String,
    pub key_version: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostLikerResponse {
    pub actor: SpaceActorResponse,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPostLikersResponse {
    pub likers: Vec<PostLikerResponse>,
    #[serde(default)]
    pub next_cursor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceLinkStatusResponse {
    pub space_id: String,
    pub space_slug: String,
    pub key_version: i32,
    pub active: bool,
    pub encrypted_access_key: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceLinkCreateRequest {
    pub space_id: String,
    pub auth_key: String,
    pub key_version: i32,
    pub encrypted_space_key: String,
    pub encrypted_access_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceLinkLoginRequest {
    pub space_id: String,
    pub auth_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceLinkLoginResponse {
    pub session_token: String,
    pub space_id: String,
    pub space_slug: String,
    pub owner: String,
    #[serde(default)]
    pub public_key: String,
    pub key_version: i32,
    pub encrypted_space_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatedCountResponse {
    pub updated: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSpaceSlugRequest {
    pub space_slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceLookupResponse {
    pub space_id: String,
    pub space_slug: String,
    pub owner: String,
    #[serde(default)]
    pub public_key: String,
}
