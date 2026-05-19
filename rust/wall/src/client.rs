use std::collections::BTreeMap;

use crate::crypto::{
    decode_b64, decrypt_entity_key, decrypt_secretbox_packed, derive_wall_link_access_key,
    derive_wall_link_auth_key, derive_wall_link_wrap_key, encode_b64, encrypt_asset_payload,
    encrypt_entity_key, encrypt_secretbox_packed, generate_key, pack_payload, unpack_payload,
    wall_link_access_key_material,
};
use crate::error::{Result, WallError};
use crate::models::{
    CreatedWall, CreatedWallLink, DecryptedFriendShare, DecryptedMessage, DecryptedPost,
    DecryptedWallProfile, FeedItem, FeedPage, HydratedKeys, MessagePayload, MessageQuote,
    OpenAccountWallCtxInput, OpenWallLinkCtxInput, PrivateKeySource,
};
use crate::transport::{
    AddFriendPayload, AssetDownloadResponse, CreateEntityKeyRequest, CreateMessageRequest,
    CreatePostRequest, CreatePostResponse, CreateWallRequest, EntityKeyPayload, EntityKeyResponse,
    FriendRelationshipResponse, FriendShareResponse, FriendStatusResponse, FriendTargetPayload,
    LikeMessageRequest, LikeMessageResponse, LikePostRequest, LikePostResponse,
    ListPostLikersResponse, MarkFeedReadRequest, MarkNotificationsReadRequest,
    MessageConversationPage, MessagePage, MessageResponse, PostObjectPayload, PostPage,
    PostResponse, PresignUploadRequest, PresignUploadResponse, ProfileAvatarPayload,
    RefreshFriendSharesRequest, RotateWallKeyRequest, ShareUpdatePayload, UpdatePostCaptionRequest,
    UpdateWallProfileRequest, UpdateWallProfileResponse, UpdateWallSlugRequest, WallActorResponse,
    WallFriendResponse, WallKeyResponse, WallKeyVersionResponse, WallLinkCreateRequest,
    WallLinkLoginRequest, WallLinkLoginResponse, WallLinkStatusResponse, WallLookupResponse,
    WallProfileResponse, WallUnreadStatusResponse,
};
use ente_core::crypto::{sealed, secretbox};
use ente_core::http::{Error as HttpError, HttpClient, HttpConfig};

const ROOT_WALL_KEY_TYPE: &str = "wall";
const UPLOAD_PURPOSE_AVATAR: &str = "avatar";
const MESSAGE_KIND_REGULAR: &str = "regular";
const MESSAGE_KIND_POST_REPLY: &str = "post_reply";

#[derive(Debug, Clone)]
struct ResolvedWallAccess {
    wall_key: Vec<u8>,
    key_version: i32,
}

pub struct AccountWallCtx {
    client: HttpClient,
    master_key: Vec<u8>,
    public_key: Vec<u8>,
    private_key: Vec<u8>,
    user_id: Option<i64>,
}

pub struct WallLinkCtx {
    client: HttpClient,
    session_token: String,
    owner_handle: String,
    wall_id: String,
    wall_slug: String,
    owner_public_key: Vec<u8>,
    wall_key: Vec<u8>,
    key_version: i32,
}

impl AccountWallCtx {
    pub fn open(input: OpenAccountWallCtxInput) -> Result<Self> {
        let client = build_http_client(
            &input.base_url,
            Some(input.auth_token),
            input.user_agent,
            input.client_package,
            input.client_version,
        )?;
        let private_key = decrypt_private_key(&input.master_key, input.private_key_source)?;
        Ok(Self {
            client,
            master_key: input.master_key,
            public_key: input.public_key,
            private_key,
            user_id: input.user_id,
        })
    }

    pub fn client(&self) -> &HttpClient {
        &self.client
    }

    pub fn user_id(&self) -> Option<i64> {
        self.user_id
    }

    pub fn master_key(&self) -> &[u8] {
        &self.master_key
    }

    pub fn public_key(&self) -> &[u8] {
        &self.public_key
    }

    pub fn private_key(&self) -> &[u8] {
        &self.private_key
    }

    pub async fn get_entity_key(&self, key_type: &str) -> Result<Option<EntityKeyPayload>> {
        let query = vec![("type", key_type.to_owned())];
        let payload = self
            .client
            .get_json_optional::<EntityKeyResponse>("/user-entity/key", &query)
            .await?;
        Ok(payload.map(|value| EntityKeyPayload {
            encrypted_key: value.encrypted_key,
            header: value.header,
        }))
    }

    pub async fn create_entity_key(
        &self,
        key_type: &str,
        payload: &EntityKeyPayload,
    ) -> Result<()> {
        let request = CreateEntityKeyRequest {
            key_type: key_type.to_owned(),
            encrypted_key: payload.encrypted_key.clone(),
            header: payload.header.clone(),
        };
        match self.client.post_empty("/user-entity/key", &request).await {
            Ok(_) => Ok(()),
            Err(HttpError::Http { status: 409, .. }) => Err(WallError::EntityKeyConflict),
            Err(err) => Err(err.into()),
        }
    }

    pub async fn ensure_entity_key(
        &self,
        key_type: &str,
        payload: &EntityKeyPayload,
    ) -> Result<EntityKeyPayload> {
        let request = CreateEntityKeyRequest {
            key_type: key_type.to_owned(),
            encrypted_key: payload.encrypted_key.clone(),
            header: payload.header.clone(),
        };
        let response = self
            .client
            .post_json::<EntityKeyResponse, _>("/user-entity/key/ensure", &request)
            .await?;
        Ok(EntityKeyPayload {
            encrypted_key: response.encrypted_key,
            header: response.header,
        })
    }

    pub async fn get_root_wall_key(&self) -> Result<Option<Vec<u8>>> {
        let payload = match self.get_entity_key(ROOT_WALL_KEY_TYPE).await? {
            Some(value) => value,
            None => return Ok(None),
        };
        Ok(Some(decrypt_entity_key(&self.master_key, &payload)?))
    }

    pub async fn get_or_create_root_wall_key(&self) -> Result<Vec<u8>> {
        let root_wall_key = generate_key();
        let payload = encrypt_entity_key(&self.master_key, &root_wall_key)?;
        let ensured = self.ensure_entity_key(ROOT_WALL_KEY_TYPE, &payload).await?;
        decrypt_entity_key(&self.master_key, &ensured)
    }

    pub async fn list_owned_walls(&self) -> Result<Vec<WallKeyResponse>> {
        self.client.get_json("/wall", &[]).await.map_err(Into::into)
    }

    pub async fn list_friend_shares(&self) -> Result<Vec<FriendShareResponse>> {
        self.client
            .get_json("/wall/friends/shares", &[])
            .await
            .map_err(Into::into)
    }

    pub fn decrypt_friend_share(
        &self,
        share: &FriendShareResponse,
    ) -> Result<DecryptedFriendShare> {
        let packed = decode_b64(&share.encrypted_wall_key)?;
        let (ciphertext, _) = unpack_payload(&packed)?;
        if ciphertext.is_empty() {
            return Err(WallError::MissingEncryptedWallKey);
        }
        let wall_key = sealed::open(&ciphertext, &self.public_key, &self.private_key)?;
        Ok(DecryptedFriendShare {
            friend: share.friend.clone(),
            wall_id: share.wall_id.clone(),
            wall_slug: share.wall_slug.clone(),
            wall_key,
            key_version: share.key_version,
        })
    }

