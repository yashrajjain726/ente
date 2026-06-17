//! WASM bindings for space flows.

use ente_core::http::Error as HttpError;
use ente_space::{
    AccountSpaceCtx, CreatedSpace, CreatedSpaceLink, DecryptedMessage, DecryptedPost,
    DecryptedSpaceProfile, MessageConversationActivity, MessageConversationPost, MessageResponse,
    OpenAccountSpaceCtxInput, OpenSpaceLinkCtxInput, PostResponse, ProfileAvatarResponse,
    ProfileCoverResponse, SpaceActorResponse, SpaceError as CoreSpaceError, SpaceLinkCtx,
    crypto::{decode_b64, encode_b64},
};
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen as swb;
use wasm_bindgen::prelude::*;

/// Space client error.
#[wasm_bindgen]
pub struct WasmSpaceError {
    code: String,
    message: String,
    status: Option<u16>,
}

#[wasm_bindgen]
impl WasmSpaceError {
    /// Machine-readable error code.
    #[wasm_bindgen(getter)]
    pub fn code(&self) -> String {
        self.code.clone()
    }

    /// Human-readable error message.
    #[wasm_bindgen(getter)]
    pub fn message(&self) -> String {
        self.message.clone()
    }

    /// HTTP status code when the error came from an HTTP response.
    #[wasm_bindgen(getter)]
    pub fn status(&self) -> Option<u16> {
        self.status
    }
}

impl From<CoreSpaceError> for WasmSpaceError {
    fn from(e: CoreSpaceError) -> Self {
        let (code, status) = match &e {
            CoreSpaceError::Http(HttpError::Http { status, .. }) => ("http", Some(*status)),
            CoreSpaceError::Http(HttpError::InvalidUrl(_)) => ("invalid_url", None),
            CoreSpaceError::Http(HttpError::Network(_)) => ("network", None),
            CoreSpaceError::Http(HttpError::Parse(_)) => ("parse", None),
            CoreSpaceError::Crypto(_) => ("crypto", None),
            CoreSpaceError::Auth(_) => ("auth", None),
            CoreSpaceError::Base64(_) => ("base64", None),
            CoreSpaceError::InvalidInput(_) => ("invalid_input", None),
            CoreSpaceError::MissingPrivateKey => ("missing_private_key", None),
            CoreSpaceError::MissingEncryptedSpaceKey => ("missing_encrypted_space_key", None),
            CoreSpaceError::EntityKeyConflict => ("entity_key_conflict", None),
        };
        Self {
            code: code.to_owned(),
            message: e.to_string(),
            status,
        }
    }
}

