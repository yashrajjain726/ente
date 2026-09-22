use std::collections::BTreeMap;

use ente_core::b64;
use ente_space::{AccountSpaceCtx, DecryptedMessage, MessagePayload, SpaceLinkCtx};
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen as swb;
use tsify::Tsify;
use wasm_bindgen::prelude::*;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Space(#[from] ente_space::Error),
    #[error(transparent)]
    Serde(#[from] swb::Error),
}

impl Error {
    fn name(&self) -> Option<&'static str> {
        match self {
            Self::Space(ente_space::Error::Http(ente_core::http::Error::Http {
                status: 404 | 410,
                ..
            })) => Some("content_unavailable"),
            Self::Space(ente_space::Error::Http(ente_core::http::Error::Http {
                status: 403,
                ..
            })) => Some("permission_denied"),
            Self::Space(error) if error.is_content_error() => Some("content_unavailable"),
            Self::Space(ente_space::Error::SpaceLimitReached) => Some("space_limit_reached"),
            Self::Space(ente_space::Error::SpaceSlugAlreadyExists) => {
                Some("space_slug_already_exists")
            }
            Self::Space(ente_space::Error::SpaceSlugReserved) => Some("space_slug_reserved"),
            Self::Space(ente_space::Error::InvalidSpaceSlug) => Some("invalid_space_slug"),
            Self::Space(ente_space::Error::PostLimitReached) => Some("post_limit_reached"),
            Self::Space(ente_space::Error::ProfileNotFound) => Some("profile_not_found"),
            Self::Space(ente_space::Error::SelfFriendship) => Some("self_friendship"),
            Self::Space(ente_space::Error::FriendRequestLimitReached) => {
                Some("friend_request_limit_reached")
            }
            Self::Space(ente_space::Error::SentFriendRequestLimitReached) => {
                Some("sent_friend_request_limit_reached")
            }
            Self::Space(ente_space::Error::FriendRequestUnavailable) => {
                Some("friend_request_unavailable")
            }
            Self::Space(ente_space::Error::SessionUnauthorized) => Some("session_unauthorized"),
            Self::Space(ente_space::Error::PermissionDenied) => Some("permission_denied"),
            _ => None,
        }
    }

    fn message(&self) -> String {
        ente_core::error::chain(self)
    }

    fn is_content_error(&self) -> bool {
        matches!(self, Self::Space(error) if error.is_content_error())
    }
}

impl From<Error> for JsValue {
    fn from(error: Error) -> Self {
        let js_error = js_sys::Error::new(&error.message());
        if let Some(name) = error.name() {
            js_error.set_name(name);
        }
        js_error.into()
    }
}

#[derive(Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct OpenAccountSpaceCtxInput {
    base_url: String,
    #[tsify(optional)]
    space_session_token: Option<String>,
    space_root_key_b64: String,
    #[serde(default)]
    #[tsify(optional)]
    owned_spaces: Option<Vec<SpaceKeyResponse>>,
    #[tsify(optional)]
    client_package: Option<String>,
    #[tsify(optional)]
    client_version: Option<String>,
}

#[derive(Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct OpenSpaceLinkCtxInput {
    base_url: String,
    space_username: String,
    access_key: String,
    #[tsify(optional)]
    client_package: Option<String>,
    #[tsify(optional)]
    client_version: Option<String>,
}

#[derive(Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct SpaceKeyResponse {
    space_id: String,
    space_slug: String,
    root_wrapped_space_key: String,
    #[serde(default)]
    public_key: String,
    #[serde(default)]
    encrypted_secret_key: String,
    #[serde(default)]
    encrypted_profile: String,
    key_version: i32,
}

impl From<SpaceKeyResponse> for ente_space::SpaceKeyResponse {
    fn from(value: SpaceKeyResponse) -> Self {
        Self {
            space_id: value.space_id,
            space_slug: value.space_slug,
            root_wrapped_space_key: value.root_wrapped_space_key,
            public_key: value.public_key,
            encrypted_secret_key: value.encrypted_secret_key,
            encrypted_profile: value.encrypted_profile,
            key_version: value.key_version,
        }
    }
}

impl From<ente_space::SpaceKeyResponse> for SpaceKeyResponse {
    fn from(value: ente_space::SpaceKeyResponse) -> Self {
        Self {
            space_id: value.space_id,
            space_slug: value.space_slug,
            root_wrapped_space_key: value.root_wrapped_space_key,
            public_key: value.public_key,
            encrypted_secret_key: value.encrypted_secret_key,
            encrypted_profile: value.encrypted_profile,
            key_version: value.key_version,
        }
    }
}

#[derive(Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct PostPhotoAssetOptions {
    #[tsify(optional)]
    width: Option<i32>,
    #[tsify(optional)]
    height: Option<i32>,
    #[tsify(optional)]
    media_type: Option<String>,
    #[tsify(optional)]
    thumb_hash: Option<String>,
}