    async fn default_owned_wall_access(&self) -> Result<(WallKeyResponse, Vec<u8>)> {
        let root_wall_key = self
            .get_root_wall_key()
            .await?
            .ok_or_else(|| WallError::InvalidInput("root wall key is missing".into()))?;
        let wall = self
            .list_owned_walls()
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| WallError::InvalidInput("no owned wall is available".into()))?;
        let packed = decode_b64(&wall.encrypted_wall_key)?;
        let wall_key = decrypt_secretbox_packed(&root_wall_key, &packed)?;
        Ok((wall, wall_key))
    }

    pub async fn resolve_owned_wall_key(&self, wall_id: &str) -> Result<Option<Vec<u8>>> {
        Ok(self
            .resolve_owned_wall_access(wall_id)
            .await?
            .map(|value| value.wall_key))
    }

    pub async fn resolve_wall_key(&self, wall_id: &str) -> Result<Option<Vec<u8>>> {
        Ok(self
            .resolve_wall_access(wall_id)
            .await?
            .map(|value| value.wall_key))
    }

    pub async fn create_wall(&self, wall_slug: &str, profile: &[u8]) -> Result<CreatedWall> {
        let wall_key = generate_key();
        self.create_wall_with_key(wall_slug, &wall_key, profile)
            .await
    }

    pub async fn create_wall_with_key(
        &self,
        wall_slug: &str,
        wall_key: &[u8],
        profile: &[u8],
    ) -> Result<CreatedWall> {
        let root_wall_key = self.get_or_create_root_wall_key().await?;
        let encrypted_wall_key = encode_b64(&encrypt_secretbox_packed(&root_wall_key, wall_key)?);
        let encrypted_profile = encode_b64(&encrypt_secretbox_packed(wall_key, profile)?);
        let request = CreateWallRequest {
            wall_slug: wall_slug.to_owned(),
            encrypted_wall_key: encrypted_wall_key.clone(),
            encrypted_profile: encrypted_profile.clone(),
        };
        let response = self
            .client
            .post_json::<WallKeyResponse, _>("/wall", &request)
            .await?;
        Ok(CreatedWall {
            wall_id: response.wall_id,
            wall_slug: response.wall_slug,
            key_version: response.key_version,
            wall_key: wall_key.to_vec(),
            encrypted_wall_key,
            encrypted_profile,
        })
    }

    pub async fn get_wall_profile_raw(
        &self,
        wall_id: &str,
        version: Option<i32>,
    ) -> Result<WallProfileResponse> {
        let mut query = vec![("wallId", wall_id.to_owned())];
        if let Some(value) = version {
            query.push(("version", value.to_string()));
        }
        self.client
            .get_json("/wall/profile", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn lookup_wall_by_slug(&self, wall_slug: &str) -> Result<WallLookupResponse> {
        let path = format!("/wall/public/by-slug/{}", urlencoding::encode(wall_slug));
        self.client.get_json(&path, &[]).await.map_err(Into::into)
    }

    pub async fn update_wall_slug(
        &self,
        wall_id: &str,
        wall_slug: &str,
    ) -> Result<WallLookupResponse> {
        let path = format!("/wall/{wall_id}/slug");
        let request = UpdateWallSlugRequest {
            wall_slug: wall_slug.to_owned(),
        };
        self.client
            .put_json(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub async fn get_wall_profile_decrypted(
        &self,
        wall_id: &str,
        version: Option<i32>,
    ) -> Result<DecryptedWallProfile> {
        let profile = self.get_wall_profile_raw(wall_id, version).await?;
        let wall_key = self
            .resolve_wall_key_for_version(wall_id, Some(profile.version))
            .await?
            .ok_or_else(|| {
                WallError::InvalidInput(format!(
                    "no key available for wall {wall_id} version {}",
                    profile.version
                ))
            })?;
        decrypt_wall_profile(&profile, &wall_key)
    }

    pub async fn update_wall_profile(
        &self,
        wall_id: &str,
        profile: &[u8],
        avatar: Option<ProfileAvatarPayload>,
        remove_avatar: bool,
    ) -> Result<UpdateWallProfileResponse> {
        let wall_key = self
            .resolve_owned_wall_access(wall_id)
            .await?
            .ok_or_else(|| {
                WallError::InvalidInput(format!("wall {wall_id} is not owned by the account"))
            })?;
        let request = UpdateWallProfileRequest {
            wall_id: wall_id.to_owned(),
            encrypted_profile: encode_b64(&encrypt_secretbox_packed(&wall_key.wall_key, profile)?),
            avatar,
            remove_avatar,
        };
        self.client
            .post_json("/wall/profile", &request)
            .await
            .map_err(Into::into)
    }

    pub async fn list_wall_key_versions(
        &self,
        wall_id: &str,
    ) -> Result<Vec<WallKeyVersionResponse>> {
        let query = vec![("wallId", wall_id.to_owned())];
        self.client
            .get_json("/wall/versions", &query)
            .await
            .map_err(Into::into)
    }

    pub fn build_wall_key_history(
        &self,
        current_version: i32,
        current_key: &[u8],
        versions: &[WallKeyVersionResponse],
    ) -> Result<BTreeMap<i32, Vec<u8>>> {
        build_wall_key_history_map(current_version, current_key, versions)
    }

    pub async fn build_wall_key_history_for_wall(
        &self,
        wall_id: &str,
    ) -> Result<BTreeMap<i32, Vec<u8>>> {
        let access = self
            .resolve_wall_access(wall_id)
            .await?
            .ok_or_else(|| WallError::InvalidInput(format!("no access to wall {wall_id}")))?;
        let versions = self.list_wall_key_versions(wall_id).await?;
        build_wall_key_history_map(access.key_version, &access.wall_key, &versions)
    }

    pub async fn rotate_wall_key(
        &self,
        wall_id: &str,
        profile: Option<&[u8]>,
    ) -> Result<CreatedWall> {
        let current = self
            .resolve_owned_wall_access(wall_id)
            .await?
            .ok_or_else(|| {
                WallError::InvalidInput(format!("wall {wall_id} is not owned by the account"))
            })?;
        let current_profile = if profile.is_none() {
            Some(self.get_wall_profile_decrypted(wall_id, None).await?)
        } else {
            None
        };
        let next_profile = match profile {
            Some(value) => value.to_vec(),
            None => current_profile
                .as_ref()
                .map(|value| value.profile.clone())
                .ok_or_else(|| WallError::InvalidInput("missing current profile".into()))?,
        };
        let next_wall_key = generate_key();
        let root_wall_key = self.get_or_create_root_wall_key().await?;
        let request = RotateWallKeyRequest {
            wall_id: wall_id.to_owned(),
            encrypted_wall_key: encode_b64(&encrypt_secretbox_packed(
                &root_wall_key,
                &next_wall_key,
            )?),
            wrapped_prev_key: encode_b64(&encrypt_secretbox_packed(
                &next_wall_key,
                &current.wall_key,
            )?),
            encrypted_profile: Some(encode_b64(&encrypt_secretbox_packed(
                &next_wall_key,
                &next_profile,
            )?)),
        };
        let response = self
            .client
            .post_json::<WallKeyResponse, _>("/wall/rotate", &request)
            .await?;
        Ok(CreatedWall {
            wall_id: response.wall_id,
            wall_slug: response.wall_slug,
            key_version: response.key_version,
            wall_key: next_wall_key,
            encrypted_wall_key: request.encrypted_wall_key,
            encrypted_profile: request.encrypted_profile.unwrap_or_default(),
        })
    }

    pub async fn presign_post_upload(&self, size: usize) -> Result<PresignUploadResponse> {
        let request = PresignUploadRequest {
            size: size as i64,
            purpose: None,
            wall_id: None,
        };
        self.client
            .post_json("/wall/uploads/presign", &request)
            .await
            .map_err(Into::into)
    }

    pub async fn presign_avatar_upload(
        &self,
        wall_id: &str,
        size: usize,
    ) -> Result<PresignUploadResponse> {
        let request = PresignUploadRequest {
            size: size as i64,
            purpose: Some(UPLOAD_PURPOSE_AVATAR.to_owned()),
            wall_id: Some(wall_id.to_owned()),
        };
        self.client
            .post_json("/wall/uploads/presign", &request)
            .await
            .map_err(Into::into)
    }

    pub async fn upload_bytes(&self, presign: &PresignUploadResponse, body: &[u8]) -> Result<()> {
        let headers: Vec<(&str, String)> = presign
            .headers
            .iter()
            .map(|(key, value)| (key.as_str(), value.clone()))
            .collect();
        self.client
            .object_store()
            .put_bytes(&presign.url, body, &headers)
            .await
            .map_err(Into::into)
    }

    pub async fn upload_post_asset(
        &self,
        post_key: &[u8],
        plaintext: &[u8],
        position: Option<i32>,
    ) -> Result<PostObjectPayload> {
        let encrypted = encrypt_asset_payload(post_key, plaintext)?;
        let presign = self.presign_post_upload(encrypted.len()).await?;
        self.upload_bytes(&presign, &encrypted).await?;
        Ok(PostObjectPayload {
            object_key: presign.object_key,
            size: Some(encrypted.len() as i64),
            position,
            blur_hash_cipher: None,
            variant: None,
            width: None,
            height: None,
            media_type: None,
        })
    }

    pub async fn upload_post_photo_asset(
        &self,
        post_key: &[u8],
        plaintext: &[u8],
        width: Option<i32>,
        height: Option<i32>,
        media_type: Option<String>,
    ) -> Result<PostObjectPayload> {
        let mut object = self.upload_post_asset(post_key, plaintext, Some(0)).await?;
        object.width = width.filter(|value| *value > 0);
        object.height = height.filter(|value| *value > 0);
        object.media_type = media_type.filter(|value| !value.trim().is_empty());
        Ok(object)
    }

    pub async fn upload_avatar(
        &self,
        wall_id: &str,
        wall_key: &[u8],
        plaintext: &[u8],
    ) -> Result<ProfileAvatarPayload> {
        let encrypted = encrypt_asset_payload(wall_key, plaintext)?;
        let presign = self.presign_avatar_upload(wall_id, encrypted.len()).await?;
        self.upload_bytes(&presign, &encrypted).await?;
        Ok(ProfileAvatarPayload {
            object_key: presign.object_key,
            size: Some(encrypted.len() as i64),
        })
    }

    pub async fn get_asset_url(
        &self,
        wall_id: &str,
        object_key: &str,
    ) -> Result<AssetDownloadResponse> {
        let query = vec![
            ("wallId", wall_id.to_owned()),
            ("objectKey", object_key.to_owned()),
        ];
        self.client
            .get_json("/wall/assets/redirect", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn download_encrypted_asset(
        &self,
        wall_id: &str,
        object_key: &str,
    ) -> Result<Vec<u8>> {
        let download = self.get_asset_url(wall_id, object_key).await?;
        self.client
            .object_store()
            .get_bytes(&download.url)
            .await
            .map_err(Into::into)
    }

    pub async fn download_decrypted_asset(
        &self,
        wall_id: &str,
        object_key: &str,
        key: &[u8],
    ) -> Result<Vec<u8>> {
        let encrypted = self.download_encrypted_asset(wall_id, object_key).await?;
        crate::crypto::decrypt_asset_payload(key, &encrypted)
    }

    pub fn generate_post_key(&self) -> Vec<u8> {
        generate_key()
    }

    pub async fn create_post(
        &self,
        wall_id: &str,
        objects: &[PostObjectPayload],
        caption_plaintext: Option<&[u8]>,
        post_key: Option<&[u8]>,
    ) -> Result<(i64, Vec<u8>)> {
        let access = self
            .resolve_owned_wall_access(wall_id)
            .await?
            .ok_or_else(|| {
                WallError::InvalidInput(format!("wall {wall_id} is not owned by the account"))
            })?;
        let post_key_bytes = post_key.map_or_else(generate_key, ToOwned::to_owned);
        let caption_cipher = match caption_plaintext {
            Some(value) => Some(encode_b64(&encrypt_secretbox_packed(
                &post_key_bytes,
                value,
            )?)),
            None => None,
        };
        let request = CreatePostRequest {
            wall_id: wall_id.to_owned(),
            encrypted_post_key: encode_b64(&encrypt_secretbox_packed(
                &access.wall_key,
                &post_key_bytes,
            )?),
            key_version: access.key_version,
            caption_cipher,
            objects: objects.to_vec(),
        };
        let response = self
            .client
            .post_json::<CreatePostResponse, _>("/wall/posts", &request)
            .await?;
        Ok((response.post_id, post_key_bytes))
    }

    pub async fn list_posts(
        &self,
        wall_id: &str,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<PostPage> {
        let mut query = vec![("wallId", wall_id.to_owned())];
        if let Some(value) = cursor.filter(|value| !value.trim().is_empty()) {
            query.push(("cursor", value));
        }
        if let Some(value) = limit {
            query.push(("limit", value.to_string()));
        }
        self.client
            .get_json("/wall/posts", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn list_feed(&self, cursor: Option<String>, limit: Option<i32>) -> Result<FeedPage> {
        let mut query = Vec::new();
        if let Some(value) = cursor.filter(|value| !value.trim().is_empty()) {
            query.push(("cursor", value));
        }
        if let Some(value) = limit {
            query.push(("limit", value.to_string()));
        }
        self.client
            .get_json("/wall/feed", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn unread_status(&self) -> Result<WallUnreadStatusResponse> {
        self.client
            .get_json("/wall/unread", &[])
            .await
            .map_err(Into::into)
    }

    pub async fn mark_feed_read(&self, post_id: i64) -> Result<WallUnreadStatusResponse> {
        if post_id <= 0 {
            return Err(WallError::InvalidInput("post id is required".into()));
        }
        self.client
            .post_json("/wall/feed/read", &MarkFeedReadRequest { post_id })
            .await
            .map_err(Into::into)
    }

    pub async fn mark_notifications_read(
        &self,
        friend_wall_id: impl Into<String>,
    ) -> Result<WallUnreadStatusResponse> {
        let friend_wall_id = friend_wall_id.into();
        if friend_wall_id.trim().is_empty() {
            return Err(WallError::InvalidInput("friend wall id is required".into()));
        }
        self.client
            .post_json(
                "/wall/messages/read",
                &MarkNotificationsReadRequest { friend_wall_id },
            )
            .await
            .map_err(Into::into)
    }

    pub async fn get_post(&self, post_id: i64) -> Result<PostResponse> {
        let path = format!("/wall/posts/{post_id}");
        self.client.get_json(&path, &[]).await.map_err(Into::into)
    }

    pub async fn fetch_post_decrypted(&self, post_id: i64) -> Result<DecryptedPost> {
        let post = self.get_post(post_id).await?;
        self.decrypt_post_for_wall(&post.wall_id, &post).await
    }

    pub async fn download_post_asset(&self, post_id: i64, object_key: &str) -> Result<Vec<u8>> {
        let post = self.get_post(post_id).await?;
        let decrypted = self.decrypt_post_for_wall(&post.wall_id, &post).await?;
        self.download_decrypted_asset(&post.wall_id, object_key, &decrypted.post_key)
            .await
    }

    pub async fn hydrate_wall_keys(&self) -> Result<HydratedKeys> {
        let root_wall_key = self.get_root_wall_key().await?;
        let owned_records = self.list_owned_walls().await?;
        let mut owned = Vec::with_capacity(owned_records.len());
        if let Some(root_wall_key) = root_wall_key {
            for record in owned_records {
                let packed = decode_b64(&record.encrypted_wall_key)?;
                let wall_key = decrypt_secretbox_packed(&root_wall_key, &packed)?;
                owned.push((record.wall_id, wall_key));
            }
        }

        let friends_records = self.list_friend_shares().await?;
        let mut friends = Vec::with_capacity(friends_records.len());
        for record in &friends_records {
            friends.push(self.decrypt_friend_share(record)?);
        }

        Ok(HydratedKeys { owned, friends })
    }

    pub fn decrypt_post_key(&self, wall_key: &[u8], post: &PostResponse) -> Result<Vec<u8>> {
        let packed = decode_b64(&post.encrypted_post_key)?;
        decrypt_secretbox_packed(wall_key, &packed)
    }

    pub fn decrypt_post(&self, wall_key: &[u8], post: &PostResponse) -> Result<DecryptedPost> {
        let post_key = self.decrypt_post_key(wall_key, post)?;
        let caption_plaintext = if post.caption_cipher.is_empty() {
            None
        } else {
            let packed = decode_b64(&post.caption_cipher)?;
            Some(decrypt_secretbox_packed(&post_key, &packed)?)
        };
        Ok(DecryptedPost {
            post_key,
            caption_plaintext,
        })
    }

    pub fn decrypt_blur_hash(
        &self,
        post_key: &[u8],
        object: &PostObjectPayload,
    ) -> Result<Option<String>> {
        let Some(cipher) = object.blur_hash_cipher.as_deref() else {
            return Ok(None);
        };
        let packed = decode_b64(cipher)?;
        let plaintext = decrypt_secretbox_packed(post_key, &packed)?;
        let blur_hash = String::from_utf8(plaintext)
            .map_err(|err| WallError::InvalidInput(format!("invalid blur hash utf8: {err}")))?;
        Ok(Some(blur_hash))
    }

    pub async fn decrypt_post_for_wall(
        &self,
        wall_id: &str,
        post: &PostResponse,
    ) -> Result<DecryptedPost> {
        let wall_key = self
            .resolve_wall_key_for_version(wall_id, Some(post.key_version))
            .await?
            .ok_or_else(|| {
                WallError::InvalidInput(format!("no wall key available for post {}", post.post_id))
            })?;
        self.decrypt_post(&wall_key, post)
    }

    pub async fn decrypt_actor_profile(
        &self,
        actor: &WallActorResponse,
    ) -> Result<Option<Vec<u8>>> {
        if actor.encrypted_profile.trim().is_empty()
            || actor.wall_id.trim().is_empty()
            || actor.key_version <= 0
        {
            return Ok(None);
        }
        let Some(wall_key) = self
            .resolve_wall_key_for_version(&actor.wall_id, Some(actor.key_version))
            .await?
        else {
            return Ok(None);
        };
        Ok(Some(decrypt_secretbox_packed(
            &wall_key,
            &decode_b64(&actor.encrypted_profile)?,
        )?))
    }

    pub async fn decrypt_feed_item(&self, item: &FeedItem) -> Result<DecryptedPost> {
        let post = post_response_from_feed_item(item);
        self.decrypt_post_for_wall(&item.wall_id, &post).await
    }

    pub async fn update_post_caption(
        &self,
        post_id: i64,
        post_key: &[u8],
        caption_plaintext: Option<&[u8]>,
    ) -> Result<()> {
        let request = UpdatePostCaptionRequest {
            caption_cipher: match caption_plaintext {
                Some(value) => Some(encode_b64(&encrypt_secretbox_packed(post_key, value)?)),
                None => None,
            },
        };
        let path = format!("/wall/posts/{post_id}/caption");
        self.client
            .post_empty(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub async fn delete_post(&self, post_id: i64) -> Result<()> {
        let path = format!("/wall/posts/{post_id}");
        self.client
            .delete_empty(&path, &[])
            .await
            .map_err(Into::into)
    }

    pub async fn like_post(&self, post_id: i64, like: bool) -> Result<LikePostResponse> {
        let path = format!("/wall/posts/{post_id}/like");
        let request = LikePostRequest { like };
        self.client
            .post_json(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub async fn list_post_likers(
        &self,
        post_id: i64,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<ListPostLikersResponse> {
        let mut query = Vec::new();
        if let Some(value) = cursor.filter(|value| !value.trim().is_empty()) {
            query.push(("cursor", value));
        }
        if let Some(value) = limit {
            query.push(("limit", value.to_string()));
        }
        let path = format!("/wall/posts/{post_id}/likes");
        self.client
            .get_json(&path, &query)
            .await
            .map_err(Into::into)
    }

    pub async fn list_message_conversations(
        &self,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<MessageConversationPage> {
        let mut query = Vec::new();
        if let Some(value) = cursor.filter(|value| !value.trim().is_empty()) {
            query.push(("cursor", value));
        }
        if let Some(value) = limit {
            query.push(("limit", value.to_string()));
        }
        self.client
            .get_json("/wall/messages", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn list_message_thread(
        &self,
        wall_id: &str,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<MessagePage> {
        let mut query = Vec::new();
        if let Some(value) = cursor.filter(|value| !value.trim().is_empty()) {
            query.push(("cursor", value));
        }
        if let Some(value) = limit {
            query.push(("limit", value.to_string()));
        }
        let path = format!("/wall/messages/{wall_id}");
        self.client
            .get_json(&path, &query)
            .await
            .map_err(Into::into)
    }

    pub async fn send_message(&self, wall_id: &str, text: &str) -> Result<MessageResponse> {
        let friend = self.friend_actor_for_wall(wall_id).await?;
        let payload = MessagePayload {
            version: 1,
            kind: MESSAGE_KIND_REGULAR.to_owned(),
            text: text.to_owned(),
            quote: None,
        };
        let request = self.message_request_for_payload(&friend.public_key, &payload, None)?;
        let path = format!("/wall/messages/{wall_id}");
        self.client
            .post_json(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub async fn reply_to_message(
        &self,
        wall_id: &str,
        message_id: &str,
        text: &str,
    ) -> Result<MessageResponse> {
        let reply_message_id = message_id.trim();
        if reply_message_id.is_empty() {
            return Err(WallError::InvalidInput("message id is required".into()));
        }
        let friend = self.friend_actor_for_wall(wall_id).await?;
        let payload = MessagePayload {
            version: 1,
            kind: MESSAGE_KIND_REGULAR.to_owned(),
            text: text.to_owned(),
            quote: None,
        };
        let request =
            self.message_request_for_payload(&friend.public_key, &payload, Some(reply_message_id))?;
        let path = format!("/wall/messages/{wall_id}");
        self.client
            .post_json(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub async fn reply_to_post(&self, post_id: i64, text: &str) -> Result<MessageResponse> {
        let post = self.get_post(post_id).await?;
        if Some(post.owner_user_id) == self.user_id {
            return Err(WallError::InvalidInput(
                "cannot reply to your own post".into(),
            ));
        }
        if post.author.public_key.trim().is_empty() {
            return Err(WallError::InvalidInput(
                "post author public key is missing".into(),
            ));
        }
        let decrypted = self.decrypt_post_for_wall(&post.wall_id, &post).await?;
        let caption = optional_utf8(decrypted.caption_plaintext, "caption")?;
        let object = post.objects.first();
        let payload = MessagePayload {
            version: 1,
            kind: MESSAGE_KIND_POST_REPLY.to_owned(),
            text: text.to_owned(),
            quote: Some(MessageQuote {
                post_id,
                wall_id: post.wall_id.clone(),
                caption,
                object_key: object.map(|value| value.object_key.clone()),
                width: object.and_then(|value| value.width),
                height: object.and_then(|value| value.height),
                media_type: object.and_then(|value| value.media_type.clone()),
            }),
        };
        let request = self.message_request_for_payload(&post.author.public_key, &payload, None)?;
        let path = format!("/wall/posts/{post_id}/reply");
        self.client
            .post_json(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub fn decrypt_message(&self, message: &MessageResponse) -> Result<DecryptedMessage> {
        if message.is_deleted {
            return Err(WallError::InvalidInput("message is deleted".into()));
        }
        let packed_key = decode_b64(&message.encrypted_message_key)?;
        let (sealed_key, _) = unpack_payload(&packed_key)?;
        let message_key = sealed::open(&sealed_key, &self.public_key, &self.private_key)?;
        let packed_message = decode_b64(&message.message_cipher)?;
        let plaintext = decrypt_secretbox_packed(&message_key, &packed_message)?;
        let payload: MessagePayload = serde_json::from_slice(&plaintext)
            .map_err(|err| WallError::InvalidInput(format!("invalid message payload: {err}")))?;
        Ok(DecryptedMessage {
            message_key,
            payload,
        })
    }

    pub async fn like_message(&self, message_id: &str, like: bool) -> Result<LikeMessageResponse> {
        let message_id = message_id.trim();
        if message_id.is_empty() {
            return Err(WallError::InvalidInput("message id is required".into()));
        }
        let request = LikeMessageRequest { like };
        let path = format!("/wall/message/{message_id}/like");
        self.client
            .post_json(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub async fn delete_message(&self, message_id: &str) -> Result<()> {
        let message_id = message_id.trim();
        if message_id.is_empty() {
            return Err(WallError::InvalidInput("message id is required".into()));
        }
        let path = format!("/wall/message/{message_id}");
        self.client
            .delete_empty(&path, &[])
            .await
            .map_err(Into::into)
    }

    async fn friend_actor_for_wall(&self, wall_id: &str) -> Result<WallActorResponse> {
        let (owned_wall, _) = self.default_owned_wall_access().await?;
        let friends = self.list_wall_friends(&owned_wall.wall_id).await?;
        friends
            .into_iter()
            .map(|value| value.friend)
            .find(|friend| friend.wall_id == wall_id)
            .ok_or_else(|| WallError::InvalidInput(format!("wall {wall_id} is not a friend")))
    }

    fn message_request_for_payload(
        &self,
        recipient_public_key: &str,
        payload: &MessagePayload,
        reply_message_id: Option<&str>,
    ) -> Result<CreateMessageRequest> {
        let recipient_public_key = decode_b64(recipient_public_key)?;
        let message_key = generate_key();
        let plaintext = serde_json::to_vec(payload)
            .map_err(|err| WallError::InvalidInput(format!("invalid message payload: {err}")))?;
        let sender_key = sealed::seal(&message_key, &self.public_key)?;
        let recipient_key = sealed::seal(&message_key, &recipient_public_key)?;
        Ok(CreateMessageRequest {
            message_id: None,
            message_cipher: encode_b64(&encrypt_secretbox_packed(&message_key, &plaintext)?),
            sender_encrypted_message_key: encode_b64(&pack_payload(&sender_key, &[])),
            recipient_encrypted_message_key: encode_b64(&pack_payload(&recipient_key, &[])),
            reply_message_id: reply_message_id.map(ToOwned::to_owned),
        })
    }

    pub async fn add_friend_from_link(&self, link: &WallLinkCtx) -> Result<FriendStatusResponse> {
        if link.owner_public_key().is_empty() {
            return Err(WallError::InvalidInput(
                "target public key is required".into(),
            ));
        }
        let (requester_wall, requester_wall_key) = self.default_owned_wall_access().await?;
        let target_share = sealed::seal(link.wall_key(), &self.public_key)?;
        let requester_share = sealed::seal(&requester_wall_key, link.owner_public_key())?;
        let payload = AddFriendPayload {
            target_wall_id: link.wall_id().to_owned(),
            link_session_token: link.session_token().to_owned(),
            requester_wall_id: requester_wall.wall_id,
            target_encrypted_wall_key: encode_b64(&pack_payload(&target_share, &[])),
            target_key_version: link.key_version(),
            requester_encrypted_wall_key: encode_b64(&pack_payload(&requester_share, &[])),
            requester_key_version: requester_wall.key_version,
        };
        self.client
            .post_json("/wall/friends/add", &payload)
            .await
            .map_err(Into::into)
    }

    pub async fn unfriend_by_wall(&self, wall_id: &str) -> Result<()> {
        let request = FriendTargetPayload {
            target_username: None,
            target_wall_id: Some(wall_id.to_owned()),
        };
        self.client
            .post_empty("/wall/friends/unfriend", &request)
            .await
            .map_err(Into::into)
    }

    pub async fn unfriend_by_username(&self, username: &str) -> Result<()> {
        let request = FriendTargetPayload {
            target_username: Some(username.to_owned()),
            target_wall_id: None,
        };
        self.client
            .post_empty("/wall/friends/unfriend", &request)
            .await
            .map_err(Into::into)
    }

    pub async fn list_wall_friends(&self, wall_id: &str) -> Result<Vec<WallFriendResponse>> {
        let query = vec![("wallId", wall_id.to_owned())];
        self.client
            .get_json("/wall/friends", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn get_relationship(
        &self,
        target_wall_id: &str,
    ) -> Result<FriendRelationshipResponse> {
        let query = vec![("targetWallId", target_wall_id.to_owned())];
        self.client
            .get_json("/wall/friends/relationship", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn refresh_friend_shares(&self, wall_id: &str) -> Result<usize> {
        let access = self
            .resolve_owned_wall_access(wall_id)
            .await?
            .ok_or_else(|| {
                WallError::InvalidInput(format!("wall {wall_id} is not owned by the account"))
            })?;
        let friends = self.list_wall_friends(wall_id).await?;
        let mut updates = Vec::new();
        for friend in friends {
            if friend.share_key_version == access.key_version {
                continue;
            }
            let public_key = decode_b64(&friend.friend.public_key)?;
            let sealed_share = sealed::seal(&access.wall_key, &public_key)?;
            updates.push(ShareUpdatePayload {
                friend_id: friend.friend.user_id,
                encrypted_wall_key: encode_b64(&pack_payload(&sealed_share, &[])),
            });
        }
        if updates.is_empty() {
            return Ok(0);
        }
        let payload = RefreshFriendSharesRequest {
            wall_id: wall_id.to_owned(),
            key_version: access.key_version,
            shares: updates,
        };
        let updated = payload.shares.len();
        self.client
            .post_empty("/wall/friends/shares/refresh", &payload)
            .await?;
        Ok(updated)
    }

    pub async fn get_wall_link_status(&self, wall_id: &str) -> Result<WallLinkStatusResponse> {
        let path = format!("/wall/links/{wall_id}");
        self.client.get_json(&path, &[]).await.map_err(Into::into)
    }

    pub async fn create_wall_link(&self, wall_id: &str) -> Result<CreatedWallLink> {
        let access = self
            .resolve_owned_wall_access(wall_id)
            .await?
            .ok_or_else(|| {
                WallError::InvalidInput(format!("wall {wall_id} is not owned by the account"))
            })?;
        let access_key = derive_wall_link_access_key(wall_id, &access.wall_key)?;
        let access_key_material = wall_link_access_key_material(&access_key)?;
        let auth_key = derive_wall_link_auth_key(&access_key_material)?;
        let wrap_key = derive_wall_link_wrap_key(&access_key_material)?;
        let request = WallLinkCreateRequest {
            wall_id: wall_id.to_owned(),
            auth_key: encode_b64(&auth_key),
            key_version: access.key_version,
            encrypted_wall_key: encode_b64(&encrypt_secretbox_packed(&wrap_key, &access.wall_key)?),
        };
        let status: WallLinkStatusResponse = self.client.post_json("/wall/links", &request).await?;
        Ok(CreatedWallLink {
            access_key,
            wall_username: status.wall_slug.clone(),
            wall_id: wall_id.to_owned(),
            wall_slug: status.wall_slug,
            key_version: status.key_version,
        })
    }

    pub async fn delete_wall_link(&self, wall_id: &str) -> Result<()> {
        let path = format!("/wall/links/{wall_id}");
        self.client.delete_empty(&path, &[]).await?;
        Ok(())
    }

    async fn resolve_owned_wall_access(&self, wall_id: &str) -> Result<Option<ResolvedWallAccess>> {
        let root_wall_key = match self.get_root_wall_key().await? {
            Some(value) => value,
            None => return Ok(None),
        };
        let walls = self.list_owned_walls().await?;
        let Some(record) = walls.into_iter().find(|value| value.wall_id == wall_id) else {
            return Ok(None);
        };
        let packed = decode_b64(&record.encrypted_wall_key)?;
        let wall_key = decrypt_secretbox_packed(&root_wall_key, &packed)?;
        Ok(Some(ResolvedWallAccess {
            wall_key,
            key_version: record.key_version,
        }))
    }

    async fn resolve_shared_wall_access(
        &self,
        wall_id: &str,
    ) -> Result<Option<ResolvedWallAccess>> {
        let shares = self.list_friend_shares().await?;
        let Some(record) = shares.into_iter().find(|value| value.wall_id == wall_id) else {
            return Ok(None);
        };
        let share = self.decrypt_friend_share(&record)?;
        Ok(Some(ResolvedWallAccess {
            wall_key: share.wall_key,
            key_version: share.key_version,
        }))
    }

    async fn resolve_wall_access(&self, wall_id: &str) -> Result<Option<ResolvedWallAccess>> {
        if let Some(access) = self.resolve_owned_wall_access(wall_id).await? {
            return Ok(Some(access));
        }
        self.resolve_shared_wall_access(wall_id).await
    }

    async fn resolve_wall_key_for_version(
        &self,
        wall_id: &str,
        version: Option<i32>,
    ) -> Result<Option<Vec<u8>>> {
        let access = match self.resolve_wall_access(wall_id).await? {
            Some(value) => value,
            None => return Ok(None),
        };
        let target_version = version.unwrap_or(access.key_version);
        if target_version == access.key_version {
            return Ok(Some(access.wall_key));
        }
        let history = self.build_wall_key_history_for_wall(wall_id).await?;
        Ok(history.get(&target_version).cloned())
    }
}

fn post_response_from_feed_item(item: &FeedItem) -> PostResponse {
    PostResponse {
        post_id: item.post_id,
        wall_id: item.wall_id.clone(),
        wall_slug: item.wall_slug.clone(),
        owner_user_id: item.owner_user_id,
        author: item.author.clone(),
        encrypted_post_key: item.encrypted_post_key.clone(),
        caption_cipher: item.caption_cipher.clone(),
        key_version: item.key_version,
        objects: item.objects.clone(),
        created_at: item.created_at.clone(),
        likes: item.likes,
        viewer_liked: item.viewer_liked,
        viewer_unread: item.viewer_unread,
    }
}

fn optional_utf8(bytes: Option<Vec<u8>>, field: &str) -> Result<Option<String>> {
    bytes
        .map(|value| {
            String::from_utf8(value)
                .map_err(|err| WallError::InvalidInput(format!("invalid {field} utf8: {err}")))
        })
        .transpose()
}

impl WallLinkCtx {
    pub async fn open(input: OpenWallLinkCtxInput) -> Result<Self> {
        let access_key_material = wall_link_access_key_material(&input.access_key)?;
        let auth_key = derive_wall_link_auth_key(&access_key_material)?;
        let wrap_key = derive_wall_link_wrap_key(&access_key_material)?;
        let client = build_http_client(
            &input.base_url,
            None,
            input.user_agent,
            input.client_package,
            input.client_version,
        )?;
        let lookup_path = format!(
            "/wall/public/by-slug/{}",
            urlencoding::encode(input.wall_username.trim().trim_start_matches('@'))
        );
        let lookup: WallLookupResponse = client.get_json(&lookup_path, &[]).await?;
        let response = client
            .post_json::<WallLinkLoginResponse, _>(
                "/wall/links/session",
                &WallLinkLoginRequest {
                    wall_id: lookup.wall_id,
                    auth_key: encode_b64(&auth_key),
                },
            )
            .await?;
        client.set_auth_token(Some(response.session_token.clone()));
        let wall_key =
            decrypt_secretbox_packed(&wrap_key, &decode_b64(&response.encrypted_wall_key)?)?;
        Ok(Self {
            client,
            session_token: response.session_token,
            owner_handle: response.owner,
            wall_id: response.wall_id,
            wall_slug: response.wall_slug,
            owner_public_key: if response.public_key.trim().is_empty() {
                Vec::new()
            } else {
                decode_b64(&response.public_key)?
            },
            wall_key,
            key_version: response.key_version,
        })
    }

    pub fn client(&self) -> &HttpClient {
        &self.client
    }

    pub fn session_token(&self) -> &str {
        &self.session_token
    }

    pub fn owner(&self) -> &str {
        &self.owner_handle
    }

    pub fn wall_id(&self) -> &str {
        &self.wall_id
    }

    pub fn wall_slug(&self) -> &str {
        &self.wall_slug
    }

    pub fn owner_public_key(&self) -> &[u8] {
        &self.owner_public_key
    }

    pub fn key_version(&self) -> i32 {
        self.key_version
    }

    pub fn wall_key(&self) -> &[u8] {
        &self.wall_key
    }

    pub async fn get_wall_profile_raw(&self, version: Option<i32>) -> Result<WallProfileResponse> {
        let mut query = vec![("wallId", self.wall_id.clone())];
        if let Some(value) = version {
            query.push(("version", value.to_string()));
        }
        self.client
            .get_json("/wall/profile", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn get_wall_profile_decrypted(
        &self,
        version: Option<i32>,
    ) -> Result<DecryptedWallProfile> {
        let profile = self.get_wall_profile_raw(version).await?;
        let wall_key = self
            .resolve_wall_key_for_version(Some(profile.version))
            .await?
            .ok_or_else(|| {
                WallError::InvalidInput(format!("missing wall key for version {}", profile.version))
            })?;
        decrypt_wall_profile(&profile, &wall_key)
    }

    pub async fn list_posts(&self, cursor: Option<String>, limit: Option<i32>) -> Result<PostPage> {
        let mut query = vec![("wallId", self.wall_id.clone())];
        if let Some(value) = cursor.filter(|value| !value.trim().is_empty()) {
            query.push(("cursor", value));
        }
        if let Some(value) = limit {
            query.push(("limit", value.to_string()));
        }
        self.client
            .get_json("/wall/posts", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn get_post(&self, post_id: i64) -> Result<PostResponse> {
        let path = format!("/wall/posts/{post_id}");
        self.client.get_json(&path, &[]).await.map_err(Into::into)
    }

    pub async fn decrypt_post_key(&self, post: &PostResponse) -> Result<Vec<u8>> {
        let wall_key = self
            .resolve_wall_key_for_version(Some(post.key_version))
            .await?
            .ok_or_else(|| {
                WallError::InvalidInput(format!("missing wall key for post {}", post.post_id))
            })?;
        let packed = decode_b64(&post.encrypted_post_key)?;
        decrypt_secretbox_packed(&wall_key, &packed)
    }

    pub async fn decrypt_post(&self, post: &PostResponse) -> Result<DecryptedPost> {
        let post_key = self.decrypt_post_key(post).await?;
        let caption_plaintext = if post.caption_cipher.is_empty() {
            None
        } else {
            Some(decrypt_secretbox_packed(
                &post_key,
                &decode_b64(&post.caption_cipher)?,
            )?)
        };
        Ok(DecryptedPost {
            post_key,
            caption_plaintext,
        })
    }

    pub async fn decrypt_actor_profile(
        &self,
        actor: &WallActorResponse,
    ) -> Result<Option<Vec<u8>>> {
        if actor.encrypted_profile.trim().is_empty()
            || actor.wall_id != self.wall_id
            || actor.key_version <= 0
        {
            return Ok(None);
        }
        let Some(wall_key) = self
            .resolve_wall_key_for_version(Some(actor.key_version))
            .await?
        else {
            return Ok(None);
        };
        Ok(Some(decrypt_secretbox_packed(
            &wall_key,
            &decode_b64(&actor.encrypted_profile)?,
        )?))
    }

    pub async fn download_post_asset(&self, post_id: i64, object_key: &str) -> Result<Vec<u8>> {
        let post = self.get_post(post_id).await?;
        let decrypted = self.decrypt_post(&post).await?;
        self.download_decrypted_asset(object_key, &decrypted.post_key)
            .await
    }

    pub async fn list_post_likers(
        &self,
        post_id: i64,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<ListPostLikersResponse> {
        let mut query = Vec::new();
        if let Some(value) = cursor.filter(|value| !value.trim().is_empty()) {
            query.push(("cursor", value));
        }
        if let Some(value) = limit {
            query.push(("limit", value.to_string()));
        }
        let path = format!("/wall/posts/{post_id}/likes");
        self.client
            .get_json(&path, &query)
            .await
            .map_err(Into::into)
    }

    pub async fn list_wall_key_versions(&self) -> Result<Vec<WallKeyVersionResponse>> {
        let query = vec![("wallId", self.wall_id.clone())];
        self.client
            .get_json("/wall/versions", &query)
            .await
            .map_err(Into::into)
    }

    pub fn build_wall_key_history(
        &self,
        versions: &[WallKeyVersionResponse],
    ) -> Result<BTreeMap<i32, Vec<u8>>> {
        build_wall_key_history_map(self.key_version, &self.wall_key, versions)
    }

    pub async fn get_asset_url(&self, object_key: &str) -> Result<AssetDownloadResponse> {
        let query = vec![
            ("wallId", self.wall_id.clone()),
            ("objectKey", object_key.to_owned()),
        ];
        self.client
            .get_json("/wall/assets/redirect", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn download_encrypted_asset(&self, object_key: &str) -> Result<Vec<u8>> {
        let download = self.get_asset_url(object_key).await?;
        self.client
            .object_store()
            .get_bytes(&download.url)
            .await
            .map_err(Into::into)
    }

    pub async fn download_decrypted_asset(&self, object_key: &str, key: &[u8]) -> Result<Vec<u8>> {
        let encrypted = self.download_encrypted_asset(object_key).await?;
        crate::crypto::decrypt_asset_payload(key, &encrypted)
    }

    async fn resolve_wall_key_for_version(&self, version: Option<i32>) -> Result<Option<Vec<u8>>> {
        let target_version = version.unwrap_or(self.key_version);
        if target_version == self.key_version {
            return Ok(Some(self.wall_key.clone()));
        }
        let versions = self.list_wall_key_versions().await?;
        let history = build_wall_key_history_map(self.key_version, &self.wall_key, &versions)?;
        Ok(history.get(&target_version).cloned())
    }
}

fn build_http_client(
    base_url: &str,
    auth_token: Option<String>,
    user_agent: Option<String>,
    client_package: Option<String>,
    client_version: Option<String>,
) -> Result<HttpClient> {
    HttpClient::new_with_config(HttpConfig {
        base_url: base_url.to_owned(),
        auth_token,
        user_agent,
        client_package,
        client_version,
        timeout_secs: Some(30),
    })
    .map_err(Into::into)
}

fn decrypt_private_key(master_key: &[u8], source: PrivateKeySource) -> Result<Vec<u8>> {
    match source {
        PrivateKeySource::Plain(value) => Ok(value),
        PrivateKeySource::EncryptedKeyAttributes(value) => {
            let ciphertext = decode_b64(&value.encrypted_secret_key)?;
            let nonce = decode_b64(&value.secret_key_decryption_nonce)?;
            secretbox::decrypt(&ciphertext, &nonce, master_key).map_err(Into::into)
        }
    }
}

fn decrypt_wall_profile(
    profile: &WallProfileResponse,
    wall_key: &[u8],
) -> Result<DecryptedWallProfile> {
    let profile_bytes = if profile.encrypted_profile.is_empty() {
        Vec::new()
    } else {
        decrypt_secretbox_packed(wall_key, &decode_b64(&profile.encrypted_profile)?)?
    };
    Ok(DecryptedWallProfile {
        wall_id: profile.wall_id.clone(),
        wall_slug: profile.wall_slug.clone(),
        version: profile.version,
        friends: profile.friends,
        profile: profile_bytes,
        avatar: profile.avatar.clone(),
        updated_at: if profile.updated_at.is_empty() {
            None
        } else {
            Some(profile.updated_at.clone())
        },
    })
}

fn build_wall_key_history_map(
    current_version: i32,
    current_key: &[u8],
    versions: &[WallKeyVersionResponse],
) -> Result<BTreeMap<i32, Vec<u8>>> {
    let mut history = BTreeMap::new();
    history.insert(current_version, current_key.to_vec());
    let mut ordered = versions.to_vec();
    ordered.sort_by(|left, right| right.version.cmp(&left.version));
    for entry in ordered {
        if entry.wrapped_prev_key.is_empty() || entry.version <= 1 {
            continue;
        }
        let Some(known_key) = history.get(&entry.version).cloned() else {
            continue;
        };
        let packed = decode_b64(&entry.wrapped_prev_key)?;
        let previous_key = decrypt_secretbox_packed(&known_key, &packed)?;
        history.insert(entry.version - 1, previous_key);
    }
    Ok(history)
}

#[cfg(test)]
mod tests {
    use super::*;

    use ente_core::crypto::{keys, sealed};
    use mockito::{Matcher, Server};
    use serde_json::json;

    fn test_account_ctx(base_url: &str) -> AccountWallCtx {
        let (public_key, private_key) = keys::generate_keypair().expect("valid keypair");
        AccountWallCtx::open(OpenAccountWallCtxInput {
            base_url: base_url.to_owned(),
            auth_token: "token".to_owned(),
            master_key: generate_key(),
            public_key,
            private_key_source: PrivateKeySource::Plain(private_key),
            user_id: Some(1),
            user_agent: None,
            client_package: None,
            client_version: None,
        })
        .expect("account wall ctx should open")
    }

    fn root_entity_response(master_key: &[u8], root_wall_key: &[u8]) -> String {
        let payload = encrypt_entity_key(master_key, root_wall_key).expect("root wall entity");
        json!({
            "type": ROOT_WALL_KEY_TYPE,
            "encryptedKey": payload.encrypted_key,
            "header": payload.header,
        })
        .to_string()
    }

    fn owned_wall_response(
        root_wall_key: &[u8],
        wall_key: &[u8],
        wall_id: &str,
        wall_slug: &str,
        key_version: i32,
    ) -> String {
        json!([{
            "wallId": wall_id,
            "wallSlug": wall_slug,
            "encryptedWallKey": encode_b64(
                &encrypt_secretbox_packed(root_wall_key, wall_key).expect("wall key wrap")
            ),
            "encryptedProfile": "",
            "keyVersion": key_version
        }])
        .to_string()
    }

    #[tokio::test]
    async fn get_or_create_root_wall_key_creates_when_missing() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let expected_root = generate_key();
        let ensure = server
            .mock("POST", "/user-entity/key/ensure")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &expected_root))
            .create_async()
            .await;

        let root = ctx
            .get_or_create_root_wall_key()
            .await
            .expect("root wall key should be created");

        assert_eq!(root, expected_root);
        ensure.assert_async().await;
    }

    #[tokio::test]
    async fn get_or_create_root_wall_key_uses_existing_key_from_ensure() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let expected_root = generate_key();

        let ensure = server
            .mock("POST", "/user-entity/key/ensure")
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &expected_root))
            .expect(1)
            .create_async()
            .await;

        let root = ctx
            .get_or_create_root_wall_key()
            .await
            .expect("root wall key should come from ensure response");
        assert_eq!(root, expected_root);
        ensure.assert_async().await;
    }

    #[tokio::test]
    async fn wall_link_open_decrypts_current_wall_key() {
        let mut server = Server::new_async().await;
        let wall_key = generate_key();
        let access_key = "AbC123xYz789";
        let access_key_material =
            wall_link_access_key_material(access_key).expect("access key material");
        let auth_key = derive_wall_link_auth_key(&access_key_material).expect("auth key");
        let wrap_key = derive_wall_link_wrap_key(&access_key_material).expect("wrap key");
        let encrypted_wall_key = encode_b64(
            &encrypt_secretbox_packed(&wrap_key, &wall_key).expect("encrypted wall key"),
        );

        let lookup = server
            .mock("GET", "/wall/public/by-slug/owner-gallery")
            .with_status(200)
            .with_body(
                json!({
                    "wallId": "wall_owner_gallery",
                    "wallSlug": "owner-gallery",
                    "owner": "owner-gallery",
                })
                .to_string(),
            )
            .create_async()
            .await;

        let session = server
            .mock("POST", "/wall/links/session")
            .match_body(Matcher::JsonString(
                json!({
                    "wallId": "wall_owner_gallery",
                    "authKey": encode_b64(&auth_key),
                })
                .to_string(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "sessionToken": "wall-link-token",
                    "wallId": "wall_owner_gallery",
                    "wallSlug": "owner-gallery",
                    "owner": "owner-handle",
                    "keyVersion": 3,
                    "encryptedWallKey": encrypted_wall_key,
                    "encryptedProfile": "",
                })
                .to_string(),
            )
            .create_async()
            .await;

        let ctx = WallLinkCtx::open(OpenWallLinkCtxInput {
            base_url: server.url(),
            wall_username: "@owner-gallery".to_owned(),
            access_key: access_key.to_owned(),
            user_agent: None,
            client_package: None,
            client_version: None,
        })
        .await
        .expect("wall link ctx should open");

        assert_eq!(ctx.wall_id(), "wall_owner_gallery");
        assert_eq!(ctx.wall_slug(), "owner-gallery");
        assert_eq!(ctx.key_version(), 3);
        assert_eq!(ctx.wall_key(), wall_key.as_slice());
        lookup.assert_async().await;
        session.assert_async().await;
    }

    #[tokio::test]
    async fn wall_link_open_rejects_wrong_access_key() {
        let mut server = Server::new_async().await;
        let wall_key = generate_key();
        let correct_access_key = "CorrectKey12";
        let wrong_access_key = "WrongKey1234";
        let correct_access_key_material =
            wall_link_access_key_material(correct_access_key).expect("correct access key material");
        let wrong_access_key_material =
            wall_link_access_key_material(wrong_access_key).expect("wrong access key material");
        let wrong_auth_key =
            derive_wall_link_auth_key(&wrong_access_key_material).expect("auth key");
        let correct_wrap_key =
            derive_wall_link_wrap_key(&correct_access_key_material).expect("wrap key");
        let encrypted_wall_key = encode_b64(
            &encrypt_secretbox_packed(&correct_wrap_key, &wall_key).expect("encrypted wall key"),
        );

        let lookup = server
            .mock("GET", "/wall/public/by-slug/owner-gallery")
            .with_status(200)
            .with_body(
                json!({
                    "wallId": "wall_owner_gallery",
                    "wallSlug": "owner-gallery",
                    "owner": "owner-gallery",
                })
                .to_string(),
            )
            .create_async()
            .await;

        let session = server
            .mock("POST", "/wall/links/session")
            .match_body(Matcher::JsonString(
                json!({
                    "wallId": "wall_owner_gallery",
                    "authKey": encode_b64(&wrong_auth_key),
                })
                .to_string(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "sessionToken": "wall-link-token",
                    "wallId": "wall_owner_gallery",
                    "wallSlug": "owner-gallery",
                    "owner": "owner-handle",
                    "keyVersion": 3,
                    "encryptedWallKey": encrypted_wall_key,
                })
                .to_string(),
            )
            .create_async()
            .await;

        let err = match WallLinkCtx::open(OpenWallLinkCtxInput {
            base_url: server.url(),
            wall_username: "owner-gallery".to_owned(),
            access_key: wrong_access_key.to_owned(),
            user_agent: None,
            client_package: None,
            client_version: None,
        })
        .await
        {
            Ok(_) => panic!("wrong access key should not decrypt wall key"),
            Err(err) => err,
        };

        assert!(matches!(err, WallError::Crypto(_)));
        lookup.assert_async().await;
        session.assert_async().await;
    }

    #[tokio::test]
    async fn wall_link_decrypt_post_key_uses_post_version() {
        let mut server = Server::new_async().await;
        let current_wall_key = generate_key();
        let previous_wall_key = generate_key();
        let post_key = generate_key();
        let wrapped_previous = encode_b64(
            &encrypt_secretbox_packed(&current_wall_key, &previous_wall_key)
                .expect("wrapped previous key"),
        );
        let versions = server
            .mock("GET", "/wall/versions")
            .match_header("x-auth-token", "link-token")
            .match_query(Matcher::UrlEncoded(
                "wallId".into(),
                "wall_owner_gallery".into(),
            ))
            .with_status(200)
            .with_body(
                json!([{
                    "version": 2,
                    "wrappedPrevKey": wrapped_previous,
                    "createdAt": "2026-04-16T00:00:00Z"
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let ctx = WallLinkCtx {
            client: build_http_client(
                &server.url(),
                Some("link-token".to_owned()),
                None,
                None,
                None,
            )
            .expect("http client"),
            session_token: "link-token".to_owned(),
            owner_handle: "owner".to_owned(),
            wall_id: "wall_owner_gallery".to_owned(),
            wall_slug: "owner-gallery".to_owned(),
            owner_public_key: Vec::new(),
            wall_key: current_wall_key,
            key_version: 2,
        };
        let post = PostResponse {
            post_id: 42,
            wall_id: "wall_owner_gallery".to_owned(),
            wall_slug: "owner-gallery".to_owned(),
            owner_user_id: 7,
            author: WallActorResponse {
                user_id: 7,
                wall_id: "wall_owner_gallery".to_owned(),
                wall_slug: "owner-gallery".to_owned(),
                key_version: 2,
                ..Default::default()
            },
            encrypted_post_key: encode_b64(
                &encrypt_secretbox_packed(&previous_wall_key, &post_key)
                    .expect("encrypted post key"),
            ),
            caption_cipher: String::new(),
            key_version: 1,
            objects: Vec::new(),
            created_at: "2026-04-16T00:00:00Z".to_owned(),
            likes: 0,
            viewer_liked: false,
            viewer_unread: false,
        };

        let decrypted = ctx
            .decrypt_post_key(&post)
            .await
            .expect("historical post key should decrypt");

        assert_eq!(decrypted, post_key);
        versions.assert_async().await;
    }

    #[tokio::test]
    async fn upload_post_asset_uses_presign_and_object_store() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());

        let presign = server
            .mock("POST", "/wall/uploads/presign")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::Regex("\"size\"".into()))
            .with_status(200)
            .with_body(
                json!({
                    "url": format!("{}/upload/object-1", server.url()),
                    "method": "PUT",
                    "headers": {
                        "content-type": "application/octet-stream"
                    },
                    "objectKey": "object-1",
                    "expiresIn": 300
                })
                .to_string(),
            )
            .create_async()
            .await;
        let upload = server
            .mock("PUT", "/upload/object-1")
            .match_header("content-type", "application/octet-stream")
            .with_status(200)
            .create_async()
            .await;

        let payload = ctx
            .upload_post_asset(&generate_key(), b"tiny-image", Some(0))
            .await
            .expect("upload should succeed");

        assert_eq!(payload.object_key, "object-1");
        assert_eq!(payload.position, Some(0));
        assert!(payload.size.unwrap_or_default() > 0);
        presign.assert_async().await;
        upload.assert_async().await;
    }

    #[tokio::test]
    async fn upload_post_photo_asset_attaches_photo_metadata() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let presign = server
            .mock("POST", "/wall/uploads/presign")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!({
                    "url": format!("{}/upload/photo-object", server.url()),
                    "method": "PUT",
                    "headers": {
                        "content-type": "application/octet-stream"
                    },
                    "objectKey": "photo-object",
                    "expiresIn": 300
                })
                .to_string(),
            )
            .create_async()
            .await;
        let upload = server
            .mock("PUT", "/upload/photo-object")
            .match_header("content-type", "application/octet-stream")
            .with_status(200)
            .create_async()
            .await;

        let payload = ctx
            .upload_post_photo_asset(
                &generate_key(),
                b"photo-bytes",
                Some(4032),
                Some(3024),
                Some("image/jpeg".to_owned()),
            )
            .await
            .expect("photo upload should succeed");

        assert_eq!(payload.object_key, "photo-object");
        assert_eq!(payload.position, Some(0));
        assert_eq!(payload.width, Some(4032));
        assert_eq!(payload.height, Some(3024));
        assert_eq!(payload.media_type.as_deref(), Some("image/jpeg"));
        presign.assert_async().await;
        upload.assert_async().await;
    }

    #[tokio::test]
    async fn upload_avatar_uses_avatar_presign_and_object_store() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let presign = server
            .mock("POST", "/wall/uploads/presign")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"purpose\":\"avatar\"".into()),
                Matcher::Regex("\"wallId\":\"wall_owner_main\"".into()),
                Matcher::Regex("\"size\"".into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "url": format!("{}/upload/avatar-object", server.url()),
                    "method": "PUT",
                    "headers": {
                        "content-type": "application/octet-stream"
                    },
                    "objectKey": "avatar-object",
                    "expiresIn": 300
                })
                .to_string(),
            )
            .create_async()
            .await;
        let upload = server
            .mock("PUT", "/upload/avatar-object")
            .match_header("content-type", "application/octet-stream")
            .with_status(200)
            .create_async()
            .await;

        let payload = ctx
            .upload_avatar("wall_owner_main", &generate_key(), b"avatar-bytes")
            .await
            .expect("avatar upload should succeed");

        assert_eq!(payload.object_key, "avatar-object");
        assert!(payload.size.unwrap_or_default() > 0);
        presign.assert_async().await;
        upload.assert_async().await;
    }

    #[tokio::test]
    async fn create_wall_with_key_sends_encrypted_wall_and_profile_payloads() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let wall_key = generate_key();
        let root_wall_key = generate_key();
        let ensure_root = server
            .mock("POST", "/user-entity/key/ensure")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"type\":\"wall\"".into()),
                Matcher::Regex("\"encryptedKey\":\"[^\"]+\"".into()),
                Matcher::Regex("\"header\":\"[^\"]+\"".into()),
            ]))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_wall_key))
            .create_async()
            .await;
        let create_wall = server
            .mock("POST", "/wall")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"wallSlug\":\"owner-main\"".into()),
                Matcher::Regex("\"encryptedWallKey\":\"[^\"]+\"".into()),
                Matcher::Regex("\"encryptedProfile\":\"[^\"]+\"".into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "wallId": "wall_owner_main",
                    "wallSlug": "owner-main",
                    "encryptedWallKey": "",
                    "encryptedProfile": "",
                    "keyVersion": 1
                })
                .to_string(),
            )
            .create_async()
            .await;

        let created = ctx
            .create_wall_with_key("owner-main", &wall_key, b"profile-json")
            .await
            .expect("wall should be created");

        assert_eq!(created.wall_id, "wall_owner_main");
        assert_eq!(created.wall_slug, "owner-main");
        assert_eq!(created.key_version, 1);
        let profile_plaintext =
            decrypt_secretbox_packed(&wall_key, &decode_b64(&created.encrypted_profile).unwrap())
                .expect("created profile should decrypt");
        assert_eq!(profile_plaintext, b"profile-json");
        ensure_root.assert_async().await;
        create_wall.assert_async().await;
    }

    #[tokio::test]
    async fn create_post_includes_wall_key_version() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_wall_key = generate_key();
        let wall_key = generate_key();
        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_WALL_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_wall_key))
            .create_async()
            .await;
        let walls = server
            .mock("GET", "/wall")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "wallId": "wall_owner_main",
                    "wallSlug": "owner-main",
                    "encryptedWallKey": encode_b64(&encrypt_secretbox_packed(&root_wall_key, &wall_key).expect("wall key wrap")),
                    "encryptedProfile": "",
                    "keyVersion": 3
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let create = server
            .mock("POST", "/wall/posts")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::Regex("\"keyVersion\":3".into()))
            .with_status(200)
            .with_body(json!({"postId": 42}).to_string())
            .create_async()
            .await;

        let (post_id, _) = ctx
            .create_post("wall_owner_main", &[], None, None)
            .await
            .expect("post creation should send key version");

        assert_eq!(post_id, 42);
        entity.assert_async().await;
        walls.assert_async().await;
        create.assert_async().await;
    }

    #[tokio::test]
    async fn update_wall_profile_sends_encrypted_profile_and_avatar_payload() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_wall_key = generate_key();
        let wall_key = generate_key();
        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_WALL_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_wall_key))
            .create_async()
            .await;
        let walls = server
            .mock("GET", "/wall")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(owned_wall_response(
                &root_wall_key,
                &wall_key,
                "wall_owner_main",
                "owner-main",
                3,
            ))
            .create_async()
            .await;
        let update = server
            .mock("POST", "/wall/profile")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"wallId\":\"wall_owner_main\"".into()),
                Matcher::Regex("\"encryptedProfile\":\"[^\"]+\"".into()),
                Matcher::Regex("\"avatar\"".into()),
                Matcher::Regex("\"objectKey\":\"avatar-object\"".into()),
                Matcher::Regex("\"size\":123".into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "status": "ok",
                    "avatar": {
                        "objectKey": "avatar-object",
                        "size": 123,
                        "updatedAt": "2026-04-16T00:00:00Z"
                    }
                })
                .to_string(),
            )
            .create_async()
            .await;

        let response = ctx
            .update_wall_profile(
                "wall_owner_main",
                b"profile-v2",
                Some(ProfileAvatarPayload {
                    object_key: "avatar-object".to_owned(),
                    size: Some(123),
                }),
                false,
            )
            .await
            .expect("profile update should succeed");

        assert_eq!(response.status, "ok");
        assert_eq!(
            response
                .avatar
                .as_ref()
                .map(|avatar| avatar.object_key.as_str()),
            Some("avatar-object")
        );
        entity.assert_async().await;
        walls.assert_async().await;
        update.assert_async().await;
    }

    #[tokio::test]
    async fn get_wall_profile_decrypted_loads_and_decrypts_profile() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_wall_key = generate_key();
        let wall_key = generate_key();
        let encrypted_profile = encode_b64(
            &encrypt_secretbox_packed(&wall_key, b"profile-json").expect("profile wrap"),
        );
        let profile = server
            .mock("GET", "/wall/profile")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "wallId".into(),
                "wall_owner_main".into(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "wallId": "wall_owner_main",
                    "wallSlug": "owner-main",
                    "version": 3,
                    "friends": 2,
                    "encryptedProfile": encrypted_profile,
                    "updatedAt": "2026-04-16T00:00:00Z"
                })
                .to_string(),
            )
            .create_async()
            .await;
        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_WALL_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_wall_key))
            .create_async()
            .await;
        let walls = server
            .mock("GET", "/wall")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(owned_wall_response(
                &root_wall_key,
                &wall_key,
                "wall_owner_main",
                "owner-main",
                3,
            ))
            .create_async()
            .await;

        let decrypted = ctx
            .get_wall_profile_decrypted("wall_owner_main", None)
            .await
            .expect("profile should decrypt");

        assert_eq!(decrypted.wall_id, "wall_owner_main");
        assert_eq!(decrypted.wall_slug, "owner-main");
        assert_eq!(decrypted.version, 3);
        assert_eq!(decrypted.friends, 2);
        assert_eq!(decrypted.profile, b"profile-json");
        profile.assert_async().await;
        entity.assert_async().await;
        walls.assert_async().await;
    }

    #[tokio::test]
    async fn add_friend_from_link_sends_reciprocal_wall_shares() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_wall_key = generate_key();
        let requester_wall_key = generate_key();
        let target_wall_key = generate_key();
        let (target_public_key, _) = keys::generate_keypair().expect("valid target keypair");
        let entity_payload =
            encrypt_entity_key(&ctx.master_key, &root_wall_key).expect("root wall entity");

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_WALL_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "type": ROOT_WALL_KEY_TYPE,
                    "encryptedKey": entity_payload.encrypted_key,
                    "header": entity_payload.header,
                })
                .to_string(),
            )
            .create_async()
            .await;
        let walls = server
            .mock("GET", "/wall")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "wallId": "wall_viewer_main",
                    "wallSlug": "viewer-main",
                    "encryptedWallKey": encode_b64(&encrypt_secretbox_packed(&root_wall_key, &requester_wall_key).expect("wall key wrap")),
                    "encryptedProfile": "",
                    "keyVersion": 4
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let add = server
            .mock("POST", "/wall/friends/add")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"targetWallId\":\"wall_owner_main\"".into()),
                Matcher::Regex("\"linkSessionToken\":\"link-session-token\"".into()),
                Matcher::Regex("\"requesterWallId\":\"wall_viewer_main\"".into()),
                Matcher::Regex("\"targetKeyVersion\":5".into()),
                Matcher::Regex("\"requesterKeyVersion\":4".into()),
                Matcher::Regex("\"targetEncryptedWallKey\":\"[^\"]+\"".into()),
                Matcher::Regex("\"requesterEncryptedWallKey\":\"[^\"]+\"".into()),
            ]))
            .with_status(200)
            .with_body(json!({"status": "friend"}).to_string())
            .create_async()
            .await;
        let link = WallLinkCtx {
            client: build_http_client(
                &server.url(),
                Some("link-session-token".to_owned()),
                None,
                None,
                None,
            )
            .expect("http client"),
            session_token: "link-session-token".to_owned(),
            owner_handle: "owner".to_owned(),
            wall_id: "wall_owner_main".to_owned(),
            wall_slug: "owner-main".to_owned(),
            owner_public_key: target_public_key,
            wall_key: target_wall_key,
            key_version: 5,
        };

        let response = ctx
            .add_friend_from_link(&link)
            .await
            .expect("direct friendship should send reciprocal shares");

        assert_eq!(response.status, "friend");
        entity.assert_async().await;
        walls.assert_async().await;
        add.assert_async().await;
    }

    #[tokio::test]
    async fn wall_status_mutations_accept_empty_server_responses() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());

        let delete_post = server
            .mock("DELETE", "/wall/posts/42")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .create_async()
            .await;
        let unfriend_wall = server
            .mock("POST", "/wall/friends/unfriend")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(
                json!({"targetWallId": "wall_owner_main"}).to_string(),
            ))
            .with_status(200)
            .create_async()
            .await;
        let unfriend_username = server
            .mock("POST", "/wall/friends/unfriend")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(
                json!({"targetUsername": "owner"}).to_string(),
            ))
            .with_status(200)
            .create_async()
            .await;

        ctx.delete_post(42)
            .await
            .expect("delete post should accept empty response");
        ctx.unfriend_by_wall("wall_owner_main")
            .await
            .expect("unfriend by wall should accept empty response");
        ctx.unfriend_by_username("owner")
            .await
            .expect("unfriend by username should accept empty response");

        delete_post.assert_async().await;
        unfriend_wall.assert_async().await;
        unfriend_username.assert_async().await;
    }

    #[tokio::test]
    async fn update_post_caption_uses_caption_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let update = server
            .mock("POST", "/wall/posts/42/caption")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::Regex("\"captionCipher\":\"[^\"]+\"".into()))
            .with_status(200)
            .create_async()
            .await;

        ctx.update_post_caption(42, &generate_key(), Some(b"updated caption"))
            .await
            .expect("caption update should succeed");

        update.assert_async().await;
    }

    #[tokio::test]
    async fn like_post_uses_post_like_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let like = server
            .mock("POST", "/wall/posts/42/like")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(json!({"like": true}).to_string()))
            .with_status(200)
            .with_body(json!({"liked": true}).to_string())
            .create_async()
            .await;

        let response = ctx
            .like_post(42, true)
            .await
            .expect("post like should succeed");

        assert!(response.liked);
        like.assert_async().await;
    }

    #[tokio::test]
    async fn unread_methods_use_read_marker_endpoints() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let status = server
            .mock("GET", "/wall/unread")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(json!({"feedUnread": true, "notificationsUnread": false}).to_string())
            .create_async()
            .await;
        let feed_read = server
            .mock("POST", "/wall/feed/read")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(json!({"postId": 42}).to_string()))
            .with_status(200)
            .with_body(json!({"feedUnread": false, "notificationsUnread": false}).to_string())
            .create_async()
            .await;
        let notifications_read = server
            .mock("POST", "/wall/messages/read")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(
                json!({"friendWallId": "wall_friend"}).to_string(),
            ))
            .with_status(200)
            .with_body(json!({"feedUnread": false, "notificationsUnread": false}).to_string())
            .create_async()
            .await;

        let unread = ctx
            .unread_status()
            .await
            .expect("unread status should load");
        assert!(unread.feed_unread);
        assert!(!unread.notifications_unread);
        assert!(!ctx.mark_feed_read(42).await.expect("feed read").feed_unread);
        assert!(
            !ctx.mark_notifications_read("wall_friend")
                .await
                .expect("notifications read")
                .notifications_unread
        );

        status.assert_async().await;
        feed_read.assert_async().await;
        notifications_read.assert_async().await;
    }

    #[tokio::test]
    async fn message_actions_use_message_endpoints() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_wall_key = generate_key();
        let wall_key = generate_key();
        let (friend_public_key, _) = keys::generate_keypair().expect("valid friend keypair");

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_WALL_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_wall_key))
            .create_async()
            .await;
        let walls = server
            .mock("GET", "/wall")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(owned_wall_response(
                &root_wall_key,
                &wall_key,
                "wall_owner_main",
                "owner-main",
                3,
            ))
            .create_async()
            .await;
        let friends = server
            .mock("GET", "/wall/friends")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "wallId".into(),
                "wall_owner_main".into(),
            ))
            .with_status(200)
            .with_body(
                json!([{
                    "friend": {
                        "userId": 7,
                        "wallId": "wall_friend",
                        "wallSlug": "friend",
                        "publicKey": encode_b64(&friend_public_key),
                        "keyVersion": 2
                    },
                    "shareKeyVersion": 2,
                    "createdAt": "2026-04-16T00:00:00Z"
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let reply = server
            .mock("POST", "/wall/messages/wall_friend")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"replyMessageId\":\"wmsg_parent\"".into()),
                Matcher::Regex("\"messageCipher\":\"[^\"]+\"".into()),
                Matcher::Regex("\"senderEncryptedMessageKey\":\"[^\"]+\"".into()),
                Matcher::Regex("\"recipientEncryptedMessageKey\":\"[^\"]+\"".into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "messageId": "wmsg_reply",
                    "kind": "regular",
                    "sender": {
                        "userId": 1,
                        "wallId": "wall_owner_main",
                        "wallSlug": "owner-main",
                        "publicKey": encode_b64(&ctx.public_key),
                        "keyVersion": 3
                    },
                    "recipient": {
                        "userId": 7,
                        "wallId": "wall_friend",
                        "wallSlug": "friend",
                        "publicKey": encode_b64(&friend_public_key),
                        "keyVersion": 2
                    },
                    "messageCipher": "cipher",
                    "encryptedMessageKey": "key",
                    "replyMessageId": "wmsg_parent",
                    "likes": 0,
                    "viewerLiked": false,
                    "isDeleted": false,
                    "createdAt": "2026-04-16T00:00:00Z",
                    "updatedAt": "2026-04-16T00:00:00Z"
                })
                .to_string(),
            )
            .create_async()
            .await;
        let like = server
            .mock("POST", "/wall/message/wmsg_reply/like")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(json!({"like": true}).to_string()))
            .with_status(200)
            .with_body(json!({"liked": true}).to_string())
            .create_async()
            .await;
        let delete = server
            .mock("DELETE", "/wall/message/wmsg_reply")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .create_async()
            .await;

        let created = ctx
            .reply_to_message("wall_friend", "wmsg_parent", "hello")
            .await
            .expect("message reply should be sent");
        let liked = ctx
            .like_message("wmsg_reply", true)
            .await
            .expect("message like should be sent");
        ctx.delete_message("wmsg_reply")
            .await
            .expect("message delete should be sent");

        assert_eq!(created.reply_message_id.as_deref(), Some("wmsg_parent"));
        assert!(liked.liked);
        entity.assert_async().await;
        walls.assert_async().await;
        friends.assert_async().await;
        reply.assert_async().await;
        like.assert_async().await;
        delete.assert_async().await;
    }

    #[tokio::test]
    async fn list_post_likers_uses_post_likes_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let likers = server
            .mock("GET", "/wall/posts/42/likes")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::AllOf(vec![
                Matcher::UrlEncoded("cursor".into(), "3000:7".into()),
                Matcher::UrlEncoded("limit".into(), "5".into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "likers": [{
                        "actor": {
                            "userId": 8,
                            "wallId": "wall_liker",
                            "wallSlug": "liker"
                        },
                        "createdAt": "2026-04-16T00:00:00Z"
                    }],
                    "nextCursor": "2000:8"
                })
                .to_string(),
            )
            .create_async()
            .await;

        let response = ctx
            .list_post_likers(42, Some("3000:7".to_owned()), Some(5))
            .await
            .expect("likers should load");

        assert_eq!(response.likers[0].actor.wall_id, "wall_liker");
        assert_eq!(response.next_cursor, "2000:8");
        likers.assert_async().await;
    }

    #[tokio::test]
    async fn list_wall_friends_uses_wall_friends_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let friends = server
            .mock("GET", "/wall/friends")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "wallId".into(),
                "wall_owner_main".into(),
            ))
            .with_status(200)
            .with_body(
                json!([{
                    "friend": {
                        "userId": 8,
                        "wallId": "wall_friend",
                        "wallSlug": "friend",
                        "publicKey": "friend-public-key",
                        "keyVersion": 2,
                        "encryptedProfile": "profile-cipher"
                    },
                    "shareKeyVersion": 2,
                    "createdAt": "2026-04-16T00:00:00Z"
                }])
                .to_string(),
            )
            .create_async()
            .await;

        let response = ctx
            .list_wall_friends("wall_owner_main")
            .await
            .expect("friends should load");

        assert_eq!(response.len(), 1);
        assert_eq!(response[0].friend.wall_id, "wall_friend");
        assert_eq!(response[0].share_key_version, 2);
        friends.assert_async().await;
    }

    #[tokio::test]
    async fn get_relationship_uses_relationship_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let relationship = server
            .mock("GET", "/wall/friends/relationship")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "targetWallId".into(),
                "wall_friend".into(),
            ))
            .with_status(200)
            .with_body(json!({"relationship": "friend"}).to_string())
            .create_async()
            .await;

        let response = ctx
            .get_relationship("wall_friend")
            .await
            .expect("relationship should load");

        assert_eq!(response.relationship, "friend");
        relationship.assert_async().await;
    }

    #[tokio::test]
    async fn wall_link_list_post_likers_uses_session_token() {
        let mut server = Server::new_async().await;
        let ctx = WallLinkCtx {
            client: build_http_client(
                &server.url(),
                Some("link-session-token".to_owned()),
                None,
                None,
                None,
            )
            .expect("http client"),
            session_token: "link-session-token".to_owned(),
            owner_handle: "owner".to_owned(),
            wall_id: "wall_owner_main".to_owned(),
            wall_slug: "owner-main".to_owned(),
            owner_public_key: Vec::new(),
            wall_key: generate_key(),
            key_version: 1,
        };
        let likers = server
            .mock("GET", "/wall/posts/42/likes")
            .match_header("x-auth-token", "link-session-token")
            .with_status(200)
            .with_body(json!({"likers": [], "nextCursor": ""}).to_string())
            .create_async()
            .await;

        let response = ctx
            .list_post_likers(42, None, None)
            .await
            .expect("link likers should load");

        assert!(response.likers.is_empty());
        likers.assert_async().await;
    }

    #[tokio::test]
    async fn refresh_friend_shares_accepts_empty_server_response() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_wall_key = generate_key();
        let wall_key = generate_key();
        let (friend_public_key, _) = keys::generate_keypair().expect("valid friend keypair");
        let entity_payload =
            encrypt_entity_key(&ctx.master_key, &root_wall_key).expect("root wall entity");

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_WALL_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "type": ROOT_WALL_KEY_TYPE,
                    "encryptedKey": entity_payload.encrypted_key,
                    "header": entity_payload.header,
                })
                .to_string(),
            )
            .create_async()
            .await;
        let walls = server
            .mock("GET", "/wall")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "wallId": "wall_owner_main",
                    "wallSlug": "owner-main",
                    "encryptedWallKey": encode_b64(&encrypt_secretbox_packed(&root_wall_key, &wall_key).expect("wall key wrap")),
                    "encryptedProfile": "",
                    "keyVersion": 3
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let friends = server
            .mock("GET", "/wall/friends")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "wallId".into(),
                "wall_owner_main".into(),
            ))
            .with_status(200)
            .with_body(
                json!([{
                    "friend": {
                        "userId": 7,
                        "wallId": "wall_viewer",
                        "wallSlug": "viewer",
                        "publicKey": encode_b64(&friend_public_key),
                        "keyVersion": 2
                    },
                    "shareKeyVersion": 2,
                    "createdAt": "2026-04-16T00:00:00Z"
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let refresh = server
            .mock("POST", "/wall/friends/shares/refresh")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"friendId\":7".into()),
                Matcher::Regex("\"keyVersion\":3".into()),
            ]))
            .with_status(200)
            .create_async()
            .await;

        let updated = ctx
            .refresh_friend_shares("wall_owner_main")
            .await
            .expect("refresh should accept empty response");

        assert_eq!(updated, 1);
        entity.assert_async().await;
        walls.assert_async().await;
        friends.assert_async().await;
        refresh.assert_async().await;
    }

    #[tokio::test]
    async fn wall_link_status_create_and_delete_use_link_endpoints() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_wall_key = generate_key();
        let wall_key = generate_key();

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_WALL_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_wall_key))
            .create_async()
            .await;
        let walls = server
            .mock("GET", "/wall")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(owned_wall_response(
                &root_wall_key,
                &wall_key,
                "wall_owner_main",
                "owner-main",
                3,
            ))
            .create_async()
            .await;
        let status = server
            .mock("GET", "/wall/links/wall_owner_main")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!({
                    "wallId": "wall_owner_main",
                    "wallSlug": "owner-main",
                    "keyVersion": 3,
                    "active": true,
                    "createdAt": "2026-04-16T00:00:00Z",
                    "updatedAt": "2026-04-16T00:00:00Z"
                })
                .to_string(),
            )
            .create_async()
            .await;
        let create = server
            .mock("POST", "/wall/links")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"wallId\":\"wall_owner_main\"".into()),
                Matcher::Regex("\"authKey\":\"[^\"]+\"".into()),
                Matcher::Regex("\"keyVersion\":3".into()),
                Matcher::Regex("\"encryptedWallKey\":\"[^\"]+\"".into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "wallId": "wall_owner_main",
                    "wallSlug": "owner-main",
                    "keyVersion": 3,
                    "active": true,
                    "createdAt": "2026-04-16T00:00:00Z",
                    "updatedAt": "2026-04-16T00:00:00Z"
                })
                .to_string(),
            )
            .create_async()
            .await;
        let delete = server
            .mock("DELETE", "/wall/links/wall_owner_main")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .create_async()
            .await;

        let status_response = ctx
            .get_wall_link_status("wall_owner_main")
            .await
            .expect("link status should load");
        let created = ctx
            .create_wall_link("wall_owner_main")
            .await
            .expect("link should be created");
        ctx.delete_wall_link("wall_owner_main")
            .await
            .expect("link should be deleted");

        assert!(status_response.active);
        assert_eq!(created.wall_id, "wall_owner_main");
        assert_eq!(created.wall_username, "owner-main");
        assert_eq!(created.access_key.len(), 12);
        assert!(
            created
                .access_key
                .bytes()
                .all(|value| value.is_ascii_alphanumeric())
        );
        assert_eq!(created.key_version, 3);
        status.assert_async().await;
        entity.assert_async().await;
        walls.assert_async().await;
        create.assert_async().await;
        delete.assert_async().await;
    }

    #[tokio::test]
    async fn list_feed_uses_wall_feed_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let feed = server
            .mock("GET", "/wall/feed")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::AllOf(vec![
                Matcher::UrlEncoded("cursor".into(), "cursor-1".into()),
                Matcher::UrlEncoded("limit".into(), "5".into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "items": [{
                        "postId": 42,
                        "wallId": "wall_owner_gallery",
                        "wallSlug": "owner-gallery",
                        "ownerUserId": 7,
                        "author": {
                            "userId": 7,
                            "wallId": "wall_owner_gallery",
                            "wallSlug": "owner-gallery"
                        },
                        "encryptedPostKey": "cGFja2Vk",
                        "captionCipher": "",
                        "keyVersion": 3,
                        "objects": [],
                        "createdAt": "2026-04-16T00:00:00Z",
                        "likes": 2,
                        "viewerLiked": true
                    }],
                    "nextCursor": "cursor-2"
                })
                .to_string(),
            )
            .create_async()
            .await;

        let page = ctx
            .list_feed(Some("cursor-1".to_owned()), Some(5))
            .await
            .expect("feed page should load");

        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].post_id, 42);
        assert_eq!(page.next_cursor, "cursor-2");
        feed.assert_async().await;
    }

    #[tokio::test]
    async fn list_posts_uses_wall_posts_page_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let posts = server
            .mock("GET", "/wall/posts")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::AllOf(vec![
                Matcher::UrlEncoded("wallId".into(), "wall_owner_gallery".into()),
                Matcher::UrlEncoded("cursor".into(), "42".into()),
                Matcher::UrlEncoded("limit".into(), "5".into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "items": [{
                        "postId": 41,
                        "wallId": "wall_owner_gallery",
                        "wallSlug": "owner-gallery",
                        "ownerUserId": 7,
                        "author": {
                            "userId": 7,
                            "wallId": "wall_owner_gallery",
                            "wallSlug": "owner-gallery"
                        },
                        "encryptedPostKey": "cGFja2Vk",
                        "captionCipher": "",
                        "keyVersion": 3,
                        "objects": [],
                        "createdAt": "2026-04-16T00:00:00Z",
                        "likes": 2,
                        "viewerLiked": true
                    }],
                    "nextCursor": "41"
                })
                .to_string(),
            )
            .create_async()
            .await;

        let page = ctx
            .list_posts("wall_owner_gallery", Some("42".to_owned()), Some(5))
            .await
            .expect("post page should load");

        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].post_id, 41);
        assert_eq!(page.next_cursor, "41");
        posts.assert_async().await;
    }

    #[tokio::test]
    async fn fetch_post_decrypted_uses_post_by_id_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_wall_key = generate_key();
        let wall_key = generate_key();
        let post_key = generate_key();
        let caption = b"hello from post";
        let entity_payload =
            encrypt_entity_key(&ctx.master_key, &root_wall_key).expect("root wall entity");

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_WALL_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "type": ROOT_WALL_KEY_TYPE,
                    "encryptedKey": entity_payload.encrypted_key,
                    "header": entity_payload.header,
                })
                .to_string(),
            )
            .create_async()
            .await;
        let walls = server
            .mock("GET", "/wall")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "wallId": "wall_owner_gallery",
                    "wallSlug": "owner-gallery",
                    "encryptedWallKey": encode_b64(&encrypt_secretbox_packed(&root_wall_key, &wall_key).expect("wall key wrap")),
                    "encryptedProfile": "",
                    "keyVersion": 3
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let post = server
            .mock("GET", "/wall/posts/42")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!({
                    "postId": 42,
                    "wallId": "wall_owner_gallery",
                    "wallSlug": "owner-gallery",
                    "author": {
                        "userId": 7,
                        "wallId": "wall_owner_gallery",
                        "wallSlug": "owner-gallery"
                    },
                    "encryptedPostKey": encode_b64(&encrypt_secretbox_packed(&wall_key, &post_key).expect("post key wrap")),
                    "captionCipher": encode_b64(&encrypt_secretbox_packed(&post_key, caption).expect("caption wrap")),
                    "keyVersion": 3,
                    "objects": [],
                    "createdAt": "2026-04-16T00:00:00Z",
                    "likes": 0,
                    "viewerLiked": false
                })
                .to_string(),
            )
            .create_async()
            .await;

        let decrypted = ctx
            .fetch_post_decrypted(42)
            .await
            .expect("post should decrypt");

        assert_eq!(decrypted.post_key, post_key);
        assert_eq!(
            decrypted.caption_plaintext.as_deref(),
            Some(caption.as_slice())
        );
        entity.assert_async().await;
        walls.assert_async().await;
        post.assert_async().await;
    }

    #[tokio::test]
    async fn hydrate_wall_keys_loads_owned_and_friends_walls() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_wall_key = generate_key();
        let owned_wall_key = generate_key();
        let shared_wall_key = generate_key();
        let entity_payload =
            encrypt_entity_key(&ctx.master_key, &root_wall_key).expect("root wall entity");
        let sealed_share =
            sealed::seal(&shared_wall_key, &ctx.public_key).expect("sealed wall share");

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_WALL_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "type": ROOT_WALL_KEY_TYPE,
                    "encryptedKey": entity_payload.encrypted_key,
                    "header": entity_payload.header,
                })
                .to_string(),
            )
            .create_async()
            .await;
        let owned = server
            .mock("GET", "/wall")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "wallId": "wall_owner_gallery",
                    "wallSlug": "owner-gallery",
                    "encryptedWallKey": encode_b64(&encrypt_secretbox_packed(&root_wall_key, &owned_wall_key).expect("owned wrap")),
                    "encryptedProfile": "",
                    "keyVersion": 1
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let shares = server
            .mock("GET", "/wall/friends/shares")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "friend": "owner",
                    "wallId": "wall_shared_gallery",
                    "wallSlug": "shared-gallery",
                    "encryptedWallKey": encode_b64(&pack_payload(&sealed_share, &[])),
                    "encryptedProfile": "",
                    "keyVersion": 4
                }])
                .to_string(),
            )
            .create_async()
            .await;

        let hydrated = ctx
            .hydrate_wall_keys()
            .await
            .expect("wall keys should hydrate");

        assert_eq!(hydrated.owned.len(), 1);
        assert_eq!(hydrated.owned[0].0, "wall_owner_gallery");
        assert_eq!(hydrated.owned[0].1, owned_wall_key);
        assert_eq!(hydrated.friends.len(), 1);
        assert_eq!(hydrated.friends[0].wall_id, "wall_shared_gallery");
        assert_eq!(hydrated.friends[0].wall_key, shared_wall_key);
        entity.assert_async().await;
        owned.assert_async().await;
        shares.assert_async().await;
    }

    #[test]
    fn build_history_walks_back_versions() {
        let v3 = generate_key();
        let v2 = generate_key();
        let v1 = generate_key();
        let versions = vec![
            WallKeyVersionResponse {
                version: 3,
                wrapped_prev_key: encode_b64(&encrypt_secretbox_packed(&v3, &v2).expect("wrap v2")),
                created_at: "2026-01-03T00:00:00Z".to_owned(),
            },
            WallKeyVersionResponse {
                version: 2,
                wrapped_prev_key: encode_b64(&encrypt_secretbox_packed(&v2, &v1).expect("wrap v1")),
                created_at: "2026-01-02T00:00:00Z".to_owned(),
            },
        ];

        let history = build_wall_key_history_map(3, &v3, &versions).expect("history");

        assert_eq!(history.get(&3), Some(&v3));
        assert_eq!(history.get(&2), Some(&v2));
        assert_eq!(history.get(&1), Some(&v1));
    }
}