impl From<swb::Error> for WasmSpaceError {
    fn from(e: swb::Error) -> Self {
        Self {
            code: "serde".to_owned(),
            message: e.to_string(),
            status: None,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenAccountSpaceCtxJsInput {
    base_url: String,
    space_session_token: Option<String>,
    space_root_key_b64: String,
    user_id: Option<i64>,
    user_agent: Option<String>,
    client_package: Option<String>,
    client_version: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenSpaceLinkCtxJsInput {
    base_url: String,
    space_username: String,
    access_key: String,
    user_agent: Option<String>,
    client_package: Option<String>,
    client_version: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatedSpaceJs {
    space_id: String,
    space_slug: String,
    key_version: i32,
    space_key_b64: String,
    encrypted_space_key: String,
    encrypted_profile: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatedSpaceLinkJs {
    access_key: String,
    space_username: String,
    space_id: String,
    space_slug: String,
    key_version: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpaceProfileJs {
    space_id: String,
    space_slug: String,
    version: i32,
    friends: i64,
    profile: String,
    avatar: Option<ProfileAvatarResponse>,
    cover: Option<ProfileCoverResponse>,
    updated_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActorJs {
    user_id: i64,
    space_id: String,
    space_slug: String,
    public_key: String,
    key_version: i32,
    profile: Option<String>,
    avatar: Option<ProfileAvatarResponse>,
    friends: Option<i64>,
    posts: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PostJs {
    post_id: i64,
    space_id: String,
    space_slug: String,
    owner_user_id: i64,
    author: ActorJs,
    caption: Option<String>,
    encrypted_post_key: String,
    key_version: i32,
    objects: Vec<PostObjectJs>,
    created_at: String,
    likes: i64,
    viewer_liked: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PostPageJs {
    items: Vec<PostJs>,
    next_cursor: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PostLikerJs {
    actor: ActorJs,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PostLikerPageJs {
    likers: Vec<PostLikerJs>,
    next_cursor: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageQuoteJs {
    post_id: i64,
    space_id: String,
    encrypted_post_key: Option<String>,
    key_version: Option<i32>,
    caption: Option<String>,
    object_key: Option<String>,
    width: Option<i32>,
    height: Option<i32>,
    media_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageJs {
    message_id: String,
    kind: String,
    sender: ActorJs,
    recipient: ActorJs,
    text: String,
    quote: Option<MessageQuoteJs>,
    reply_post_id: Option<i64>,
    reply_message_id: Option<String>,
    likes: i64,
    viewer_liked: bool,
    is_deleted: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MessagePageJs {
    items: Vec<MessageJs>,
    next_cursor: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageConversationJs {
    friend: ActorJs,
    latest_activity: MessageConversationActivityJs,
    unread: bool,
    unread_count: i64,
    notification_unread: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageConversationActivityJs {
    id: String,
    #[serde(rename = "type")]
    activity_type: String,
    created_at: String,
    outgoing: bool,
    message: Option<MessageJs>,
    post: Option<MessageConversationPostJs>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageConversationPostJs {
    post_id: i64,
    space_id: String,
    space_slug: String,
    owner_user_id: i64,
    is_deleted: bool,
    objects: Vec<PostObjectJs>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PostObjectJs {
    object_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    position: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    variant: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    blur_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    width: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    height: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    media_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageConversationPageJs {
    items: Vec<MessageConversationJs>,
    next_cursor: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FriendJs {
    friend: ActorJs,
    share_key_version: i32,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FriendRequestJs {
    request_id: i64,
    requester: ActorJs,
    created_at: String,
}

fn decode_b64_field(value: &str) -> Result<Vec<u8>, WasmSpaceError> {
    decode_b64(value).map_err(Into::into)
}

fn utf8_field(bytes: Vec<u8>, field: &str) -> Result<String, WasmSpaceError> {
    String::from_utf8(bytes)
        .map_err(|err| CoreSpaceError::InvalidInput(format!("invalid {field} utf8: {err}")).into())
}

fn optional_utf8_field(
    bytes: Option<Vec<u8>>,
    field: &str,
) -> Result<Option<String>, WasmSpaceError> {
    bytes.map(|value| utf8_field(value, field)).transpose()
}

fn created_space_to_js(value: CreatedSpace) -> CreatedSpaceJs {
    CreatedSpaceJs {
        space_id: value.space_id,
        space_slug: value.space_slug,
        key_version: value.key_version,
        space_key_b64: encode_b64(&value.space_key),
        encrypted_space_key: value.encrypted_space_key,
        encrypted_profile: value.encrypted_profile,
    }
}

fn created_link_to_js(value: CreatedSpaceLink) -> CreatedSpaceLinkJs {
    CreatedSpaceLinkJs {
        access_key: value.access_key,
        space_username: value.space_username,
        space_id: value.space_id,
        space_slug: value.space_slug,
        key_version: value.key_version,
    }
}

fn profile_to_js(value: DecryptedSpaceProfile) -> Result<SpaceProfileJs, WasmSpaceError> {
    Ok(SpaceProfileJs {
        space_id: value.space_id,
        space_slug: value.space_slug,
        version: value.version,
        friends: value.friends,
        profile: utf8_field(value.profile, "profile")?,
        avatar: value.avatar,
        cover: value.cover,
        updated_at: value.updated_at,
    })
}

fn actor_to_js(
    actor: SpaceActorResponse,
    profile: Option<Vec<u8>>,
) -> Result<ActorJs, WasmSpaceError> {
    Ok(ActorJs {
        user_id: actor.user_id,
        space_id: actor.space_id,
        space_slug: actor.space_slug,
        public_key: actor.public_key,
        key_version: actor.key_version,
        profile: optional_utf8_field(profile, "actor profile")?,
        avatar: actor.avatar,
        friends: actor.friends,
        posts: actor.posts,
    })
}

async fn account_actor_to_js(
    ctx: &AccountSpaceCtx,
    actor: SpaceActorResponse,
) -> Result<ActorJs, WasmSpaceError> {
    let profile = ctx.decrypt_actor_profile(&actor).await?;
    actor_to_js(actor, profile)
}

async fn link_actor_to_js(
    ctx: &SpaceLinkCtx,
    actor: SpaceActorResponse,
) -> Result<ActorJs, WasmSpaceError> {
    let profile = ctx.decrypt_actor_profile(&actor).await?;
    actor_to_js(actor, profile)
}

fn public_actor_to_js(actor: SpaceActorResponse) -> Result<ActorJs, WasmSpaceError> {
    actor_to_js(actor, None)
}

fn post_object_to_js(
    post_key: Option<&[u8]>,
    object: ente_space::PostObjectPayload,
) -> Result<PostObjectJs, WasmSpaceError> {
    let metadata = match post_key {
        Some(post_key) => ente_space::client::decrypt_post_object_metadata(post_key, &object)?,
        None => None,
    };
    Ok(PostObjectJs {
        object_key: object.object_key,
        size: object.size,
        position: object.position,
        variant: metadata.as_ref().and_then(|value| value.variant.clone()),
        blur_hash: metadata.as_ref().and_then(|value| value.blur_hash.clone()),
        width: metadata.as_ref().and_then(|value| value.width),
        height: metadata.as_ref().and_then(|value| value.height),
        media_type: metadata.and_then(|value| value.media_type),
    })
}

fn post_objects_to_js(
    post_key: Option<&[u8]>,
    objects: Vec<ente_space::PostObjectPayload>,
) -> Result<Vec<PostObjectJs>, WasmSpaceError> {
    objects
        .into_iter()
        .map(|object| post_object_to_js(post_key, object))
        .collect()
}

async fn account_post_to_js(
    ctx: &AccountSpaceCtx,
    post: PostResponse,
    decrypted: DecryptedPost,
) -> Result<PostJs, WasmSpaceError> {
    let author = account_actor_to_js(ctx, post.author).await?;
    Ok(PostJs {
        post_id: post.post_id,
        space_id: post.space_id,
        space_slug: post.space_slug,
        owner_user_id: post.owner_user_id,
        author,
        caption: optional_utf8_field(decrypted.caption_plaintext, "caption")?,
        encrypted_post_key: post.encrypted_post_key,
        key_version: post.key_version,
        objects: post_objects_to_js(Some(&decrypted.post_key), post.objects)?,
        created_at: post.created_at,
        likes: post.likes,
        viewer_liked: post.viewer_liked,
    })
}

async fn link_post_to_js(
    ctx: &SpaceLinkCtx,
    post: PostResponse,
    decrypted: DecryptedPost,
) -> Result<PostJs, WasmSpaceError> {
    let author = link_actor_to_js(ctx, post.author).await?;
    Ok(PostJs {
        post_id: post.post_id,
        space_id: post.space_id,
        space_slug: post.space_slug,
        owner_user_id: post.owner_user_id,
        author,
        caption: optional_utf8_field(decrypted.caption_plaintext, "caption")?,
        encrypted_post_key: post.encrypted_post_key,
        key_version: post.key_version,
        objects: post_objects_to_js(Some(&decrypted.post_key), post.objects)?,
        created_at: post.created_at,
        likes: post.likes,
        viewer_liked: post.viewer_liked,
    })
}

async fn account_post_page_to_js(
    ctx: &AccountSpaceCtx,
    page: ente_space::PostPage,
) -> Result<PostPageJs, WasmSpaceError> {
    let mut items = Vec::with_capacity(page.items.len());
    for post in page.items {
        let decrypted = ctx.decrypt_post_for_space(&post.space_id, &post).await?;
        items.push(account_post_to_js(ctx, post, decrypted).await?);
    }
    Ok(PostPageJs {
        items,
        next_cursor: page.next_cursor,
    })
}

async fn link_post_page_to_js(
    ctx: &SpaceLinkCtx,
    page: ente_space::PostPage,
) -> Result<PostPageJs, WasmSpaceError> {
    let mut items = Vec::with_capacity(page.items.len());
    for post in page.items {
        let decrypted = ctx.decrypt_post(&post).await?;
        items.push(link_post_to_js(ctx, post, decrypted).await?);
    }
    Ok(PostPageJs {
        items,
        next_cursor: page.next_cursor,
    })
}

async fn account_message_to_js(
    ctx: &AccountSpaceCtx,
    message: MessageResponse,
    decrypted: DecryptedMessage,
) -> Result<MessageJs, WasmSpaceError> {
    let sender = account_actor_to_js(ctx, message.sender).await?;
    let recipient = account_actor_to_js(ctx, message.recipient).await?;
    let quote = decrypted.payload.quote.map(|quote| MessageQuoteJs {
        post_id: quote.post_id,
        space_id: quote.space_id,
        encrypted_post_key: quote.encrypted_post_key,
        key_version: quote.key_version,
        caption: quote.caption,
        object_key: quote.object_key,
        width: quote.width,
        height: quote.height,
        media_type: quote.media_type,
    });
    Ok(MessageJs {
        message_id: message.message_id,
        kind: message.kind,
        sender,
        recipient,
        text: decrypted.payload.text,
        quote,
        reply_post_id: message.reply_post_id,
        reply_message_id: message.reply_message_id,
        likes: message.likes,
        viewer_liked: message.viewer_liked,
        is_deleted: message.is_deleted,
        created_at: message.created_at,
        updated_at: message.updated_at,
    })
}

async fn message_response_quote_to_js(
    ctx: &AccountSpaceCtx,
    quote: ente_space::transport::MessageQuoteResponse,
) -> Result<MessageQuoteJs, WasmSpaceError> {
    let caption = if !quote.caption_cipher.trim().is_empty()
        && !quote.encrypted_post_key.trim().is_empty()
        && quote.key_version > 0
    {
        optional_utf8_field(
            ctx.decrypt_post_caption_fields(
                &quote.space_id,
                quote.post_id,
                &quote.encrypted_post_key,
                quote.key_version,
                &quote.caption_cipher,
            )
            .await
            .ok()
            .flatten(),
            "caption",
        )?
    } else {
        None
    };

    Ok(MessageQuoteJs {
        post_id: quote.post_id,
        space_id: quote.space_id,
        encrypted_post_key: (!quote.encrypted_post_key.trim().is_empty())
            .then_some(quote.encrypted_post_key),
        key_version: (quote.key_version > 0).then_some(quote.key_version),
        caption,
        object_key: (!quote.object_key.trim().is_empty()).then_some(quote.object_key),
        width: None,
        height: None,
        media_type: None,
    })
}

async fn account_message_response_to_js(
    ctx: &AccountSpaceCtx,
    message: MessageResponse,
) -> Result<MessageJs, WasmSpaceError> {
    if message.kind != "post_like" {
        let decrypted = ctx.decrypt_message(&message).await?;
        return account_message_to_js(ctx, message, decrypted).await;
    }

    let sender = account_actor_to_js(ctx, message.sender).await?;
    let recipient = account_actor_to_js(ctx, message.recipient).await?;
    let quote = match message.quote {
        Some(quote) => Some(message_response_quote_to_js(ctx, quote).await?),
        None => None,
    };
    Ok(MessageJs {
        message_id: message.message_id,
        kind: message.kind,
        sender,
        recipient,
        text: message.text,
        quote,
        reply_post_id: message.reply_post_id,
        reply_message_id: message.reply_message_id,
        likes: message.likes,
        viewer_liked: message.viewer_liked,
        is_deleted: message.is_deleted,
        created_at: message.created_at,
        updated_at: message.updated_at,
    })
}

async fn message_conversation_activity_to_js(
    ctx: &AccountSpaceCtx,
    activity: MessageConversationActivity,
) -> Result<MessageConversationActivityJs, WasmSpaceError> {
    let message = match activity.message {
        Some(message) => Some(account_message_response_to_js(ctx, message).await?),
        None => None,
    };
    Ok(MessageConversationActivityJs {
        id: activity.id,
        activity_type: activity.activity_type,
        created_at: activity.created_at,
        outgoing: activity.outgoing,
        message,
        post: activity
            .post
            .map(message_conversation_post_to_js)
            .transpose()?,
    })
}

fn message_conversation_post_to_js(
    post: MessageConversationPost,
) -> Result<MessageConversationPostJs, WasmSpaceError> {
    Ok(MessageConversationPostJs {
        post_id: post.post_id,
        space_id: post.space_id,
        space_slug: post.space_slug,
        owner_user_id: post.owner_user_id,
        is_deleted: post.is_deleted,
        objects: post_objects_to_js(None, post.objects)?,
    })
}

/// Open an authenticated space context for web.
#[wasm_bindgen]
pub async fn space_open_account_ctx(
    input: JsValue,
) -> Result<SpaceAccountCtxHandle, WasmSpaceError> {
    let input: OpenAccountSpaceCtxJsInput = swb::from_value(input)?;
    let space_root_key = decode_b64_field(&input.space_root_key_b64)?;
    let ctx = AccountSpaceCtx::open(OpenAccountSpaceCtxInput {
        base_url: input.base_url.clone(),
        space_session_token: input.space_session_token,
        space_root_key,
        user_id: input.user_id,
        user_agent: input.user_agent.clone(),
        client_package: input.client_package.clone(),
        client_version: input.client_version.clone(),
    })?;
    Ok(SpaceAccountCtxHandle {
        inner: ctx,
        base_url: input.base_url,
        user_agent: input.user_agent,
        client_package: input.client_package,
        client_version: input.client_version,
    })
}

/// Open a public space link context for web.
#[wasm_bindgen]
pub async fn space_open_link_ctx(input: JsValue) -> Result<SpaceLinkCtxHandle, WasmSpaceError> {
    let input: OpenSpaceLinkCtxJsInput = swb::from_value(input)?;
    let ctx = SpaceLinkCtx::open(OpenSpaceLinkCtxInput {
        base_url: input.base_url,
        space_username: input.space_username,
        access_key: input.access_key,
        user_agent: input.user_agent,
        client_package: input.client_package,
        client_version: input.client_version,
    })
    .await?;
    Ok(SpaceLinkCtxHandle { inner: ctx })
}

/// Handle to an authenticated space context.
#[wasm_bindgen]
pub struct SpaceAccountCtxHandle {
    inner: AccountSpaceCtx,
    base_url: String,
    user_agent: Option<String>,
    client_package: Option<String>,
    client_version: Option<String>,
}

#[wasm_bindgen]
impl SpaceAccountCtxHandle {
    /// Create a space with an encrypted JSON profile payload.
    pub async fn create_space(
        &self,
        space_slug: String,
        profile: String,
    ) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&created_space_to_js(
            self.inner
                .create_space(&space_slug, profile.as_bytes())
                .await?,
        ))
        .map_err(Into::into)
    }

    /// List spaces owned by the current account.
    pub async fn list_owned_spaces(&self) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&self.inner.list_owned_spaces().await?).map_err(Into::into)
    }

    /// Fetch and decrypt a space profile.
    pub async fn get_space_profile(&self, space_id: String) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&profile_to_js(
            self.inner
                .get_space_profile_decrypted(&space_id, None)
                .await?,
        )?)
        .map_err(Into::into)
    }

    /// Update a space's encrypted JSON profile payload.
    pub async fn update_space_profile(
        &self,
        space_id: String,
        profile: String,
    ) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(
            &self
                .inner
                .update_space_profile(&space_id, profile.as_bytes(), None, false)
                .await?,
        )
        .map_err(Into::into)
    }

    /// Update a space profile and replace its encrypted avatar asset.
    pub async fn update_space_profile_with_avatar(
        &self,
        space_id: String,
        profile: String,
        avatar_bytes: Vec<u8>,
    ) -> Result<JsValue, WasmSpaceError> {
        let space_key = self
            .inner
            .resolve_owned_space_key(&space_id)
            .await?
            .ok_or_else(|| {
                CoreSpaceError::InvalidInput(format!(
                    "space {space_id} is not owned by the account"
                ))
            })?;
        let avatar = self
            .inner
            .upload_avatar(&space_id, &space_key, &avatar_bytes)
            .await?;
        swb::to_value(
            &self
                .inner
                .update_space_profile(&space_id, profile.as_bytes(), Some(avatar), false)
                .await?,
        )
        .map_err(Into::into)
    }

    /// Update a space profile and replace its encrypted cover asset.
    pub async fn update_space_profile_with_cover(
        &self,
        space_id: String,
        profile: String,
        cover_bytes: Vec<u8>,
    ) -> Result<JsValue, WasmSpaceError> {
        let space_key = self
            .inner
            .resolve_owned_space_key(&space_id)
            .await?
            .ok_or_else(|| {
                CoreSpaceError::InvalidInput(format!(
                    "space {space_id} is not owned by the account"
                ))
            })?;
        let cover = self
            .inner
            .upload_cover(&space_id, &space_key, &cover_bytes)
            .await?;
        swb::to_value(
            &self
                .inner
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
        .map_err(Into::into)
    }

    /// Update a space's slug.
    pub async fn update_space_slug(
        &self,
        space_id: String,
        space_slug: String,
    ) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&self.inner.update_space_slug(&space_id, &space_slug).await?)
            .map_err(Into::into)
    }

    /// Lookup public space metadata by slug.
    pub async fn lookup_space_by_slug(
        &self,
        space_slug: String,
    ) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&self.inner.lookup_space_by_slug(&space_slug).await?).map_err(Into::into)
    }

    /// Return whether the target space is self, friend, or neither.
    pub async fn get_relationship(
        &self,
        target_space_id: String,
    ) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&self.inner.get_relationship(&target_space_id).await?).map_err(Into::into)
    }

    /// Create a shareable space link.
    pub async fn create_space_link(&self, space_id: String) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&created_link_to_js(
            self.inner.create_space_link(&space_id).await?,
        ))
        .map_err(Into::into)
    }

    /// Rotate a shareable space link to a fresh secret.
    pub async fn rotate_space_link(&self, space_id: String) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&created_link_to_js(
            self.inner.rotate_space_link(&space_id).await?,
        ))
        .map_err(Into::into)
    }

    /// Fetch space link status.
    pub async fn get_space_link_status(&self, space_id: String) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&self.inner.get_space_link_status(&space_id).await?).map_err(Into::into)
    }

    /// Delete a space link.
    pub async fn delete_space_link(&self, space_id: String) -> Result<(), WasmSpaceError> {
        self.inner
            .delete_space_link(&space_id)
            .await
            .map_err(Into::into)
    }

    /// Join a space link as a friend.
    pub async fn join_space_link(
        &self,
        space_username: String,
        access_key: String,
    ) -> Result<JsValue, WasmSpaceError> {
        let link = SpaceLinkCtx::open(OpenSpaceLinkCtxInput {
            base_url: self.base_url.clone(),
            space_username,
            access_key,
            user_agent: self.user_agent.clone(),
            client_package: self.client_package.clone(),
            client_version: self.client_version.clone(),
        })
        .await?;
        swb::to_value(&self.inner.add_friend_from_link(&link).await?).map_err(Into::into)
    }

    /// Request to add a public username as a friend.
    pub async fn request_friend_by_username(
        &self,
        space_username: String,
    ) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(
            &self
                .inner
                .request_friend_by_username(&space_username)
                .await?,
        )
        .map_err(Into::into)
    }

    /// List the current account feed with captions decrypted.
    pub async fn list_feed(
        &self,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmSpaceError> {
        let page = self.inner.list_feed(cursor, limit).await?;
        swb::to_value(
            &account_post_page_to_js(
                &self.inner,
                ente_space::PostPage {
                    items: page
                        .items
                        .into_iter()
                        .map(|item| PostResponse {
                            post_id: item.post_id,
                            space_id: item.space_id,
                            space_slug: item.space_slug.clone(),
                            owner_user_id: item.owner_user_id,
                            author: item.author,
                            encrypted_post_key: item.encrypted_post_key,
                            caption_cipher: item.caption_cipher,
                            key_version: item.key_version,
                            objects: item.objects,
                            created_at: item.created_at,
                            likes: item.likes,
                            viewer_liked: item.viewer_liked,
                        })
                        .collect(),
                    next_cursor: page.next_cursor,
                },
            )
            .await?,
        )
        .map_err(Into::into)
    }

    /// Return whether the current account has unread notification activity.
    pub async fn unread_status(&self) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&self.inner.unread_status().await?).map_err(Into::into)
    }

    /// Mark notification activity for one friend as read.
    pub async fn mark_notifications_read(
        &self,
        friend_space_id: String,
    ) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&self.inner.mark_notifications_read(friend_space_id).await?)
            .map_err(Into::into)
    }