#[derive(Deserialize, Tsify)]
pub struct PostPhotoInput {
    #[serde(with = "swb::preserve")]
    #[tsify(type = "Uint8Array")]
    bytes: js_sys::Uint8Array,
    options: PostPhotoAssetOptions,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct CreatedSpace {
    space_id: String,
    space_slug: String,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct DecryptedSpaceProfile {
    space_id: String,
    space_slug: String,
    version: i32,
    friends: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    posts: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    profile: Option<SpaceProfile>,
    avatar: Option<ProfileAvatarResponse>,
    cover: Option<ProfileAvatarResponse>,
    updated_at: Option<String>,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
struct ProfileAvatarResponse {
    #[serde(rename = "objectID")]
    object_id: String,
    key_version: i32,
    size: i64,
    updated_at: String,
}

impl From<ente_space::ProfileAvatarResponse> for ProfileAvatarResponse {
    fn from(value: ente_space::ProfileAvatarResponse) -> Self {
        Self {
            object_id: value.object_id,
            key_version: value.key_version,
            size: value.size,
            updated_at: value.updated_at,
        }
    }
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSpaceProfileResponse {
    status: String,
    avatar: Option<ProfileAvatarResponse>,
    cover: Option<ProfileAvatarResponse>,
}

impl From<ente_space::transport::UpdateSpaceProfileResponse> for UpdateSpaceProfileResponse {
    fn from(value: ente_space::transport::UpdateSpaceProfileResponse) -> Self {
        Self {
            status: value.status,
            avatar: value.avatar.map(Into::into),
            cover: value.cover.map(Into::into),
        }
    }
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
struct SpaceActorResponse {
    space_id: String,
    space_slug: String,
    public_key: String,
    key_version: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    profile: Option<SpaceProfile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    avatar: Option<ProfileAvatarResponse>,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct PostResponse {
    post_id: i64,
    space_id: String,
    space_slug: String,
    author: SpaceActorResponse,
    caption: Option<String>,
    photos: Vec<PostPhoto>,
    is_unavailable: bool,
    created_at: String,
    viewer_liked: bool,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct PostPage {
    items: Vec<PostResponse>,
    next_cursor: String,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct MessageResponse {
    message_id: String,
    kind: String,
    sender_space_id: String,
    recipient_space_id: String,
    text: String,
    reply_post_id: Option<i64>,
    reply_object_key: Option<String>,
    reply_message_id: Option<String>,
    liked: bool,
    viewer_liked: bool,
    is_deleted: bool,
    created_at: String,
    updated_at: String,
    is_unavailable: bool,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct MessagePage {
    items: Vec<MessageResponse>,
    next_cursor: String,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
struct MessageConversationActivity {
    id: String,
    #[serde(rename = "type")]
    activity_type: String,
    kind: String,
    created_at: String,
    outgoing: bool,
    message_id: Option<String>,
    text: Option<String>,
    post_id: Option<i64>,
    reply_object_key: Option<String>,
    post_space_id: Option<String>,
    is_unavailable: bool,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
struct PostPhoto {
    asset: PostAsset,
    #[serde(skip_serializing_if = "Option::is_none")]
    position: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    variant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    blur_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thumb_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    width: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    height: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    media_type: Option<String>,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
struct ConversationChatSummaryResponse {
    latest_activity: MessageConversationActivity,
    unread_activities: Vec<MessageConversationActivity>,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct ConversationsResponse {
    friends: Vec<SpaceFriendResponse>,
    pending_requests: Vec<SpaceFriendRequestResponse>,
    chat_summaries: BTreeMap<String, ConversationChatSummaryResponse>,
    latest_post_created_at: Option<String>,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct SpaceFriendResponse {
    friend: SpaceActorResponse,
    share_key_version: i32,
    created_at: String,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct SpaceFriendRequestResponse {
    request_id: i64,
    requester: SpaceActorResponse,
    created_at: String,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct SpaceSentFriendRequestResponse {
    request_id: i64,
    target: SpaceActorResponse,
    created_at: String,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct SpaceLookupResponse {
    space_id: String,
    space_slug: String,
    owner: String,
    public_key: String,
}

impl From<ente_space::SpaceLookupResponse> for SpaceLookupResponse {
    fn from(value: ente_space::SpaceLookupResponse) -> Self {
        Self {
            space_id: value.space_id,
            space_slug: value.space_slug,
            owner: value.owner,
            public_key: value.public_key,
        }
    }
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct FriendRelationshipResponse {
    relationship: String,
}

impl From<ente_space::FriendRelationshipResponse> for FriendRelationshipResponse {
    fn from(value: ente_space::FriendRelationshipResponse) -> Self {
        Self {
            relationship: value.relationship,
        }
    }
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct FriendStatusResponse {
    status: String,
}

impl From<ente_space::FriendStatusResponse> for FriendStatusResponse {
    fn from(value: ente_space::FriendStatusResponse) -> Self {
        Self {
            status: value.status,
        }
    }
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct SpaceUnreadStatusResponse {
    notifications_unread: bool,
}

impl From<ente_space::SpaceUnreadStatusResponse> for SpaceUnreadStatusResponse {
    fn from(value: ente_space::SpaceUnreadStatusResponse) -> Self {
        Self {
            notifications_unread: value.notifications_unread,
        }
    }
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct LikePostResponse {
    liked: bool,
}

impl From<ente_space::LikePostResponse> for LikePostResponse {
    fn from(value: ente_space::LikePostResponse) -> Self {
        Self { liked: value.liked }
    }
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct LikeMessageResponse {
    liked: bool,
}

impl From<ente_space::LikeMessageResponse> for LikeMessageResponse {
    fn from(value: ente_space::LikeMessageResponse) -> Self {
        Self { liked: value.liked }
    }
}

fn decode_b64_field(value: &str) -> Result<Vec<u8>, Error> {
    b64::decode(value)
        .map_err(ente_space::Error::from)
        .map_err(Into::into)
}

fn created_space_to_js(value: ente_space::CreatedSpace) -> CreatedSpace {
    CreatedSpace {
        space_id: value.space_id,
        space_slug: value.space_slug,
    }
}

fn profile_to_js(value: ente_space::DecryptedSpaceProfile) -> DecryptedSpaceProfile {
    DecryptedSpaceProfile {
        space_id: value.space_id,
        space_slug: value.space_slug,
        version: value.version,
        friends: value.friends,
        posts: None,
        profile: value.profile.map(Into::into),
        avatar: value.avatar.map(Into::into),
        cover: value.cover.map(Into::into),
        updated_at: value.updated_at,
    }
}

fn actor_to_js(
    actor: ente_space::SpaceActorResponse,
    profile: Option<ente_space::SpaceProfile>,
) -> SpaceActorResponse {
    SpaceActorResponse {
        space_id: actor.space_id,
        space_slug: actor.space_slug,
        public_key: actor.public_key,
        key_version: actor.key_version,
        profile: profile.map(Into::into),
        avatar: actor.avatar.map(Into::into),
    }
}

async fn account_actor_to_js(
    ctx: &AccountSpaceCtx,
    actor: ente_space::SpaceActorResponse,
) -> Result<SpaceActorResponse, Error> {
    match ctx.decrypt_actor_profile(&actor).await.map_err(Error::from) {
        Ok(profile) => Ok(actor_to_js(actor, profile)),
        Err(error) if error.is_content_error() => {
            log::warn!(
                "Space profile {} fell back to public fields: {}",
                actor.space_id,
                error.message()
            );
            Ok(public_actor_to_js(actor))
        }
        Err(error) => Err(error),
    }
}

fn public_actor_to_js(actor: ente_space::SpaceActorResponse) -> SpaceActorResponse {
    actor_to_js(actor, None)
}

fn post_to_js(post: ente_space::Post) -> PostResponse {
    let (caption, photos, is_unavailable) = match post.content {
        Ok(content) => (
            content.caption,
            content.photos.into_iter().map(Into::into).collect(),
            false,
        ),
        Err(error) => {
            log::warn!(
                "Space post {} is unavailable: {}",
                post.post_id,
                ente_core::error::chain(&error)
            );
            (None, Vec::new(), true)
        }
    };
    let profile = post.author.profile.unwrap_or_else(|error| {
        log::warn!(
            "Space profile {} fell back to public fields: {}",
            post.author.space_id,
            ente_core::error::chain(&error)
        );
        None
    });
    PostResponse {
        post_id: post.post_id,
        space_id: post.space_id,
        space_slug: post.space_slug,
        author: SpaceActorResponse {
            space_id: post.author.space_id,
            space_slug: post.author.space_slug,
            public_key: post.author.public_key,
            key_version: post.author.key_version,
            profile: profile.map(Into::into),
            avatar: post.author.avatar.map(Into::into),
        },
        caption,
        photos,
        is_unavailable,
        created_at: post.created_at,
        viewer_liked: post.viewer_liked,
    }
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
struct SpaceProfile {
    #[serde(skip_serializing_if = "Option::is_none")]
    full_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    display_name: Option<String>,
}

impl From<ente_space::SpaceProfile> for SpaceProfile {
    fn from(profile: ente_space::SpaceProfile) -> Self {
        Self {
            full_name: profile.full_name,
            display_name: profile.display_name,
        }
    }
}

#[derive(Serialize, Deserialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct PostAsset {
    space_id: String,
    post_id: i64,
    object_key: String,
    encrypted_post_key: String,
    key_version: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<i64>,
}

impl From<PostAsset> for ente_space::PostAsset {
    fn from(asset: PostAsset) -> Self {
        Self {
            space_id: asset.space_id,
            post_id: asset.post_id,
            object_key: asset.object_key,
            encrypted_post_key: asset.encrypted_post_key,
            key_version: asset.key_version,
            size: asset.size,
        }
    }
}

impl From<ente_space::PostPhoto> for PostPhoto {
    fn from(photo: ente_space::PostPhoto) -> Self {
        let metadata = photo.metadata.unwrap_or_default();
        Self {
            asset: PostAsset {
                space_id: photo.asset.space_id,
                post_id: photo.asset.post_id,
                object_key: photo.asset.object_key,
                encrypted_post_key: photo.asset.encrypted_post_key,
                key_version: photo.asset.key_version,
                size: photo.asset.size,
            },
            position: photo.position,
            variant: metadata.variant,
            blur_hash: metadata.blur_hash,
            thumb_hash: metadata.thumb_hash,
            width: metadata.width,
            height: metadata.height,
            media_type: metadata.media_type,
        }
    }
}

fn post_page_to_js(page: ente_space::PostPage) -> PostPage {
    PostPage {
        items: page.items.into_iter().map(post_to_js).collect(),
        next_cursor: page.next_cursor,
    }
}

fn account_message_to_js(
    mut message: ente_space::MessageResponse,
    decrypted: DecryptedMessage,
) -> Result<MessageResponse, Error> {
    message.kind = decrypted.payload.kind;
    let mut response = message_to_js(message, decrypted.payload.text);
    response.reply_object_key = decrypted.payload.reply_object_key;
    Ok(response)
}

fn message_to_js(message: ente_space::MessageResponse, text: String) -> MessageResponse {
    MessageResponse {
        message_id: message.message_id,
        kind: message.kind,
        sender_space_id: message.sender_space_id,
        recipient_space_id: message.recipient_space_id,
        text,
        reply_post_id: message.reply_post_id,
        reply_object_key: None,
        reply_message_id: message.reply_message_id,
        liked: message.liked,
        viewer_liked: message.viewer_liked,
        is_deleted: message.is_deleted,
        created_at: message.created_at,
        updated_at: message.updated_at,
        is_unavailable: false,
    }
}

fn unavailable_message_to_js(message: ente_space::MessageResponse) -> MessageResponse {
    MessageResponse {
        message_id: message.message_id,
        kind: message.kind,
        sender_space_id: message.sender_space_id,
        recipient_space_id: message.recipient_space_id,
        text: String::new(),
        reply_post_id: message.reply_post_id,
        reply_object_key: None,
        reply_message_id: message.reply_message_id,
        liked: message.liked,
        viewer_liked: message.viewer_liked,
        is_deleted: message.is_deleted,
        created_at: message.created_at,
        updated_at: message.updated_at,
        is_unavailable: true,
    }
}

async fn account_message_response_to_js(
    ctx: &AccountSpaceCtx,
    viewer_space_id: &str,
    message: ente_space::MessageResponse,
) -> Result<MessageResponse, Error> {
    if message.is_deleted {
        return Ok(message_to_js(message, String::new()));
    }
    if message.kind != "post_like" && message.kind != "friend_added" {
        let decrypted = ctx.decrypt_message(viewer_space_id, &message).await?;
        return account_message_to_js(message, decrypted);
    }

    let text = message.text.clone();
    Ok(message_to_js(message, text))
}

async fn resilient_account_message_response_to_js(
    ctx: &AccountSpaceCtx,
    viewer_space_id: &str,
    message: ente_space::MessageResponse,
) -> Result<MessageResponse, Error> {
    let fallback = message.clone();
    match account_message_response_to_js(ctx, viewer_space_id, message).await {
        Ok(message) => Ok(message),
        Err(error) if error.is_content_error() => {
            log::warn!(
                "Space message {} is unavailable: {}",
                fallback.message_id,
                error.message()
            );
            Ok(unavailable_message_to_js(fallback))
        }
        Err(error) => Err(error),
    }
}

async fn message_conversation_activity_payload(
    ctx: &AccountSpaceCtx,
    viewer_space_id: &str,
    activity: &ente_space::MessageConversationActivity,
) -> Result<Option<MessagePayload>, Error> {
    if activity.message_cipher.trim().is_empty()
        || activity.encrypted_message_key.trim().is_empty()
        || activity.message_id.is_none()
    {
        return Ok(None);
    }

    let message = ente_space::MessageResponse {
        message_id: activity.message_id.clone().unwrap_or_default(),
        kind: if activity.kind.trim().is_empty() {
            "regular".to_owned()
        } else {
            activity.kind.clone()
        },
        sender_space_id: activity.sender_space_id.clone(),
        recipient_space_id: activity.recipient_space_id.clone(),
        message_cipher: activity.message_cipher.clone(),
        encrypted_message_key: activity.encrypted_message_key.clone(),
        text: String::new(),
        reply_post_id: activity.post_id,
        reply_message_id: activity.reply_message_id.clone(),
        liked: false,
        viewer_liked: false,
        is_deleted: false,
        created_at: activity.created_at.clone(),
        updated_at: activity.created_at.clone(),
    };
    let decrypted = ctx.decrypt_message(viewer_space_id, &message).await?;
    Ok(Some(decrypted.payload))
}

async fn message_conversation_activity_to_js(
    ctx: &AccountSpaceCtx,
    viewer_space_id: &str,
    activity: ente_space::MessageConversationActivity,
) -> Result<MessageConversationActivity, Error> {
    let payload = message_conversation_activity_payload(ctx, viewer_space_id, &activity).await?;
    let kind = payload
        .as_ref()
        .map(|payload| payload.kind.clone())
        .unwrap_or_else(|| activity.kind.clone());
    let reply_object_key = payload
        .as_ref()
        .and_then(|payload| payload.reply_object_key.clone());
    let text = payload.map(|payload| payload.text);
    Ok(MessageConversationActivity {
        id: activity.id,
        activity_type: activity.activity_type,
        kind,
        created_at: activity.created_at,
        outgoing: activity.outgoing,
        message_id: activity.message_id,
        text,
        post_id: activity.post_id,
        reply_object_key,
        post_space_id: activity.post_space_id,
        is_unavailable: false,
    })
}

fn unavailable_message_conversation_activity_to_js(
    activity: ente_space::MessageConversationActivity,
) -> MessageConversationActivity {
    MessageConversationActivity {
        id: activity.id,
        activity_type: activity.activity_type,
        kind: activity.kind,
        created_at: activity.created_at,
        outgoing: activity.outgoing,
        message_id: activity.message_id,
        text: None,
        post_id: activity.post_id,
        reply_object_key: None,
        post_space_id: activity.post_space_id,
        is_unavailable: true,
    }
}

async fn resilient_message_conversation_activity_to_js(
    ctx: &AccountSpaceCtx,
    viewer_space_id: &str,
    activity: ente_space::MessageConversationActivity,
) -> Result<MessageConversationActivity, Error> {
    let fallback = activity.clone();
    match message_conversation_activity_to_js(ctx, viewer_space_id, activity).await {
        Ok(activity) => Ok(activity),
        Err(error) if error.is_content_error() => {
            log::warn!(
                "Space conversation activity {} is unavailable: {}",
                fallback.id,
                error.message()
            );
            Ok(unavailable_message_conversation_activity_to_js(fallback))
        }
        Err(error) => Err(error),
    }
}

#[wasm_bindgen(js_name = spaceOpenAccountCtx)]
pub fn space_open_account_ctx(
    input: <OpenAccountSpaceCtxInput as Tsify>::JsType,
) -> Result<SpaceAccountCtxHandle, Error> {
    let input = OpenAccountSpaceCtxInput::from_js(input)?;
    let space_root_key = decode_b64_field(&input.space_root_key_b64)?;
    let ctx = AccountSpaceCtx::open(ente_space::OpenAccountSpaceCtxInput {
        base_url: input.base_url,
        space_session_token: input.space_session_token,
        space_root_key,
        initial_owned_spaces: input
            .owned_spaces
            .map(|spaces| spaces.into_iter().map(Into::into).collect()),
        user_agent: None,
        client_package: input.client_package,
        client_version: input.client_version,
    })?;
    Ok(SpaceAccountCtxHandle { inner: ctx })
}

#[wasm_bindgen(js_name = spaceOpenLinkCtx)]
pub async fn space_open_link_ctx(
    input: <OpenSpaceLinkCtxInput as Tsify>::JsType,
) -> Result<SpaceLinkCtxHandle, Error> {
    let input = OpenSpaceLinkCtxInput::from_js(input)?;
    let inner = SpaceLinkCtx::open(ente_space::OpenSpaceLinkCtxInput {
        base_url: input.base_url,
        space_slug: input.space_username,
        access_key: input.access_key,
        user_agent: None,
        client_package: input.client_package,
        client_version: input.client_version,
    })
    .await?;
    Ok(SpaceLinkCtxHandle { inner })
}

#[wasm_bindgen]
pub struct SpaceLinkCtxHandle {
    inner: SpaceLinkCtx,
}

#[wasm_bindgen]
impl SpaceLinkCtxHandle {
    #[wasm_bindgen(js_name = getProfile)]
    pub fn get_profile(&self) -> Result<<DecryptedSpaceProfile as Tsify>::JsType, Error> {
        let mut profile = profile_to_js(self.inner.profile().clone());
        profile.posts = Some(self.inner.posts());
        profile.into_js().map_err(Into::into)
    }

    #[wasm_bindgen(js_name = listPosts)]
    pub async fn list_posts(&self) -> Result<<PostPage as Tsify>::JsType, Error> {
        let page = self.inner.list_posts().await?;
        post_page_to_js(page).into_js().map_err(Into::into)
    }

    #[wasm_bindgen(js_name = subscribeWebPush)]
    pub async fn subscribe_web_push(
        &self,
        endpoint: String,
        p256dh: String,
        auth: String,
    ) -> Result<String, Error> {
        self.inner
            .subscribe_web_push(endpoint, p256dh, auth)
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = unsubscribeWebPush)]
    pub async fn unsubscribe_web_push(&self, endpoint: String) -> Result<(), Error> {
        self.inner
            .unsubscribe_web_push(endpoint)
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = downloadPostAsset)]
    pub async fn download_post_asset(
        &self,
        asset: <PostAsset as Tsify>::JsType,
    ) -> Result<Vec<u8>, Error> {
        let asset = PostAsset::from_js(asset)?;
        self.inner
            .download_post_asset(&asset.into())
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = downloadAvatar)]
    pub async fn download_avatar(
        &self,
        object_id: String,
        key_version: i32,
    ) -> Result<Vec<u8>, Error> {
        self.inner
            .download_profile_asset("avatar", &object_id, key_version)
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = downloadCover)]
    pub async fn download_cover(
        &self,
        object_id: String,
        key_version: i32,
    ) -> Result<Vec<u8>, Error> {
        self.inner
            .download_profile_asset("cover", &object_id, key_version)
            .await
            .map_err(Into::into)
    }
}

#[wasm_bindgen]
pub struct SpaceAccountCtxHandle {
    inner: AccountSpaceCtx,
}

#[wasm_bindgen]
impl SpaceAccountCtxHandle {
    #[wasm_bindgen(js_name = createSpace)]
    pub async fn create_space(
        &self,
        space_slug: String,
        profile: String,
        referred_by_space_id: Option<String>,
    ) -> Result<<CreatedSpace as Tsify>::JsType, Error> {
        created_space_to_js(
            self.inner
                .create_space_with_referrer(
                    &space_slug,
                    profile.as_bytes(),
                    referred_by_space_id.as_deref(),
                )
                .await?,
        )
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = listOwnedSpaces)]
    pub async fn list_owned_spaces(
        &self,
    ) -> Result<Vec<<SpaceKeyResponse as Tsify>::JsType>, Error> {
        self.inner
            .list_owned_spaces()
            .await?
            .into_iter()
            .map(|space| SpaceKeyResponse::from(space).into_js().map_err(Into::into))
            .collect()
    }

    #[wasm_bindgen(js_name = getSpaceProfile)]
    pub async fn get_space_profile(
        &self,
        space_id: String,
        viewer_space_id: Option<String>,
    ) -> Result<<DecryptedSpaceProfile as Tsify>::JsType, Error> {
        profile_to_js(
            self.inner
                .get_space_profile_for_display(&space_id, viewer_space_id.as_deref(), None)
                .await?,
        )
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = updateSpaceProfile)]
    pub async fn update_space_profile(
        &self,
        space_id: String,
        profile: String,
    ) -> Result<<UpdateSpaceProfileResponse as Tsify>::JsType, Error> {
        UpdateSpaceProfileResponse::from(
            self.inner
                .update_space_profile(&space_id, profile.as_bytes(), None, false)
                .await?,
        )
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = updateSpaceProfileWithAvatar)]
    pub async fn update_space_profile_with_avatar(
        &self,
        space_id: String,
        profile: String,
        avatar_bytes: Vec<u8>,
    ) -> Result<<UpdateSpaceProfileResponse as Tsify>::JsType, Error> {
        let space_key = self
            .inner
            .resolve_owned_space_key(&space_id)
            .await?
            .ok_or_else(|| {
                ente_space::Error::InvalidInput(format!(
                    "space {space_id} is not owned by the account"
                ))
            })?;
        let avatar = self
            .inner
            .upload_avatar(&space_id, &space_key, &avatar_bytes)
            .await?;
        UpdateSpaceProfileResponse::from(
            self.inner
                .update_space_profile(&space_id, profile.as_bytes(), Some(avatar), false)
                .await?,
        )
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = updateSpaceProfileWithCover)]
    pub async fn update_space_profile_with_cover(
        &self,
        space_id: String,
        profile: String,
        cover_bytes: Vec<u8>,
    ) -> Result<<UpdateSpaceProfileResponse as Tsify>::JsType, Error> {
        let space_key = self
            .inner
            .resolve_owned_space_key(&space_id)
            .await?
            .ok_or_else(|| {
                ente_space::Error::InvalidInput(format!(
                    "space {space_id} is not owned by the account"
                ))
            })?;
        let cover = self
            .inner
            .upload_cover(&space_id, &space_key, &cover_bytes)
            .await?;
        UpdateSpaceProfileResponse::from(
            self.inner
                .update_space_profile_assets(
                    &space_id,
                    profile.as_bytes(),
                    None,
                    Some(cover),
                    false,
                    false,
                )
                .await?,
        )
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = updateSpaceSlug)]
    pub async fn update_space_slug(
        &self,
        space_id: String,
        space_slug: String,
    ) -> Result<<SpaceLookupResponse as Tsify>::JsType, Error> {
        SpaceLookupResponse::from(self.inner.update_space_slug(&space_id, &space_slug).await?)
            .into_js()
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = getRelationship)]
    pub async fn get_relationship(
        &self,
        space_id: String,
        target_space_id: String,
    ) -> Result<<FriendRelationshipResponse as Tsify>::JsType, Error> {
        FriendRelationshipResponse::from(
            self.inner
                .get_relationship(&space_id, &target_space_id)
                .await?,
        )
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = requestFriendByUsername)]
    pub async fn request_friend_by_username(
        &self,
        space_id: String,
        space_username: String,
    ) -> Result<<FriendStatusResponse as Tsify>::JsType, Error> {
        FriendStatusResponse::from(
            self.inner
                .request_friend_by_username(&space_id, &space_username)
                .await?,
        )
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = listFeed)]
    pub async fn list_feed(
        &self,
        space_id: String,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<<PostPage as Tsify>::JsType, Error> {
        let page = self.inner.list_feed(&space_id, cursor, limit).await?;
        post_page_to_js(page).into_js().map_err(Into::into)
    }

    #[wasm_bindgen(js_name = unreadStatus)]
    pub async fn unread_status(
        &self,
        space_id: String,
    ) -> Result<<SpaceUnreadStatusResponse as Tsify>::JsType, Error> {
        SpaceUnreadStatusResponse::from(self.inner.unread_status(&space_id).await?)
            .into_js()
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = markNotificationsRead)]
    pub async fn mark_notifications_read(
        &self,
        space_id: String,
        friend_space_id: String,
    ) -> Result<<SpaceUnreadStatusResponse as Tsify>::JsType, Error> {
        SpaceUnreadStatusResponse::from(
            self.inner
                .mark_notifications_read(space_id, friend_space_id)
                .await?,
        )
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = listPosts)]
    pub async fn list_posts(
        &self,
        space_id: String,
        viewer_space_id: Option<String>,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<<PostPage as Tsify>::JsType, Error> {
        post_page_to_js(
            self.inner
                .list_posts(&space_id, viewer_space_id.as_deref(), cursor, limit)
                .await?,
        )
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = getPost)]
    pub async fn get_post(
        &self,
        space_id: String,
        post_id: i64,
        viewer_space_id: Option<String>,
    ) -> Result<<PostResponse as Tsify>::JsType, Error> {
        let post = self
            .inner
            .get_post(&space_id, post_id, viewer_space_id.as_deref())
            .await?;
        post_to_js(post).into_js().map_err(Into::into)
    }

    #[wasm_bindgen(js_name = createPhotoPost)]
    pub async fn create_photo_post(
        &self,
        space_id: String,
        photos: Vec<<PostPhotoInput as Tsify>::JsType>,
        caption: Option<String>,
    ) -> Result<<PostResponse as Tsify>::JsType, Error> {
        if photos.is_empty() || photos.len() > 10 {
            return Err(
                ente_space::Error::InvalidInput("Choose between 1 and 10 photos".into()).into(),
            );
        }
        let photos = photos
            .into_iter()
            .map(PostPhotoInput::from_js)
            .collect::<Result<Vec<_>, _>>()?;
        let post_key = self.inner.generate_post_key();
        let mut objects = Vec::with_capacity(photos.len());
        for (position, photo) in photos.into_iter().enumerate() {
            let mut object = self
                .inner
                .upload_post_photo_asset(
                    &space_id,
                    &post_key,
                    &photo.bytes.to_vec(),
                    ente_space::PostPhotoAssetOptions {
                        width: photo.options.width,
                        height: photo.options.height,
                        media_type: photo.options.media_type,
                        thumb_hash: photo.options.thumb_hash,
                    },
                )
                .await?;
            object.position = Some(position as i32);
            objects.push(object);
        }
        let (post_id, _) = self
            .inner
            .create_post(
                &space_id,
                &objects,
                caption.as_ref().map(String::as_bytes),
                Some(&post_key),
            )
            .await?;
        let post = self
            .inner
            .get_post(&space_id, post_id, Some(&space_id))
            .await?;
        post_to_js(post).into_js().map_err(Into::into)
    }

    #[wasm_bindgen(js_name = downloadPostAsset)]
    pub async fn download_post_asset(
        &self,
        asset: <PostAsset as Tsify>::JsType,
        viewer_space_id: Option<String>,
    ) -> Result<Vec<u8>, Error> {
        let asset = PostAsset::from_js(asset)?;
        self.inner
            .download_post_asset(&asset.into(), viewer_space_id.as_deref())
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = downloadSpaceAvatar)]
    pub async fn download_space_avatar(
        &self,
        space_id: String,
        viewer_space_id: Option<String>,
        object_id: String,
        key_version: i32,
    ) -> Result<Vec<u8>, Error> {
        self.inner
            .download_profile_asset(
                &space_id,
                viewer_space_id.as_deref(),
                "avatar",
                &object_id,
                key_version,
            )
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = downloadSpaceCover)]
    pub async fn download_space_cover(
        &self,
        space_id: String,
        viewer_space_id: Option<String>,
        object_id: String,
        key_version: i32,
    ) -> Result<Vec<u8>, Error> {
        self.inner
            .download_profile_asset(
                &space_id,
                viewer_space_id.as_deref(),
                "cover",
                &object_id,
                key_version,
            )
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = likePost)]
    pub async fn like_post(
        &self,
        space_id: String,
        post_id: i64,
        like: bool,
    ) -> Result<<LikePostResponse as Tsify>::JsType, Error> {
        LikePostResponse::from(self.inner.like_post(&space_id, post_id, like).await?)
            .into_js()
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = sendMessage)]
    pub async fn send_message(
        &self,
        sender_space_id: String,
        space_id: String,
        text: String,
    ) -> Result<<MessageResponse as Tsify>::JsType, Error> {
        let message = self
            .inner
            .send_message(&sender_space_id, &space_id, &text)
            .await?;
        let decrypted = self
            .inner
            .decrypt_message(&sender_space_id, &message)
            .await?;
        account_message_to_js(message, decrypted)?
            .into_js()
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = sendPoke)]
    pub async fn send_poke(
        &self,
        sender_space_id: String,
        space_id: String,
    ) -> Result<<MessageResponse as Tsify>::JsType, Error> {
        let message = self.inner.send_poke(&sender_space_id, &space_id).await?;
        let decrypted = self
            .inner
            .decrypt_message(&sender_space_id, &message)
            .await?;
        account_message_to_js(message, decrypted)?
            .into_js()
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = replyToMessage)]
    pub async fn reply_to_message(
        &self,
        sender_space_id: String,
        space_id: String,
        message_id: String,
        text: String,
    ) -> Result<<MessageResponse as Tsify>::JsType, Error> {
        let message = self
            .inner
            .reply_to_message(&sender_space_id, &space_id, &message_id, &text)
            .await?;
        let decrypted = self
            .inner
            .decrypt_message(&sender_space_id, &message)
            .await?;
        account_message_to_js(message, decrypted)?
            .into_js()
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = replyToPost)]
    pub async fn reply_to_post(
        &self,
        sender_space_id: String,
        post_space_id: String,
        post_id: i64,
        text: String,
        object_key: Option<String>,
    ) -> Result<<MessageResponse as Tsify>::JsType, Error> {
        let message = self
            .inner
            .reply_to_post(
                &sender_space_id,
                &post_space_id,
                post_id,
                &text,
                object_key.as_deref(),
            )
            .await?;
        let decrypted = self
            .inner
            .decrypt_message(&sender_space_id, &message)
            .await?;
        account_message_to_js(message, decrypted)?
            .into_js()
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = likeMessage)]
    pub async fn like_message(
        &self,
        space_id: String,
        message_id: String,
        like: bool,
    ) -> Result<<LikeMessageResponse as Tsify>::JsType, Error> {
        LikeMessageResponse::from(
            self.inner
                .like_message(&space_id, &message_id, like)
                .await?,
        )
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = deleteMessage)]
    pub async fn delete_message(&self, space_id: String, message_id: String) -> Result<(), Error> {
        self.inner
            .delete_message(&space_id, &message_id)
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = listConversations)]
    pub async fn list_conversations(
        &self,
        space_id: String,
    ) -> Result<<ConversationsResponse as Tsify>::JsType, Error> {
        let response = self.inner.list_conversations(&space_id).await?;
        let mut friends = Vec::with_capacity(response.friends.len());
        for friend in response.friends {
            friends.push(SpaceFriendResponse {
                friend: account_actor_to_js(&self.inner, friend.friend).await?,
                share_key_version: friend.share_key_version,
                created_at: friend.created_at,
            });
        }

        let mut pending_requests = Vec::with_capacity(response.pending_requests.len());
        for request in response.pending_requests {
            pending_requests.push(SpaceFriendRequestResponse {
                request_id: request.request_id,
                requester: public_actor_to_js(request.requester),
                created_at: request.created_at,
            });
        }

        let mut chat_summaries = BTreeMap::new();
        for (friend_space_id, summary) in response.chat_summaries {
            let mut unread_activities = Vec::with_capacity(summary.unread_activities.len());
            for activity in summary.unread_activities {
                unread_activities.push(
                    resilient_message_conversation_activity_to_js(&self.inner, &space_id, activity)
                        .await?,
                );
            }
            chat_summaries.insert(
                friend_space_id,
                ConversationChatSummaryResponse {
                    latest_activity: resilient_message_conversation_activity_to_js(
                        &self.inner,
                        &space_id,
                        summary.latest_activity,
                    )
                    .await?,
                    unread_activities,
                },
            );
        }

        ConversationsResponse {
            friends,
            pending_requests,
            chat_summaries,
            latest_post_created_at: response.latest_post_created_at,
        }
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = listMessageThread)]
    pub async fn list_message_thread(
        &self,
        viewer_space_id: String,
        space_id: String,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<<MessagePage as Tsify>::JsType, Error> {
        let page = self
            .inner
            .list_message_thread(&viewer_space_id, &space_id, cursor, limit)
            .await?;
        let mut items = Vec::with_capacity(page.items.len());
        for message in page.items {
            items.push(
                resilient_account_message_response_to_js(&self.inner, &viewer_space_id, message)
                    .await?,
            );
        }
        MessagePage {
            items,
            next_cursor: page.next_cursor,
        }
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = updatePostCaption)]
    pub async fn update_post_caption(
        &self,
        space_id: String,
        post_id: i64,
        caption: Option<String>,
    ) -> Result<(), Error> {
        self.inner
            .update_post_caption(&space_id, post_id, caption.as_ref().map(String::as_bytes))
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = deletePost)]
    pub async fn delete_post(&self, space_id: String, post_id: i64) -> Result<(), Error> {
        self.inner
            .delete_post(&space_id, post_id)
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = listSpaceFriends)]
    pub async fn list_space_friends(
        &self,
        space_id: String,
    ) -> Result<Vec<<SpaceFriendResponse as Tsify>::JsType>, Error> {
        let friends = self.inner.list_space_friends(&space_id).await?;
        let mut items = Vec::with_capacity(friends.len());
        for friend in friends {
            items.push(
                SpaceFriendResponse {
                    friend: account_actor_to_js(&self.inner, friend.friend).await?,
                    share_key_version: friend.share_key_version,
                    created_at: friend.created_at,
                }
                .into_js()?,
            );
        }
        Ok(items)
    }

    #[wasm_bindgen(js_name = listFriendRequests)]
    pub async fn list_friend_requests(
        &self,
        space_id: String,
    ) -> Result<Vec<<SpaceFriendRequestResponse as Tsify>::JsType>, Error> {
        let requests = self.inner.list_friend_requests(&space_id).await?;
        let mut items = Vec::with_capacity(requests.len());
        for request in requests {
            items.push(
                SpaceFriendRequestResponse {
                    request_id: request.request_id,
                    requester: public_actor_to_js(request.requester),
                    created_at: request.created_at,
                }
                .into_js()?,
            );
        }
        Ok(items)
    }

    #[wasm_bindgen(js_name = listSentFriendRequests)]
    pub async fn list_sent_friend_requests(
        &self,
        space_id: String,
    ) -> Result<Vec<<SpaceSentFriendRequestResponse as Tsify>::JsType>, Error> {
        let requests = self.inner.list_sent_friend_requests(&space_id).await?;
        let mut items = Vec::with_capacity(requests.len());
        for request in requests {
            items.push(
                SpaceSentFriendRequestResponse {
                    request_id: request.request_id,
                    target: public_actor_to_js(request.target),
                    created_at: request.created_at,
                }
                .into_js()?,
            );
        }
        Ok(items)
    }

    #[wasm_bindgen(js_name = confirmFriendRequest)]
    pub async fn confirm_friend_request(
        &self,
        space_id: String,
        request_id: i64,
    ) -> Result<<FriendStatusResponse as Tsify>::JsType, Error> {
        FriendStatusResponse::from(
            self.inner
                .confirm_friend_request(&space_id, request_id)
                .await?,
        )
        .into_js()
        .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = deleteFriendRequest)]
    pub async fn delete_friend_request(
        &self,
        space_id: String,
        request_id: i64,
    ) -> Result<(), Error> {
        self.inner
            .delete_friend_request(&space_id, request_id)
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = removeFriendBySpace)]
    pub async fn remove_friend_by_space(
        &self,
        actor_space_id: String,
        space_id: String,
    ) -> Result<(), Error> {
        self.inner
            .unfriend_by_space(&actor_space_id, &space_id)
            .await
            .map_err(Into::into)
    }
}

