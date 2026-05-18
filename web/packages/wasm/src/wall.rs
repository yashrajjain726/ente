//! WASM bindings for wall/social flows.

use ente_core::http::Error as HttpError;
use ente_wall::{
    AccountWallCtx, AuthKeyAttributes, CreatedWall, CreatedWallLink, DecryptedMessage,
    DecryptedPost, DecryptedWallProfile, MessageResponse, OpenAccountWallCtxInput,
    OpenWallLinkCtxInput, PostResponse, PrivateKeySource, ProfileAvatarResponse, WallActorResponse,
    WallError as CoreWallError, WallLinkCtx, WallNotification, WallNotificationPost,
    crypto::{decode_b64, encode_b64},
};
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen as swb;
use wasm_bindgen::prelude::*;

/// Wall client error.
#[wasm_bindgen]
pub struct WasmWallError {
    code: String,
    message: String,
    status: Option<u16>,
}

#[wasm_bindgen]
impl WasmWallError {
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

impl From<CoreWallError> for WasmWallError {
    fn from(e: CoreWallError) -> Self {
        let (code, status) = match &e {
            CoreWallError::Http(HttpError::Http { status, .. }) => ("http", Some(*status)),
            CoreWallError::Http(HttpError::InvalidUrl(_)) => ("invalid_url", None),
            CoreWallError::Http(HttpError::Network(_)) => ("network", None),
            CoreWallError::Http(HttpError::Parse(_)) => ("parse", None),
            CoreWallError::Crypto(_) => ("crypto", None),
            CoreWallError::Auth(_) => ("auth", None),
            CoreWallError::Base64(_) => ("base64", None),
            CoreWallError::InvalidInput(_) => ("invalid_input", None),
            CoreWallError::MissingPrivateKey => ("missing_private_key", None),
            CoreWallError::MissingEncryptedWallKey => ("missing_encrypted_wall_key", None),
            CoreWallError::EntityKeyConflict => ("entity_key_conflict", None),
        };
        Self {
            code: code.to_owned(),
            message: e.to_string(),
            status,
        }
    }
}

impl From<swb::Error> for WasmWallError {
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
struct OpenAccountWallCtxJsInput {
    base_url: String,
    auth_token: String,
    master_key_b64: String,
    public_key_b64: String,
    private_key_b64: Option<String>,
    key_attributes: Option<AuthKeyAttributes>,
    auth_key_attributes: Option<AuthKeyAttributes>,
    user_id: Option<i64>,
    user_agent: Option<String>,
    client_package: Option<String>,
    client_version: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenWallLinkCtxJsInput {
    base_url: String,
    wall_username: String,
    access_key: String,
    user_agent: Option<String>,
    client_package: Option<String>,
    client_version: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatedWallJs {
    wall_id: String,
    wall_slug: String,
    key_version: i32,
    wall_key_b64: String,
    encrypted_wall_key: String,
    encrypted_profile: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreatedWallLinkJs {
    access_key: String,
    wall_username: String,
    wall_id: String,
    wall_slug: String,
    key_version: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WallProfileJs {
    wall_id: String,
    wall_slug: String,
    version: i32,
    friends: i64,
    profile: String,
    avatar: Option<ProfileAvatarResponse>,
    updated_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActorJs {
    user_id: i64,
    wall_id: String,
    wall_slug: String,
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
    wall_id: String,
    wall_slug: String,
    owner_user_id: i64,
    author: ActorJs,
    caption: Option<String>,
    key_version: i32,
    objects: Vec<ente_wall::PostObjectPayload>,
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
struct NotificationPostJs {
    post_id: i64,
    wall_id: String,
    wall_slug: String,
    owner_user_id: i64,
    author: ActorJs,
    objects: Vec<ente_wall::PostObjectPayload>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationJs {
    id: String,
    #[serde(rename = "type")]
    notification_type: ente_wall::WallNotificationType,
    created_at: String,
    actor: ActorJs,
    post: Option<NotificationPostJs>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationPageJs {
    items: Vec<NotificationJs>,
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
    wall_id: String,
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
    last_message: MessageJs,
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

fn decode_b64_field(value: &str) -> Result<Vec<u8>, WasmWallError> {
    decode_b64(value).map_err(Into::into)
}

fn utf8_field(bytes: Vec<u8>, field: &str) -> Result<String, WasmWallError> {
    String::from_utf8(bytes)
        .map_err(|err| CoreWallError::InvalidInput(format!("invalid {field} utf8: {err}")).into())
}

fn optional_utf8_field(
    bytes: Option<Vec<u8>>,
    field: &str,
) -> Result<Option<String>, WasmWallError> {
    bytes.map(|value| utf8_field(value, field)).transpose()
}

fn created_wall_to_js(value: CreatedWall) -> CreatedWallJs {
    CreatedWallJs {
        wall_id: value.wall_id,
        wall_slug: value.wall_slug,
        key_version: value.key_version,
        wall_key_b64: encode_b64(&value.wall_key),
        encrypted_wall_key: value.encrypted_wall_key,
        encrypted_profile: value.encrypted_profile,
    }
}

fn created_link_to_js(value: CreatedWallLink) -> CreatedWallLinkJs {
    CreatedWallLinkJs {
        access_key: value.access_key,
        wall_username: value.wall_username,
        wall_id: value.wall_id,
        wall_slug: value.wall_slug,
        key_version: value.key_version,
    }
}

fn profile_to_js(value: DecryptedWallProfile) -> Result<WallProfileJs, WasmWallError> {
    Ok(WallProfileJs {
        wall_id: value.wall_id,
        wall_slug: value.wall_slug,
        version: value.version,
        friends: value.friends,
        profile: utf8_field(value.profile, "profile")?,
        avatar: value.avatar,
        updated_at: value.updated_at,
    })
}

fn actor_to_js(
    actor: WallActorResponse,
    profile: Option<Vec<u8>>,
) -> Result<ActorJs, WasmWallError> {
    Ok(ActorJs {
        user_id: actor.user_id,
        wall_id: actor.wall_id,
        wall_slug: actor.wall_slug,
        public_key: actor.public_key,
        key_version: actor.key_version,
        profile: optional_utf8_field(profile, "actor profile")?,
        avatar: actor.avatar,
        friends: actor.friends,
        posts: actor.posts,
    })
}

async fn account_actor_to_js(
    ctx: &AccountWallCtx,
    actor: WallActorResponse,
) -> Result<ActorJs, WasmWallError> {
    let profile = ctx.decrypt_actor_profile(&actor).await?;
    actor_to_js(actor, profile)
}

async fn link_actor_to_js(
    ctx: &WallLinkCtx,
    actor: WallActorResponse,
) -> Result<ActorJs, WasmWallError> {
    let profile = ctx.decrypt_actor_profile(&actor).await?;
    actor_to_js(actor, profile)
}

async fn account_post_to_js(
    ctx: &AccountWallCtx,
    post: PostResponse,
    decrypted: DecryptedPost,
) -> Result<PostJs, WasmWallError> {
    let author = account_actor_to_js(ctx, post.author).await?;
    Ok(PostJs {
        post_id: post.post_id,
        wall_id: post.wall_id,
        wall_slug: post.wall_slug,
        owner_user_id: post.owner_user_id,
        author,
        caption: optional_utf8_field(decrypted.caption_plaintext, "caption")?,
        key_version: post.key_version,
        objects: post.objects,
        created_at: post.created_at,
        likes: post.likes,
        viewer_liked: post.viewer_liked,
    })
}

async fn link_post_to_js(
    ctx: &WallLinkCtx,
    post: PostResponse,
    decrypted: DecryptedPost,
) -> Result<PostJs, WasmWallError> {
    let author = link_actor_to_js(ctx, post.author).await?;
    Ok(PostJs {
        post_id: post.post_id,
        wall_id: post.wall_id,
        wall_slug: post.wall_slug,
        owner_user_id: post.owner_user_id,
        author,
        caption: optional_utf8_field(decrypted.caption_plaintext, "caption")?,
        key_version: post.key_version,
        objects: post.objects,
        created_at: post.created_at,
        likes: post.likes,
        viewer_liked: post.viewer_liked,
    })
}

async fn account_post_page_to_js(
    ctx: &AccountWallCtx,
    page: ente_wall::PostPage,
) -> Result<PostPageJs, WasmWallError> {
    let mut items = Vec::with_capacity(page.items.len());
    for post in page.items {
        let decrypted = ctx.decrypt_post_for_wall(&post.wall_id, &post).await?;
        items.push(account_post_to_js(ctx, post, decrypted).await?);
    }
    Ok(PostPageJs {
        items,
        next_cursor: page.next_cursor,
    })
}

async fn link_post_page_to_js(
    ctx: &WallLinkCtx,
    page: ente_wall::PostPage,
) -> Result<PostPageJs, WasmWallError> {
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

async fn notification_to_js(
    ctx: &AccountWallCtx,
    notification: WallNotification,
) -> Result<NotificationJs, WasmWallError> {
    let post = match notification.post {
        Some(post) => Some(notification_post_to_js(ctx, post).await?),
        None => None,
    };
    let actor = account_actor_to_js(ctx, notification.actor).await?;
    Ok(NotificationJs {
        id: notification.id,
        notification_type: notification.notification_type,
        created_at: notification.created_at,
        actor,
        post,
    })
}

async fn notification_post_to_js(
    ctx: &AccountWallCtx,
    post: WallNotificationPost,
) -> Result<NotificationPostJs, WasmWallError> {
    let author = account_actor_to_js(ctx, post.author).await?;
    Ok(NotificationPostJs {
        post_id: post.post_id,
        wall_id: post.wall_id,
        wall_slug: post.wall_slug,
        owner_user_id: post.owner_user_id,
        author,
        objects: post.objects,
    })
}

async fn account_message_to_js(
    ctx: &AccountWallCtx,
    message: MessageResponse,
    decrypted: DecryptedMessage,
) -> Result<MessageJs, WasmWallError> {
    let sender = account_actor_to_js(ctx, message.sender).await?;
    let recipient = account_actor_to_js(ctx, message.recipient).await?;
    let quote = decrypted.payload.quote.map(|quote| MessageQuoteJs {
        post_id: quote.post_id,
        wall_id: quote.wall_id,
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
        is_deleted: message.is_deleted,
        created_at: message.created_at,
        updated_at: message.updated_at,
    })
}

/// Open an authenticated wall context for web.
#[wasm_bindgen]
pub async fn wall_open_account_ctx(input: JsValue) -> Result<WallAccountCtxHandle, WasmWallError> {
    let input: OpenAccountWallCtxJsInput = swb::from_value(input)?;
    let master_key = decode_b64_field(&input.master_key_b64)?;
    let public_key = decode_b64_field(&input.public_key_b64)?;
    let private_key_source = if let Some(private_key_b64) = input.private_key_b64.as_deref() {
        PrivateKeySource::Plain(decode_b64_field(private_key_b64)?)
    } else if let Some(attrs) = input.key_attributes.or(input.auth_key_attributes) {
        PrivateKeySource::EncryptedKeyAttributes(attrs)
    } else {
        return Err(CoreWallError::MissingPrivateKey.into());
    };
    let ctx = AccountWallCtx::open(OpenAccountWallCtxInput {
        base_url: input.base_url.clone(),
        auth_token: input.auth_token,
        master_key,
        public_key,
        private_key_source,
        user_id: input.user_id,
        user_agent: input.user_agent.clone(),
        client_package: input.client_package.clone(),
        client_version: input.client_version.clone(),
    })?;
    Ok(WallAccountCtxHandle {
        inner: ctx,
        base_url: input.base_url,
        user_agent: input.user_agent,
        client_package: input.client_package,
        client_version: input.client_version,
    })
}

/// Open a public wall link context for web.
#[wasm_bindgen]
pub async fn wall_open_link_ctx(input: JsValue) -> Result<WallLinkCtxHandle, WasmWallError> {
    let input: OpenWallLinkCtxJsInput = swb::from_value(input)?;
    let ctx = WallLinkCtx::open(OpenWallLinkCtxInput {
        base_url: input.base_url,
        wall_username: input.wall_username,
        access_key: input.access_key,
        user_agent: input.user_agent,
        client_package: input.client_package,
        client_version: input.client_version,
    })
    .await?;
    Ok(WallLinkCtxHandle { inner: ctx })
}

/// Handle to an authenticated wall context.
#[wasm_bindgen]
pub struct WallAccountCtxHandle {
    inner: AccountWallCtx,
    base_url: String,
    user_agent: Option<String>,
    client_package: Option<String>,
    client_version: Option<String>,
}

#[wasm_bindgen]
impl WallAccountCtxHandle {
    /// Create a wall with an encrypted JSON profile payload.
    pub async fn create_wall(
        &self,
        wall_slug: String,
        profile: String,
    ) -> Result<JsValue, WasmWallError> {
        swb::to_value(&created_wall_to_js(
            self.inner
                .create_wall(&wall_slug, profile.as_bytes())
                .await?,
        ))
        .map_err(Into::into)
    }

    /// List walls owned by the current account.
    pub async fn list_owned_walls(&self) -> Result<JsValue, WasmWallError> {
        swb::to_value(&self.inner.list_owned_walls().await?).map_err(Into::into)
    }

    /// Fetch and decrypt a wall profile.
    pub async fn get_wall_profile(&self, wall_id: String) -> Result<JsValue, WasmWallError> {
        swb::to_value(&profile_to_js(
            self.inner
                .get_wall_profile_decrypted(&wall_id, None)
                .await?,
        )?)
        .map_err(Into::into)
    }

    /// Update a wall's encrypted JSON profile payload.
    pub async fn update_wall_profile(
        &self,
        wall_id: String,
        profile: String,
    ) -> Result<JsValue, WasmWallError> {
        swb::to_value(
            &self
                .inner
                .update_wall_profile(&wall_id, profile.as_bytes(), None, false)
                .await?,
        )
        .map_err(Into::into)
    }

    /// Update a wall profile and replace its encrypted avatar asset.
    pub async fn update_wall_profile_with_avatar(
        &self,
        wall_id: String,
        profile: String,
        avatar_bytes: Vec<u8>,
    ) -> Result<JsValue, WasmWallError> {
        let wall_key = self
            .inner
            .resolve_owned_wall_key(&wall_id)
            .await?
            .ok_or_else(|| {
                CoreWallError::InvalidInput(format!("wall {wall_id} is not owned by the account"))
            })?;
        let avatar = self
            .inner
            .upload_avatar(&wall_id, &wall_key, &avatar_bytes)
            .await?;
        swb::to_value(
            &self
                .inner
                .update_wall_profile(&wall_id, profile.as_bytes(), Some(avatar), false)
                .await?,
        )
        .map_err(Into::into)
    }

    /// Update a wall's slug.
    pub async fn update_wall_slug(
        &self,
        wall_id: String,
        wall_slug: String,
    ) -> Result<JsValue, WasmWallError> {
        swb::to_value(&self.inner.update_wall_slug(&wall_id, &wall_slug).await?).map_err(Into::into)
    }

    /// Lookup public wall metadata by slug.
    pub async fn lookup_wall_by_slug(&self, wall_slug: String) -> Result<JsValue, WasmWallError> {
        swb::to_value(&self.inner.lookup_wall_by_slug(&wall_slug).await?).map_err(Into::into)
    }

    /// Return whether the target wall is self, friend, or neither.
    pub async fn get_relationship(&self, target_wall_id: String) -> Result<JsValue, WasmWallError> {
        swb::to_value(&self.inner.get_relationship(&target_wall_id).await?).map_err(Into::into)
    }

    /// Create a shareable wall link.
    pub async fn create_wall_link(&self, wall_id: String) -> Result<JsValue, WasmWallError> {
        swb::to_value(&created_link_to_js(
            self.inner.create_wall_link(&wall_id).await?,
        ))
        .map_err(Into::into)
    }

    /// Fetch wall link status.
    pub async fn get_wall_link_status(&self, wall_id: String) -> Result<JsValue, WasmWallError> {
        swb::to_value(&self.inner.get_wall_link_status(&wall_id).await?).map_err(Into::into)
    }

    /// Delete a wall link.
    pub async fn delete_wall_link(&self, wall_id: String) -> Result<(), WasmWallError> {
        self.inner
            .delete_wall_link(&wall_id)
            .await
            .map_err(Into::into)
    }

    /// Join a wall link as a friend.
    pub async fn join_wall_link(
        &self,
        wall_username: String,
        access_key: String,
    ) -> Result<JsValue, WasmWallError> {
        let link = WallLinkCtx::open(OpenWallLinkCtxInput {
            base_url: self.base_url.clone(),
            wall_username,
            access_key,
            user_agent: self.user_agent.clone(),
            client_package: self.client_package.clone(),
            client_version: self.client_version.clone(),
        })
        .await?;
        swb::to_value(&self.inner.add_friend_from_link(&link).await?).map_err(Into::into)
    }

    /// List the current account feed with captions decrypted.
    pub async fn list_feed(
        &self,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmWallError> {
        let page = self.inner.list_feed(cursor, limit).await?;
        swb::to_value(
            &account_post_page_to_js(
                &self.inner,
                ente_wall::PostPage {
                    items: page
                        .items
                        .into_iter()
                        .map(|item| PostResponse {
                            post_id: item.post_id,
                            wall_id: item.wall_id,
                            wall_slug: item.wall_slug.clone(),
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

    /// List posts on a wall with captions decrypted.
    pub async fn list_posts(
        &self,
        wall_id: String,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmWallError> {
        swb::to_value(
            &account_post_page_to_js(
                &self.inner,
                self.inner.list_posts(&wall_id, cursor, limit).await?,
            )
            .await?,
        )
        .map_err(Into::into)
    }

    /// Create a single-photo post with optional caption.
    pub async fn create_photo_post(
        &self,
        wall_id: String,
        photo_bytes: Vec<u8>,
        caption: Option<String>,
        width: Option<i32>,
        height: Option<i32>,
        media_type: Option<String>,
    ) -> Result<JsValue, WasmWallError> {
        let post_key = self.inner.generate_post_key();
        let object = self
            .inner
            .upload_post_photo_asset(&post_key, &photo_bytes, width, height, media_type)
            .await?;
        let (post_id, _) = self
            .inner
            .create_post(
                &wall_id,
                &[object],
                caption.as_ref().map(|value| value.as_bytes()),
                Some(&post_key),
            )
            .await?;
        let post = self.inner.get_post(post_id).await?;
        let decrypted = self
            .inner
            .decrypt_post_for_wall(&post.wall_id, &post)
            .await?;
        swb::to_value(&account_post_to_js(&self.inner, post, decrypted).await?).map_err(Into::into)
    }

    /// Download and decrypt one object from a wall post.
    pub async fn download_post_asset(
        &self,
        post_id: i64,
        object_key: String,
    ) -> Result<Vec<u8>, WasmWallError> {
        self.inner
            .download_post_asset(post_id, &object_key)
            .await
            .map_err(Into::into)
    }

    /// Download and decrypt a wall avatar using an owned or friend wall key.
    pub async fn download_wall_avatar(
        &self,
        wall_id: String,
        object_key: String,
    ) -> Result<Vec<u8>, WasmWallError> {
        let wall_key = self
            .inner
            .resolve_wall_key(&wall_id)
            .await?
            .ok_or_else(|| {
                CoreWallError::InvalidInput(format!("no wall key available for {wall_id}"))
            })?;
        self.inner
            .download_decrypted_asset(&wall_id, &object_key, &wall_key)
            .await
            .map_err(Into::into)
    }

    /// Like or unlike a post.
    pub async fn like_post(&self, post_id: i64, like: bool) -> Result<JsValue, WasmWallError> {
        swb::to_value(&self.inner.like_post(post_id, like).await?).map_err(Into::into)
    }

    /// List people who liked a post.
    pub async fn list_post_likers(
        &self,
        post_id: i64,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmWallError> {
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

    /// Send a regular 1:1 message to a friend wall.
    pub async fn send_message(
        &self,
        wall_id: String,
        text: String,
    ) -> Result<JsValue, WasmWallError> {
        let message = self.inner.send_message(&wall_id, &text).await?;
        let decrypted = self.inner.decrypt_message(&message)?;
        swb::to_value(&account_message_to_js(&self.inner, message, decrypted).await?)
            .map_err(Into::into)
    }

    /// Send a private post reply message to the post owner.
    pub async fn reply_to_post(
        &self,
        post_id: i64,
        text: String,
    ) -> Result<JsValue, WasmWallError> {
        let message = self.inner.reply_to_post(post_id, &text).await?;
        let decrypted = self.inner.decrypt_message(&message)?;
        swb::to_value(&account_message_to_js(&self.inner, message, decrypted).await?)
            .map_err(Into::into)
    }

    /// List 1:1 message conversations with decrypted last messages.
    pub async fn list_message_conversations(
        &self,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmWallError> {
        let page = self.inner.list_message_conversations(cursor, limit).await?;
        let mut items = Vec::with_capacity(page.items.len());
        for conversation in page.items {
            let friend = account_actor_to_js(&self.inner, conversation.friend).await?;
            let decrypted = self.inner.decrypt_message(&conversation.last_message)?;
            items.push(MessageConversationJs {
                friend,
                last_message: account_message_to_js(
                    &self.inner,
                    conversation.last_message,
                    decrypted,
                )
                .await?,
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
        wall_id: String,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmWallError> {
        let page = self
            .inner
            .list_message_thread(&wall_id, cursor, limit)
            .await?;
        let mut items = Vec::with_capacity(page.items.len());
        for message in page.items {
            let decrypted = self.inner.decrypt_message(&message)?;
            items.push(account_message_to_js(&self.inner, message, decrypted).await?);
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
    ) -> Result<(), WasmWallError> {
        let post = self.inner.get_post(post_id).await?;
        let decrypted_post = self
            .inner
            .decrypt_post_for_wall(&post.wall_id, &post)
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
    pub async fn delete_post(&self, post_id: i64) -> Result<(), WasmWallError> {
        self.inner.delete_post(post_id).await.map_err(Into::into)
    }

    /// List friends for a wall.
    pub async fn list_wall_friends(&self, wall_id: String) -> Result<JsValue, WasmWallError> {
        let friends = self.inner.list_wall_friends(&wall_id).await?;
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

    /// Remove a friend by their wall ID.
    pub async fn remove_friend_by_wall(&self, wall_id: String) -> Result<(), WasmWallError> {
        self.inner
            .unfriend_by_wall(&wall_id)
            .await
            .map_err(Into::into)
    }

    /// List friend shares available to the current account.
    pub async fn list_friend_shares(&self) -> Result<JsValue, WasmWallError> {
        swb::to_value(&self.inner.list_friend_shares().await?).map_err(Into::into)
    }

    /// Refresh friend shares for a rotated wall key.
    pub async fn refresh_friend_shares(&self, wall_id: String) -> Result<usize, WasmWallError> {
        self.inner
            .refresh_friend_shares(&wall_id)
            .await
            .map_err(Into::into)
    }

    /// List notifications.
    pub async fn list_notifications(
        &self,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmWallError> {
        let page = self.inner.list_notifications(cursor, limit).await?;
        let mut items = Vec::with_capacity(page.items.len());
        for item in page.items {
            items.push(notification_to_js(&self.inner, item).await?);
        }
        swb::to_value(&NotificationPageJs {
            items,
            next_cursor: page.next_cursor,
        })
        .map_err(Into::into)
    }
}

/// Handle to a public wall link context.
#[wasm_bindgen]
pub struct WallLinkCtxHandle {
    inner: WallLinkCtx,
}

#[wasm_bindgen]
impl WallLinkCtxHandle {
    /// Fetch and decrypt the public wall profile.
    pub async fn get_wall_profile(&self) -> Result<JsValue, WasmWallError> {
        swb::to_value(&profile_to_js(
            self.inner.get_wall_profile_decrypted(None).await?,
        )?)
        .map_err(Into::into)
    }

    /// List public wall posts with captions decrypted.
    pub async fn list_posts(
        &self,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmWallError> {
        swb::to_value(
            &link_post_page_to_js(&self.inner, self.inner.list_posts(cursor, limit).await?).await?,
        )
        .map_err(Into::into)
    }

    /// Download and decrypt one object from a public wall post.
    pub async fn download_post_asset(
        &self,
        post_id: i64,
        object_key: String,
    ) -> Result<Vec<u8>, WasmWallError> {
        self.inner
            .download_post_asset(post_id, &object_key)
            .await
            .map_err(Into::into)
    }

    /// Download and decrypt the public wall avatar.
    pub async fn download_wall_avatar(&self, object_key: String) -> Result<Vec<u8>, WasmWallError> {
        self.inner
            .download_decrypted_asset(&object_key, self.inner.wall_key())
            .await
            .map_err(Into::into)
    }

    /// List people who liked a post.
    pub async fn list_post_likers(
        &self,
        post_id: i64,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<JsValue, WasmWallError> {
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