    /// List posts on a space with captions decrypted.
    pub async fn list_posts(
        &self,
        space_id: String,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(
            &account_post_page_to_js(
                &self.inner,
                self.inner.list_posts(&space_id, cursor, limit).await?,
            )
            .await?,
        )
        .map_err(Into::into)
    }

    /// Fetch one post with its caption decrypted.
    pub async fn get_post(&self, post_id: i64) -> Result<JsValue, WasmSpaceError> {
        let post = self.inner.get_post(post_id).await?;
        let decrypted = self
            .inner
            .decrypt_post_for_space(&post.space_id, &post)
            .await?;
        swb::to_value(&account_post_to_js(&self.inner, post, decrypted).await?).map_err(Into::into)
    }

    /// Create a single-photo post with optional caption.
    pub async fn create_photo_post(
        &self,
        space_id: String,
        photo_bytes: Vec<u8>,
        caption: Option<String>,
        width: Option<i32>,
        height: Option<i32>,
        media_type: Option<String>,
    ) -> Result<JsValue, WasmSpaceError> {
        let post_key = self.inner.generate_post_key();
        let object = self
            .inner
            .upload_post_photo_asset(
                &space_id,
                &post_key,
                &photo_bytes,
                width,
                height,
                media_type,
            )
            .await?;
        let (post_id, _) = self
            .inner
            .create_post(
                &space_id,
                &[object],
                caption.as_ref().map(|value| value.as_bytes()),
                Some(&post_key),
            )
            .await?;
        let post = self.inner.get_post(post_id).await?;
        let decrypted = self
            .inner
            .decrypt_post_for_space(&post.space_id, &post)
            .await?;
        swb::to_value(&account_post_to_js(&self.inner, post, decrypted).await?).map_err(Into::into)
    }