#[cfg(test)]
mod tests {
    use ente_core::crypto::{Key, SecretKey, sealed, secretbox};

    use super::*;

    fn message(
        message_id: &str,
        encrypted_message_key: &str,
        message_cipher: &str,
    ) -> ente_space::MessageResponse {
        ente_space::MessageResponse {
            message_id: message_id.into(),
            kind: "regular".into(),
            sender_space_id: "space-2".into(),
            recipient_space_id: "space-1".into(),
            message_cipher: message_cipher.into(),
            encrypted_message_key: encrypted_message_key.into(),
            text: String::new(),
            reply_post_id: None,
            reply_message_id: None,
            liked: false,
            viewer_liked: false,
            is_deleted: false,
            created_at: "2026-08-01T00:00:00Z".into(),
            updated_at: "2026-08-01T00:00:00Z".into(),
        }
    }

    fn message_context() -> (AccountSpaceCtx, Key, String) {
        let root_key = Key::generate();
        let secret_key = SecretKey::generate();
        let public_key = secret_key.public_key();
        let encrypted_secret_key = secretbox::encrypt_combined(secret_key.as_bytes(), &root_key);
        let ctx = AccountSpaceCtx::open(ente_space::OpenAccountSpaceCtxInput {
            base_url: "http://localhost".into(),
            space_session_token: None,
            space_root_key: root_key.as_bytes().to_vec(),
            initial_owned_spaces: Some(vec![ente_space::SpaceKeyResponse {
                space_id: "space-1".into(),
                space_slug: "alice".into(),
                root_wrapped_space_key: String::new(),
                public_key: b64::encode(public_key.as_bytes()),
                encrypted_secret_key: b64::encode(&encrypted_secret_key),
                encrypted_profile: String::new(),
                key_version: 1,
            }]),
            user_agent: None,
            client_package: None,
            client_version: None,
        })
        .unwrap();
        let message_key = Key::generate();
        let sealed_message_key = sealed::seal(message_key.as_bytes(), &public_key).unwrap();
        let encrypted_message_key = b64::encode(&sealed_message_key);
        (ctx, message_key, encrypted_message_key)
    }