    /// Download and decrypt one object from a space post.
    pub async fn download_post_asset(
        &self,
        post_id: i64,
        object_key: String,
    ) -> Result<Vec<u8>, WasmSpaceError> {
        self.inner
            .download_post_asset(post_id, &object_key)
            .await
            .map_err(Into::into)
    }

    /// Download and decrypt one object from an already fetched space post.
    pub async fn download_post_asset_with_key(
        &self,
        space_id: String,
        post_id: i64,
        encrypted_post_key: String,
        key_version: i32,
        object_key: String,
    ) -> Result<Vec<u8>, WasmSpaceError> {
        self.inner
            .download_post_asset_with_key(
                &space_id,
                post_id,
                &encrypted_post_key,
                key_version,
                &object_key,
            )
            .await
            .map_err(Into::into)
    }

    /// Download and decrypt a space avatar using an owned or friend space key.
    pub async fn download_space_avatar(
        &self,
        space_id: String,
        object_key: String,
    ) -> Result<Vec<u8>, WasmSpaceError> {
        let space_key = self
            .inner
            .resolve_space_key(&space_id)
            .await?
            .ok_or_else(|| {
                CoreSpaceError::InvalidInput(format!("no space key available for {space_id}"))
            })?;
        self.inner
            .download_decrypted_asset(&space_id, &object_key, &space_key)
            .await
            .map_err(Into::into)
    }

    /// Download and decrypt a space cover using an owned or friend space key.
    pub async fn download_space_cover(
        &self,
        space_id: String,
        object_key: String,
    ) -> Result<Vec<u8>, WasmSpaceError> {
        let space_key = self
            .inner
            .resolve_space_key(&space_id)
            .await?
            .ok_or_else(|| {
                CoreSpaceError::InvalidInput(format!("no space key available for {space_id}"))
            })?;
        self.inner
            .download_decrypted_asset(&space_id, &object_key, &space_key)
            .await
            .map_err(Into::into)
    }

    /// Like or unlike a post.
    pub async fn like_post(&self, post_id: i64, like: bool) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&self.inner.like_post(post_id, like).await?).map_err(Into::into)
    }

    /// List people who liked a post.
    pub async fn list_post_likers(
        &self,
        post_id: i64,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmSpaceError> {
        let page = self.inner.list_post_likers(post_id, cursor, limit).await?;
        let mut likers = Vec::with_capacity(page.likers.len());
        for liker in page.likers {
            likers.push(PostLikerJs {
                actor: account_actor_to_js(&self.inner, liker.actor).await?,
                created_at: liker.created_at,
            });
        }
        swb::to_value(&PostLikerPageJs {
            likers,
            next_cursor: page.next_cursor,
        })
        .map_err(Into::into)
    }

    /// Send a regular 1:1 message to a friend space.
    pub async fn send_message(
        &self,
        space_id: String,
        text: String,
    ) -> Result<JsValue, WasmSpaceError> {
        let message = self.inner.send_message(&space_id, &text).await?;
        let decrypted = self.inner.decrypt_message(&message).await?;
        swb::to_value(&account_message_to_js(&self.inner, message, decrypted).await?)
            .map_err(Into::into)
    }

    /// Send a 1:1 reply to an existing message.
    pub async fn reply_to_message(
        &self,
        space_id: String,
        message_id: String,
        text: String,
    ) -> Result<JsValue, WasmSpaceError> {
        let message = self
            .inner
            .reply_to_message(&space_id, &message_id, &text)
            .await?;
        let decrypted = self.inner.decrypt_message(&message).await?;
        swb::to_value(&account_message_to_js(&self.inner, message, decrypted).await?)
            .map_err(Into::into)
    }

    /// Send a private post reply message to the post owner.
    pub async fn reply_to_post(
        &self,
        post_id: i64,
        text: String,
    ) -> Result<JsValue, WasmSpaceError> {
        let message = self.inner.reply_to_post(post_id, &text).await?;
        let decrypted = self.inner.decrypt_message(&message).await?;
        swb::to_value(&account_message_to_js(&self.inner, message, decrypted).await?)
            .map_err(Into::into)
    }

    /// Like or unlike a message.
    pub async fn like_message(
        &self,
        message_id: String,
        like: bool,
    ) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&self.inner.like_message(&message_id, like).await?).map_err(Into::into)
    }

    /// Delete a message sent by the current account.
    pub async fn delete_message(&self, message_id: String) -> Result<(), WasmSpaceError> {
        self.inner
            .delete_message(&message_id)
            .await
            .map_err(Into::into)
    }

    /// List 1:1 message conversations with decrypted latest activity messages.
    pub async fn list_message_conversations(
        &self,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmSpaceError> {
        let page = self.inner.list_message_conversations(cursor, limit).await?;
        let mut items = Vec::with_capacity(page.items.len());
        for conversation in page.items {
            let friend = account_actor_to_js(&self.inner, conversation.friend).await?;
            items.push(MessageConversationJs {
                friend,
                latest_activity: message_conversation_activity_to_js(
                    &self.inner,
                    conversation.latest_activity,
                )
                .await?,
                unread: conversation.unread,
                unread_count: conversation.unread_count,
                notification_unread: conversation.notification_unread,
            });
        }
        swb::to_value(&MessageConversationPageJs {
            items,
            next_cursor: page.next_cursor,
        })
        .map_err(Into::into)
    }

    /// List a 1:1 message thread with decrypted messages.
    pub async fn list_message_thread(
        &self,
        space_id: String,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmSpaceError> {
        let page = self
            .inner
            .list_message_thread(&space_id, cursor, limit)
            .await?;
        let mut items = Vec::with_capacity(page.items.len());
        for message in page.items {
            items.push(account_message_response_to_js(&self.inner, message).await?);
        }
        swb::to_value(&MessagePageJs {
            items,
            next_cursor: page.next_cursor,
        })
        .map_err(Into::into)
    }

    /// Update a post caption.
    pub async fn update_post_caption(
        &self,
        post_id: i64,
        caption: Option<String>,
    ) -> Result<(), WasmSpaceError> {
        let post = self.inner.get_post(post_id).await?;
        let decrypted_post = self
            .inner
            .decrypt_post_for_space(&post.space_id, &post)
            .await?;
        self.inner
            .update_post_caption(
                post_id,
                &decrypted_post.post_key,
                caption.as_ref().map(|value| value.as_bytes()),
            )
            .await
            .map_err(Into::into)
    }

    /// Delete a post.
    pub async fn delete_post(&self, post_id: i64) -> Result<(), WasmSpaceError> {
        self.inner.delete_post(post_id).await.map_err(Into::into)
    }

    /// List friends for a space.
    pub async fn list_space_friends(&self, space_id: String) -> Result<JsValue, WasmSpaceError> {
        let friends = self.inner.list_space_friends(&space_id).await?;
        let mut items = Vec::with_capacity(friends.len());
        for friend in friends {
            items.push(FriendJs {
                friend: account_actor_to_js(&self.inner, friend.friend).await?,
                share_key_version: friend.share_key_version,
                created_at: friend.created_at,
            });
        }
        swb::to_value(&items).map_err(Into::into)
    }

    /// List incoming friend requests for the current account.
    pub async fn list_friend_requests(&self) -> Result<JsValue, WasmSpaceError> {
        let requests = self.inner.list_friend_requests().await?;
        let mut items = Vec::with_capacity(requests.len());
        for request in requests {
            items.push(FriendRequestJs {
                request_id: request.request_id,
                requester: public_actor_to_js(request.requester)?,
                created_at: request.created_at,
            });
        }
        swb::to_value(&items).map_err(Into::into)
    }

    /// Confirm an incoming friend request.
    pub async fn confirm_friend_request(&self, request_id: i64) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&self.inner.confirm_friend_request(request_id).await?).map_err(Into::into)
    }

    /// Delete an incoming friend request.
    pub async fn delete_friend_request(&self, request_id: i64) -> Result<(), WasmSpaceError> {
        self.inner
            .delete_friend_request(request_id)
            .await
            .map_err(Into::into)
    }

    /// Remove a friend by their space ID.
    pub async fn remove_friend_by_space(&self, space_id: String) -> Result<(), WasmSpaceError> {
        self.inner
            .unfriend_by_space(&space_id)
            .await
            .map_err(Into::into)
    }

    /// List friend shares available to the current account.
    pub async fn list_friend_shares(&self) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&self.inner.list_friend_shares().await?).map_err(Into::into)
    }

    /// Refresh friend shares for a rotated space key.
    pub async fn refresh_friend_shares(&self, space_id: String) -> Result<usize, WasmSpaceError> {
        self.inner
            .refresh_friend_shares(&space_id)
            .await
            .map_err(Into::into)
    }
}