    #[tokio::test]
    async fn encrypted_message_kinds_preserve_server_events_and_allow_pokes() {
        let (ctx, message_key, encrypted_message_key) = message_context();

        for reply_object_key in [None, Some("first"), Some("second")] {
            for (server_kind, payload_kind, expected_kind) in [
                ("regular", "regular", "regular"),
                ("regular", "poke", "poke"),
                ("regular", "post_like", "regular"),
                ("regular", "post_reply", "regular"),
                ("regular", "friend_added", "regular"),
                ("regular", "unknown", "regular"),
                ("post_reply", "post_reply", "post_reply"),
                ("post_reply", "regular", "post_reply"),
                ("post_reply", "poke", "post_reply"),
                ("post_reply", "post_like", "post_reply"),
                ("post_reply", "friend_added", "post_reply"),
            ] {
                let photo_field = reply_object_key
                    .map(|key| format!(r#","replyObjectKey":"{key}""#))
                    .unwrap_or_default();
                let plaintext = format!(
                    r#"{{"version":1,"kind":"{payload_kind}","text":"hello"{photo_field}}}"#
                );
                let cipher = b64::encode(&secretbox::encrypt_combined(
                    plaintext.as_bytes(),
                    &message_key,
                ));
                let mut response = message("message-1", &encrypted_message_key, &cipher);
                response.kind = server_kind.into();
                response.reply_post_id = (server_kind == "post_reply").then_some(42);
                let activity = ente_space::MessageConversationActivity {
                    id: "activity-1".into(),
                    activity_type: if server_kind == "post_reply" {
                        "post_reply".into()
                    } else {
                        "message".into()
                    },
                    kind: response.kind.clone(),
                    created_at: response.created_at.clone(),
                    outgoing: false,
                    message_id: Some(response.message_id.clone()),
                    sender_space_id: response.sender_space_id.clone(),
                    recipient_space_id: response.recipient_space_id.clone(),
                    message_cipher: response.message_cipher.clone(),
                    encrypted_message_key: response.encrypted_message_key.clone(),
                    reply_message_id: None,
                    post_id: response.reply_post_id,
                    post_space_id: response.reply_post_id.map(|_| "space-1".into()),
                };
                let converted = resilient_account_message_response_to_js(&ctx, "space-1", response)
                    .await
                    .unwrap_or_else(|error| panic!("{error}"));
                let converted_activity = resilient_message_conversation_activity_to_js(
                    &ctx,
                    "space-1",
                    activity.clone(),
                )
                .await
                .unwrap_or_else(|error| panic!("{error}"));

                assert_eq!(
                    converted.kind, expected_kind,
                    "message: server={server_kind}, payload={payload_kind}"
                );
                assert_eq!(
                    converted_activity.kind, expected_kind,
                    "activity: server={server_kind}, payload={payload_kind}"
                );
                assert_eq!(converted.reply_object_key.as_deref(), reply_object_key);
                assert_eq!(
                    converted_activity.reply_object_key.as_deref(),
                    reply_object_key
                );
                assert_eq!(converted.text, "hello");
                assert_eq!(converted.reply_post_id, activity.post_id);
                assert!(!converted.is_unavailable);
                assert_eq!(converted_activity.text.as_deref(), Some("hello"));
                assert_eq!(converted_activity.activity_type, activity.activity_type);
                assert_eq!(converted_activity.post_id, activity.post_id);
                assert!(!converted_activity.is_unavailable);
            }
        }
    }

    #[tokio::test]
    async fn corrupt_message_and_activity_become_unavailable() {
        let (ctx, message_key, encrypted_message_key) = message_context();
        let valid_cipher = b64::encode(&secretbox::encrypt_combined(
            br#"{"version":1,"kind":"regular","text":"hello"}"#,
            &message_key,
        ));
        let corrupt_cipher = b64::encode(&secretbox::encrypt_combined(b"not-json", &message_key));

        let first = resilient_account_message_response_to_js(
            &ctx,
            "space-1",
            message("message-1", &encrypted_message_key, &valid_cipher),
        )
        .await
        .unwrap_or_else(|error| panic!("{error}"));
        let corrupt = resilient_account_message_response_to_js(
            &ctx,
            "space-1",
            message("message-2", &encrypted_message_key, &corrupt_cipher),
        )
        .await
        .unwrap_or_else(|error| panic!("{error}"));
        let last = resilient_account_message_response_to_js(
            &ctx,
            "space-1",
            message("message-3", &encrypted_message_key, &valid_cipher),
        )
        .await
        .unwrap_or_else(|error| panic!("{error}"));

        assert!(!first.is_unavailable);
        assert!(corrupt.is_unavailable);
        assert!(!last.is_unavailable);

        let activity = ente_space::MessageConversationActivity {
            id: "activity-1".into(),
            activity_type: "message".into(),
            kind: "regular".into(),
            created_at: "2026-08-01T00:00:00Z".into(),
            outgoing: false,
            message_id: Some("message-2".into()),
            sender_space_id: "space-2".into(),
            recipient_space_id: "space-1".into(),
            message_cipher: corrupt_cipher,
            encrypted_message_key,
            reply_message_id: None,
            post_id: None,
            post_space_id: None,
        };
        let activity = resilient_message_conversation_activity_to_js(&ctx, "space-1", activity)
            .await
            .unwrap_or_else(|error| panic!("{error}"));

        assert!(activity.is_unavailable);
    }

    #[test]
    fn http_errors_are_not_content_errors() {
        let error = Error::from(ente_space::Error::Http(ente_core::http::Error::Http {
            status: 500,
            path: "/space".into(),
        }));

        assert!(!error.is_content_error());
    }
}