/// Handle to a public space link context.
#[wasm_bindgen]
pub struct SpaceLinkCtxHandle {
    inner: SpaceLinkCtx,
}

#[wasm_bindgen]
impl SpaceLinkCtxHandle {
    /// Fetch and decrypt the public space profile.
    pub async fn get_space_profile(&self) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(&profile_to_js(
            self.inner.get_space_profile_decrypted(None).await?,
        )?)
        .map_err(Into::into)
    }

    /// List public space posts with captions decrypted.
    pub async fn list_posts(
        &self,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmSpaceError> {
        swb::to_value(
            &link_post_page_to_js(&self.inner, self.inner.list_posts(cursor, limit).await?).await?,
        )
        .map_err(Into::into)
    }

    /// Download and decrypt one object from a public space post.
    pub async fn download_post_asset(
        &self,
        post_id: i64,
        object_key: String,
    ) -> Result<Vec<u8>, WasmSpaceError> {
        self.inner
            .download_post_asset(post_id, &object_key)
            .await
            .map_err(Into::into)
    }

    /// Download and decrypt one object from an already fetched public space post.
    pub async fn download_post_asset_with_key(
        &self,
        post_id: i64,
        encrypted_post_key: String,
        key_version: i32,
        object_key: String,
    ) -> Result<Vec<u8>, WasmSpaceError> {
        self.inner
            .download_post_asset_with_key(post_id, &encrypted_post_key, key_version, &object_key)
            .await
            .map_err(Into::into)
    }

    /// Download and decrypt the public space avatar.
    pub async fn download_space_avatar(
        &self,
        object_key: String,
    ) -> Result<Vec<u8>, WasmSpaceError> {
        self.inner
            .download_decrypted_asset(&object_key, self.inner.space_key())
            .await
            .map_err(Into::into)
    }

    /// Download and decrypt the public space cover.
    pub async fn download_space_cover(
        &self,
        object_key: String,
    ) -> Result<Vec<u8>, WasmSpaceError> {
        self.inner
            .download_decrypted_asset(&object_key, self.inner.space_key())
            .await
            .map_err(Into::into)
    }

    /// List people who liked a post.
    pub async fn list_post_likers(
        &self,
        post_id: i64,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmSpaceError> {
        let page = self.inner.list_post_likers(post_id, cursor, limit).await?;
        let mut likers = Vec::with_capacity(page.likers.len());
        for liker in page.likers {
            likers.push(PostLikerJs {
                actor: link_actor_to_js(&self.inner, liker.actor).await?,
                created_at: liker.created_at,
            });
        }
        swb::to_value(&PostLikerPageJs {
            likers,
            next_cursor: page.next_cursor,
        })
        .map_err(Into::into)
    }
}
