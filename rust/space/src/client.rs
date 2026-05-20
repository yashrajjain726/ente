use std::{
    collections::BTreeMap,
    sync::{Mutex, MutexGuard},
};

use crate::crypto::{
    PACKED_SECRETBOX_OVERHEAD_BYTES, decode_b64, decrypt_entity_key, decrypt_secretbox_packed,
    derive_space_link_auth_key, derive_space_link_wrap_key, encode_b64, encrypt_asset_payload,
    encrypt_entity_key, encrypt_secretbox_packed, generate_key, generate_space_link_access_key,
    pack_payload, space_link_access_key_material, unpack_payload,
};
use crate::error::{Result, SpaceError};
use crate::models::{
    CreatedSpace, CreatedSpaceLink, DecryptedFriendShare, DecryptedMessage, DecryptedPost,
    DecryptedSpaceProfile, FeedItem, FeedPage, HydratedKeys, MessagePayload, MessageQuote,
    OpenAccountSpaceCtxInput, OpenSpaceLinkCtxInput, PrivateKeySource,
};
use crate::transport::{
    AddFriendPayload, AssetDownloadResponse, CreateEntityKeyRequest, CreateMessageRequest,
    CreatePostRequest, CreatePostResponse, CreateSpaceRequest, EntityKeyPayload, EntityKeyResponse,
    FriendRelationshipResponse, FriendShareResponse, FriendStatusResponse, FriendTargetPayload,
    LikeMessageRequest, LikeMessageResponse, LikePostRequest, LikePostResponse,
    ListPostLikersResponse, MarkFeedReadRequest, MarkNotificationsReadRequest,
    MessageConversationPage, MessagePage, MessageResponse, PostObjectPayload, PostPage,
    PostResponse, PresignUploadRequest, PresignUploadResponse, ProfileAvatarPayload,
    RefreshFriendSharesRequest, RotateSpaceKeyRequest, ShareUpdatePayload, SpaceActorResponse,
    SpaceFriendResponse, SpaceKeyResponse, SpaceKeyVersionResponse, SpaceLinkCreateRequest,
    SpaceLinkLoginRequest, SpaceLinkLoginResponse, SpaceLinkStatusResponse, SpaceLookupResponse,
    SpaceProfileResponse, SpaceUnreadStatusResponse, UpdatePostCaptionRequest,
    UpdateSpaceProfileRequest, UpdateSpaceProfileResponse, UpdateSpaceSlugRequest,
};
use ente_core::crypto::{sealed, secretbox};
use ente_core::http::{Error as HttpError, HttpClient, HttpConfig};

const ROOT_SPACE_KEY_TYPE: &str = "space";
const UPLOAD_PURPOSE_AVATAR: &str = "avatar";
const MESSAGE_KIND_REGULAR: &str = "regular";
const MESSAGE_KIND_POST_REPLY: &str = "post_reply";
pub const MAX_SPACE_POST_UPLOAD_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_SPACE_AVATAR_UPLOAD_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_SPACE_POST_PLAINTEXT_BYTES: usize =
    MAX_SPACE_POST_UPLOAD_BYTES - PACKED_SECRETBOX_OVERHEAD_BYTES;
pub const MAX_SPACE_AVATAR_PLAINTEXT_BYTES: usize =
    MAX_SPACE_AVATAR_UPLOAD_BYTES - PACKED_SECRETBOX_OVERHEAD_BYTES;
pub const MAX_SPACE_MESSAGE_TEXT_CHARS: usize = 1000;
pub const MAX_SPACE_MESSAGE_TEXT_BYTES: usize = 4 * 1024;
pub const MAX_SPACE_MESSAGE_CIPHER_DECODED_BYTES: usize = 6 * 1024;
pub const MAX_SPACE_MESSAGE_PAYLOAD_BYTES: usize =
    MAX_SPACE_MESSAGE_CIPHER_DECODED_BYTES - PACKED_SECRETBOX_OVERHEAD_BYTES;

#[derive(Debug, Clone)]
struct ResolvedSpaceAccess {
    space_key: Vec<u8>,
    key_version: i32,
}

#[derive(Debug, Clone)]
struct ResolvedOwnedSpaceAccess {
    root_space_key: Vec<u8>,
    space_key: Vec<u8>,
    key_version: i32,
}

pub struct AccountSpaceCtx {
    client: HttpClient,
    master_key: Vec<u8>,
    public_key: Vec<u8>,
    private_key: Vec<u8>,
    user_id: Option<i64>,
    root_space_key_cache: Mutex<Option<Option<Vec<u8>>>>,
    owned_spaces_cache: Mutex<Option<Vec<SpaceKeyResponse>>>,
    friend_shares_cache: Mutex<Option<Vec<DecryptedFriendShare>>>,
}

pub struct SpaceLinkCtx {
    client: HttpClient,
    session_token: String,
    owner_handle: String,
    space_id: String,
    space_slug: String,
    owner_public_key: Vec<u8>,
    space_key: Vec<u8>,
    key_version: i32,
}

impl AccountSpaceCtx {
    pub fn open(input: OpenAccountSpaceCtxInput) -> Result<Self> {
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
            root_space_key_cache: Mutex::new(None),
            owned_spaces_cache: Mutex::new(None),
            friend_shares_cache: Mutex::new(None),
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
            Err(HttpError::Http { status: 409, .. }) => Err(SpaceError::EntityKeyConflict),
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

    pub async fn get_root_space_key(&self) -> Result<Option<Vec<u8>>> {
        let payload = match self.get_entity_key(ROOT_SPACE_KEY_TYPE).await? {
            Some(value) => value,
            None => return Ok(None),
        };
        Ok(Some(decrypt_entity_key(&self.master_key, &payload)?))
    }

    pub async fn get_or_create_root_space_key(&self) -> Result<Vec<u8>> {
        let root_space_key = generate_key();
        let payload = encrypt_entity_key(&self.master_key, &root_space_key)?;
        let ensured = self
            .ensure_entity_key(ROOT_SPACE_KEY_TYPE, &payload)
            .await?;
        let root_space_key = decrypt_entity_key(&self.master_key, &ensured)?;
        *cache_lock(&self.root_space_key_cache, "root space key")? =
            Some(Some(root_space_key.clone()));
        Ok(root_space_key)
    }

    pub async fn list_owned_spaces(&self) -> Result<Vec<SpaceKeyResponse>> {
        self.client
            .get_json("/space", &[])
            .await
            .map_err(Into::into)
    }

    pub async fn list_friend_shares(&self) -> Result<Vec<FriendShareResponse>> {
        self.client
            .get_json("/space/friends/shares", &[])
            .await
            .map_err(Into::into)
    }

    pub fn decrypt_friend_share(
        &self,
        share: &FriendShareResponse,
    ) -> Result<DecryptedFriendShare> {
        let packed = decode_b64(&share.encrypted_space_key)?;
        let (ciphertext, _) = unpack_payload(&packed)?;
        if ciphertext.is_empty() {
            return Err(SpaceError::MissingEncryptedSpaceKey);
        }
        let space_key = sealed::open(&ciphertext, &self.public_key, &self.private_key)?;
        Ok(DecryptedFriendShare {
            friend: share.friend.clone(),
            space_id: share.space_id.clone(),
            space_slug: share.space_slug.clone(),
            space_key,
            key_version: share.key_version,
        })
    }

    async fn default_profile_space_access(&self) -> Result<(SpaceKeyResponse, Vec<u8>)> {
        let root_space_key = self
            .get_root_space_key()
            .await?
            .ok_or_else(|| SpaceError::InvalidInput("root space key is missing".into()))?;
        let space = self
            .list_owned_spaces()
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| SpaceError::InvalidInput("no owned space is available".into()))?;
        let packed = decode_b64(&space.encrypted_space_key)?;
        let space_key = decrypt_secretbox_packed(&root_space_key, &packed)?;
        Ok((space, space_key))
    }

    pub async fn resolve_owned_space_key(&self, space_id: &str) -> Result<Option<Vec<u8>>> {
        Ok(self
            .resolve_owned_space_access(space_id)
            .await?
            .map(|value| value.space_key))
    }

    pub async fn resolve_space_key(&self, space_id: &str) -> Result<Option<Vec<u8>>> {
        Ok(self
            .resolve_space_access(space_id)
            .await?
            .map(|value| value.space_key))
    }

    pub async fn create_space(&self, space_slug: &str, profile: &[u8]) -> Result<CreatedSpace> {
        let space_key = generate_key();
        self.create_space_with_key(space_slug, &space_key, profile)
            .await
    }

    pub async fn create_space_with_key(
        &self,
        space_slug: &str,
        space_key: &[u8],
        profile: &[u8],
    ) -> Result<CreatedSpace> {
        let root_space_key = self.get_or_create_root_space_key().await?;
        let encrypted_space_key =
            encode_b64(&encrypt_secretbox_packed(&root_space_key, space_key)?);
        let encrypted_profile = encode_b64(&encrypt_secretbox_packed(space_key, profile)?);
        let request = CreateSpaceRequest {
            space_slug: space_slug.to_owned(),
            encrypted_space_key: encrypted_space_key.clone(),
            encrypted_profile: encrypted_profile.clone(),
        };
        let response = self
            .client
            .post_json::<SpaceKeyResponse, _>("/space", &request)
            .await?;
        self.clear_owned_space_cache()?;
        Ok(CreatedSpace {
            space_id: response.space_id,
            space_slug: response.space_slug,
            key_version: response.key_version,
            space_key: space_key.to_vec(),
            encrypted_space_key,
            encrypted_profile,
        })
    }

    pub async fn get_space_profile_raw(
        &self,
        space_id: &str,
        version: Option<i32>,
    ) -> Result<SpaceProfileResponse> {
        let mut query = vec![("spaceId", space_id.to_owned())];
        if let Some(value) = version {
            query.push(("version", value.to_string()));
        }
        self.client
            .get_json("/space/profile", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn lookup_space_by_slug(&self, space_slug: &str) -> Result<SpaceLookupResponse> {
        let path = format!("/space/public/by-slug/{}", urlencoding::encode(space_slug));
        self.client.get_json(&path, &[]).await.map_err(Into::into)
    }

    pub async fn update_space_slug(
        &self,
        space_id: &str,
        space_slug: &str,
    ) -> Result<SpaceLookupResponse> {
        let path = format!("/space/{space_id}/slug");
        let request = UpdateSpaceSlugRequest {
            space_slug: space_slug.to_owned(),
        };
        let response = self.client.put_json(&path, &request).await?;
        self.clear_owned_space_cache()?;
        Ok(response)
    }

    pub async fn get_space_profile_decrypted(
        &self,
        space_id: &str,
        version: Option<i32>,
    ) -> Result<DecryptedSpaceProfile> {
        let profile = self.get_space_profile_raw(space_id, version).await?;
        let space_key = self
            .resolve_space_key_for_version(space_id, Some(profile.version))
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!(
                    "no key available for space {space_id} version {}",
                    profile.version
                ))
            })?;
        decrypt_space_profile(&profile, &space_key)
    }

    pub async fn update_space_profile(
        &self,
        space_id: &str,
        profile: &[u8],
        avatar: Option<ProfileAvatarPayload>,
        remove_avatar: bool,
    ) -> Result<UpdateSpaceProfileResponse> {
        let space_key = self
            .resolve_owned_space_access(space_id)
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!("space {space_id} is not owned by the account"))
            })?;
        let request = UpdateSpaceProfileRequest {
            space_id: space_id.to_owned(),
            encrypted_profile: encode_b64(&encrypt_secretbox_packed(
                &space_key.space_key,
                profile,
            )?),
            avatar,
            remove_avatar,
        };
        self.client
            .post_json("/space/profile", &request)
            .await
            .map_err(Into::into)
    }

    pub async fn list_space_key_versions(
        &self,
        space_id: &str,
    ) -> Result<Vec<SpaceKeyVersionResponse>> {
        let query = vec![("spaceId", space_id.to_owned())];
        self.client
            .get_json("/space/versions", &query)
            .await
            .map_err(Into::into)
    }

    pub fn build_space_key_history(
        &self,
        current_version: i32,
        current_key: &[u8],
        versions: &[SpaceKeyVersionResponse],
    ) -> Result<BTreeMap<i32, Vec<u8>>> {
        build_space_key_history_map(current_version, current_key, versions)
    }

    pub async fn build_space_key_history_for_space(
        &self,
        space_id: &str,
    ) -> Result<BTreeMap<i32, Vec<u8>>> {
        let access = self
            .resolve_space_access(space_id)
            .await?
            .ok_or_else(|| SpaceError::InvalidInput(format!("no access to space {space_id}")))?;
        let versions = self.list_space_key_versions(space_id).await?;
        build_space_key_history_map(access.key_version, &access.space_key, &versions)
    }

    pub async fn rotate_space_key(
        &self,
        space_id: &str,
        profile: Option<&[u8]>,
    ) -> Result<CreatedSpace> {
        let current = self
            .resolve_owned_space_access(space_id)
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!("space {space_id} is not owned by the account"))
            })?;
        let current_profile = if profile.is_none() {
            Some(self.get_space_profile_decrypted(space_id, None).await?)
        } else {
            None
        };
        let next_profile = match profile {
            Some(value) => value.to_vec(),
            None => current_profile
                .as_ref()
                .map(|value| value.profile.clone())
                .ok_or_else(|| SpaceError::InvalidInput("missing current profile".into()))?,
        };
        let next_space_key = generate_key();
        let root_space_key = self.get_or_create_root_space_key().await?;
        let request = RotateSpaceKeyRequest {
            space_id: space_id.to_owned(),
            encrypted_space_key: encode_b64(&encrypt_secretbox_packed(
                &root_space_key,
                &next_space_key,
            )?),
            wrapped_prev_key: encode_b64(&encrypt_secretbox_packed(
                &next_space_key,
                &current.space_key,
            )?),
            encrypted_profile: Some(encode_b64(&encrypt_secretbox_packed(
                &next_space_key,
                &next_profile,
            )?)),
        };
        let response = self
            .client
            .post_json::<SpaceKeyResponse, _>("/space/rotate", &request)
            .await?;
        self.clear_owned_space_cache()?;
        Ok(CreatedSpace {
            space_id: response.space_id,
            space_slug: response.space_slug,
            key_version: response.key_version,
            space_key: next_space_key,
            encrypted_space_key: request.encrypted_space_key,
            encrypted_profile: request.encrypted_profile.unwrap_or_default(),
        })
    }

    pub async fn presign_post_upload(&self, size: usize) -> Result<PresignUploadResponse> {
        ensure_space_upload_size("post", size, MAX_SPACE_POST_UPLOAD_BYTES)?;
        let request = PresignUploadRequest {
            size: size as i64,
            purpose: None,
            space_id: None,
        };
        self.client
            .post_json("/space/uploads/presign", &request)
            .await
            .map_err(Into::into)
    }

    pub async fn presign_avatar_upload(
        &self,
        space_id: &str,
        size: usize,
    ) -> Result<PresignUploadResponse> {
        ensure_space_upload_size("avatar", size, MAX_SPACE_AVATAR_UPLOAD_BYTES)?;
        let request = PresignUploadRequest {
            size: size as i64,
            purpose: Some(UPLOAD_PURPOSE_AVATAR.to_owned()),
            space_id: Some(space_id.to_owned()),
        };
        self.client
            .post_json("/space/uploads/presign", &request)
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
        space_id: &str,
        space_key: &[u8],
        plaintext: &[u8],
    ) -> Result<ProfileAvatarPayload> {
        let encrypted = encrypt_asset_payload(space_key, plaintext)?;
        let presign = self
            .presign_avatar_upload(space_id, encrypted.len())
            .await?;
        self.upload_bytes(&presign, &encrypted).await?;
        Ok(ProfileAvatarPayload {
            object_key: presign.object_key,
            size: Some(encrypted.len() as i64),
        })
    }

    pub async fn get_asset_url(
        &self,
        space_id: &str,
        object_key: &str,
    ) -> Result<AssetDownloadResponse> {
        let query = vec![
            ("spaceId", space_id.to_owned()),
            ("objectKey", object_key.to_owned()),
        ];
        self.client
            .get_json("/space/assets/redirect", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn download_encrypted_asset(
        &self,
        space_id: &str,
        object_key: &str,
    ) -> Result<Vec<u8>> {
        let download = self.get_asset_url(space_id, object_key).await?;
        self.client
            .object_store()
            .get_bytes(&download.url)
            .await
            .map_err(Into::into)
    }

    pub async fn download_decrypted_asset(
        &self,
        space_id: &str,
        object_key: &str,
        key: &[u8],
    ) -> Result<Vec<u8>> {
        let encrypted = self.download_encrypted_asset(space_id, object_key).await?;
        crate::crypto::decrypt_asset_payload(key, &encrypted)
    }

    pub fn generate_post_key(&self) -> Vec<u8> {
        generate_key()
    }

    pub async fn create_post(
        &self,
        space_id: &str,
        objects: &[PostObjectPayload],
        caption_plaintext: Option<&[u8]>,
        post_key: Option<&[u8]>,
    ) -> Result<(i64, Vec<u8>)> {
        let access = self
            .resolve_owned_space_access(space_id)
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!("space {space_id} is not owned by the account"))
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
            space_id: space_id.to_owned(),
            encrypted_post_key: encode_b64(&encrypt_secretbox_packed(
                &access.space_key,
                &post_key_bytes,
            )?),
            key_version: access.key_version,
            caption_cipher,
            objects: objects.to_vec(),
        };
        let response = self
            .client
            .post_json::<CreatePostResponse, _>("/space/posts", &request)
            .await?;
        Ok((response.post_id, post_key_bytes))
    }

    pub async fn list_posts(
        &self,
        space_id: &str,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<PostPage> {
        let mut query = vec![("spaceId", space_id.to_owned())];
        if let Some(value) = cursor.filter(|value| !value.trim().is_empty()) {
            query.push(("cursor", value));
        }
        if let Some(value) = limit {
            query.push(("limit", value.to_string()));
        }
        self.client
            .get_json("/space/posts", &query)
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
            .get_json("/space/feed", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn unread_status(&self) -> Result<SpaceUnreadStatusResponse> {
        self.client
            .get_json("/space/unread", &[])
            .await
            .map_err(Into::into)
    }

    pub async fn mark_feed_read(&self, post_id: i64) -> Result<SpaceUnreadStatusResponse> {
        if post_id <= 0 {
            return Err(SpaceError::InvalidInput("post id is required".into()));
        }
        self.client
            .post_json("/space/feed/read", &MarkFeedReadRequest { post_id })
            .await
            .map_err(Into::into)
    }

    pub async fn mark_notifications_read(
        &self,
        friend_space_id: impl Into<String>,
    ) -> Result<SpaceUnreadStatusResponse> {
        let friend_space_id = friend_space_id.into();
        if friend_space_id.trim().is_empty() {
            return Err(SpaceError::InvalidInput(
                "friend space id is required".into(),
            ));
        }
        self.client
            .post_json(
                "/space/messages/read",
                &MarkNotificationsReadRequest { friend_space_id },
            )
            .await
            .map_err(Into::into)
    }

    pub async fn get_post(&self, post_id: i64) -> Result<PostResponse> {
        let path = format!("/space/posts/{post_id}");
        self.client.get_json(&path, &[]).await.map_err(Into::into)
    }

    pub async fn fetch_post_decrypted(&self, post_id: i64) -> Result<DecryptedPost> {
        let post = self.get_post(post_id).await?;
        self.decrypt_post_for_space(&post.space_id, &post).await
    }

    pub async fn download_post_asset(&self, post_id: i64, object_key: &str) -> Result<Vec<u8>> {
        let post = self.get_post(post_id).await?;
        let decrypted = self.decrypt_post_for_space(&post.space_id, &post).await?;
        self.download_decrypted_asset(&post.space_id, object_key, &decrypted.post_key)
            .await
    }

    pub async fn download_post_asset_with_key(
        &self,
        space_id: &str,
        post_id: i64,
        encrypted_post_key: &str,
        key_version: i32,
        object_key: &str,
    ) -> Result<Vec<u8>> {
        let post_key = self
            .decrypt_post_key_fields(space_id, post_id, encrypted_post_key, key_version)
            .await?;
        self.download_decrypted_asset(space_id, object_key, &post_key)
            .await
    }

    pub async fn hydrate_space_keys(&self) -> Result<HydratedKeys> {
        let root_space_key = self.get_root_space_key().await?;
        let owned_records = self.list_owned_spaces().await?;
        let mut owned = Vec::with_capacity(owned_records.len());
        if let Some(root_space_key) = root_space_key {
            for record in owned_records {
                let packed = decode_b64(&record.encrypted_space_key)?;
                let space_key = decrypt_secretbox_packed(&root_space_key, &packed)?;
                owned.push((record.space_id, space_key));
            }
        }

        let friends_records = self.list_friend_shares().await?;
        let mut friends = Vec::with_capacity(friends_records.len());
        for record in &friends_records {
            friends.push(self.decrypt_friend_share(record)?);
        }

        Ok(HydratedKeys { owned, friends })
    }

    pub fn decrypt_post_key(&self, space_key: &[u8], post: &PostResponse) -> Result<Vec<u8>> {
        let packed = decode_b64(&post.encrypted_post_key)?;
        decrypt_secretbox_packed(space_key, &packed)
    }

    pub async fn decrypt_post_key_fields(
        &self,
        space_id: &str,
        post_id: i64,
        encrypted_post_key: &str,
        key_version: i32,
    ) -> Result<Vec<u8>> {
        let space_key = self
            .resolve_space_key_for_version(space_id, Some(key_version))
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!("missing space key for post {post_id}"))
            })?;
        let packed = decode_b64(encrypted_post_key)?;
        decrypt_secretbox_packed(&space_key, &packed)
    }

    pub fn decrypt_post(&self, space_key: &[u8], post: &PostResponse) -> Result<DecryptedPost> {
        let post_key = self.decrypt_post_key(space_key, post)?;
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
            .map_err(|err| SpaceError::InvalidInput(format!("invalid blur hash utf8: {err}")))?;
        Ok(Some(blur_hash))
    }

    pub async fn decrypt_post_for_space(
        &self,
        space_id: &str,
        post: &PostResponse,
    ) -> Result<DecryptedPost> {
        let space_key = self
            .resolve_space_key_for_version(space_id, Some(post.key_version))
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!(
                    "no space key available for post {}",
                    post.post_id
                ))
            })?;
        self.decrypt_post(&space_key, post)
    }

    pub async fn decrypt_actor_profile(
        &self,
        actor: &SpaceActorResponse,
    ) -> Result<Option<Vec<u8>>> {
        if actor.encrypted_profile.trim().is_empty()
            || actor.space_id.trim().is_empty()
            || actor.key_version <= 0
        {
            return Ok(None);
        }
        let Some(space_key) = self
            .resolve_space_key_for_version(&actor.space_id, Some(actor.key_version))
            .await?
        else {
            return Ok(None);
        };
        Ok(Some(decrypt_secretbox_packed(
            &space_key,
            &decode_b64(&actor.encrypted_profile)?,
        )?))
    }

    pub async fn decrypt_feed_item(&self, item: &FeedItem) -> Result<DecryptedPost> {
        let post = post_response_from_feed_item(item);
        self.decrypt_post_for_space(&item.space_id, &post).await
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
        let path = format!("/space/posts/{post_id}/caption");
        self.client
            .post_empty(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub async fn delete_post(&self, post_id: i64) -> Result<()> {
        let path = format!("/space/posts/{post_id}");
        self.client
            .delete_empty(&path, &[])
            .await
            .map_err(Into::into)
    }

    pub async fn like_post(&self, post_id: i64, like: bool) -> Result<LikePostResponse> {
        let path = format!("/space/posts/{post_id}/like");
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
        let path = format!("/space/posts/{post_id}/likes");
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
            .get_json("/space/messages", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn list_message_thread(
        &self,
        space_id: &str,
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
        let path = format!("/space/messages/{space_id}");
        self.client
            .get_json(&path, &query)
            .await
            .map_err(Into::into)
    }

    pub async fn send_message(&self, space_id: &str, text: &str) -> Result<MessageResponse> {
        let friend = self.friend_actor_for_space(space_id).await?;
        let payload = MessagePayload {
            version: 1,
            kind: MESSAGE_KIND_REGULAR.to_owned(),
            text: text.to_owned(),
            quote: None,
        };
        let request = self.message_request_for_payload(&friend.public_key, &payload, None)?;
        let path = format!("/space/messages/{space_id}");
        self.client
            .post_json(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub async fn reply_to_message(
        &self,
        space_id: &str,
        message_id: &str,
        text: &str,
    ) -> Result<MessageResponse> {
        let reply_message_id = message_id.trim();
        if reply_message_id.is_empty() {
            return Err(SpaceError::InvalidInput("message id is required".into()));
        }
        let friend = self.friend_actor_for_space(space_id).await?;
        let payload = MessagePayload {
            version: 1,
            kind: MESSAGE_KIND_REGULAR.to_owned(),
            text: text.to_owned(),
            quote: None,
        };
        let request =
            self.message_request_for_payload(&friend.public_key, &payload, Some(reply_message_id))?;
        let path = format!("/space/messages/{space_id}");
        self.client
            .post_json(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub async fn reply_to_post(&self, post_id: i64, text: &str) -> Result<MessageResponse> {
        let post = self.get_post(post_id).await?;
        if Some(post.owner_user_id) == self.user_id {
            return Err(SpaceError::InvalidInput(
                "cannot reply to your own post".into(),
            ));
        }
        if post.author.public_key.trim().is_empty() {
            return Err(SpaceError::InvalidInput(
                "post author public key is missing".into(),
            ));
        }
        let decrypted = self.decrypt_post_for_space(&post.space_id, &post).await?;
        let caption = optional_utf8(decrypted.caption_plaintext, "caption")?;
        let object = post.objects.first();
        let payload = MessagePayload {
            version: 1,
            kind: MESSAGE_KIND_POST_REPLY.to_owned(),
            text: text.to_owned(),
            quote: Some(MessageQuote {
                post_id,
                space_id: post.space_id.clone(),
                encrypted_post_key: Some(post.encrypted_post_key.clone()),
                key_version: Some(post.key_version),
                caption,
                object_key: object.map(|value| value.object_key.clone()),
                width: object.and_then(|value| value.width),
                height: object.and_then(|value| value.height),
                media_type: object.and_then(|value| value.media_type.clone()),
            }),
        };
        let request = self.message_request_for_payload(&post.author.public_key, &payload, None)?;
        let path = format!("/space/posts/{post_id}/reply");
        self.client
            .post_json(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub fn decrypt_message(&self, message: &MessageResponse) -> Result<DecryptedMessage> {
        if message.is_deleted {
            return Err(SpaceError::InvalidInput("message is deleted".into()));
        }
        let packed_key = decode_b64(&message.encrypted_message_key)?;
        let (sealed_key, _) = unpack_payload(&packed_key)?;
        let message_key = sealed::open(&sealed_key, &self.public_key, &self.private_key)?;
        let packed_message = decode_b64(&message.message_cipher)?;
        let plaintext = decrypt_secretbox_packed(&message_key, &packed_message)?;
        let payload: MessagePayload = serde_json::from_slice(&plaintext)
            .map_err(|err| SpaceError::InvalidInput(format!("invalid message payload: {err}")))?;
        Ok(DecryptedMessage {
            message_key,
            payload,
        })
    }

    pub async fn like_message(&self, message_id: &str, like: bool) -> Result<LikeMessageResponse> {
        let message_id = message_id.trim();
        if message_id.is_empty() {
            return Err(SpaceError::InvalidInput("message id is required".into()));
        }
        let request = LikeMessageRequest { like };
        let path = format!("/space/message/{message_id}/like");
        self.client
            .post_json(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub async fn delete_message(&self, message_id: &str) -> Result<()> {
        let message_id = message_id.trim();
        if message_id.is_empty() {
            return Err(SpaceError::InvalidInput("message id is required".into()));
        }
        let path = format!("/space/message/{message_id}");
        self.client
            .delete_empty(&path, &[])
            .await
            .map_err(Into::into)
    }

    async fn friend_actor_for_space(&self, space_id: &str) -> Result<SpaceActorResponse> {
        let (owned_space, _) = self.default_profile_space_access().await?;
        let friends = self.list_space_friends(&owned_space.space_id).await?;
        friends
            .into_iter()
            .map(|value| value.friend)
            .find(|friend| friend.space_id == space_id)
            .ok_or_else(|| SpaceError::InvalidInput(format!("space {space_id} is not a friend")))
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
            .map_err(|err| SpaceError::InvalidInput(format!("invalid message payload: {err}")))?;
        validate_message_payload(payload, plaintext.len())?;
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

    pub async fn add_friend_from_link(&self, link: &SpaceLinkCtx) -> Result<FriendStatusResponse> {
        if link.owner_public_key().is_empty() {
            return Err(SpaceError::InvalidInput(
                "target public key is required".into(),
            ));
        }
        let (requester_space, requester_space_key) = self.default_profile_space_access().await?;
        let target_share = sealed::seal(link.space_key(), &self.public_key)?;
        let requester_share = sealed::seal(&requester_space_key, link.owner_public_key())?;
        let payload = AddFriendPayload {
            target_space_id: link.space_id().to_owned(),
            link_session_token: link.session_token().to_owned(),
            requester_space_id: requester_space.space_id,
            target_encrypted_space_key: encode_b64(&pack_payload(&target_share, &[])),
            target_key_version: link.key_version(),
            requester_encrypted_space_key: encode_b64(&pack_payload(&requester_share, &[])),
            requester_key_version: requester_space.key_version,
        };
        let response = self
            .client
            .post_json("/space/friends/add", &payload)
            .await?;
        self.clear_friend_share_cache()?;
        Ok(response)
    }

    pub async fn unfriend_by_space(&self, space_id: &str) -> Result<()> {
        let request = FriendTargetPayload {
            target_username: None,
            target_space_id: Some(space_id.to_owned()),
        };
        self.client
            .post_empty("/space/friends/unfriend", &request)
            .await?;
        self.clear_friend_share_cache()?;
        Ok(())
    }

    pub async fn unfriend_by_username(&self, username: &str) -> Result<()> {
        let request = FriendTargetPayload {
            target_username: Some(username.to_owned()),
            target_space_id: None,
        };
        self.client
            .post_empty("/space/friends/unfriend", &request)
            .await?;
        self.clear_friend_share_cache()?;
        Ok(())
    }

    pub async fn list_space_friends(&self, space_id: &str) -> Result<Vec<SpaceFriendResponse>> {
        let query = vec![("spaceId", space_id.to_owned())];
        self.client
            .get_json("/space/friends", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn get_relationship(
        &self,
        target_space_id: &str,
    ) -> Result<FriendRelationshipResponse> {
        let query = vec![("targetSpaceId", target_space_id.to_owned())];
        self.client
            .get_json("/space/friends/relationship", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn refresh_friend_shares(&self, space_id: &str) -> Result<usize> {
        let access = self
            .resolve_owned_space_access(space_id)
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!("space {space_id} is not owned by the account"))
            })?;
        let friends = self.list_space_friends(space_id).await?;
        let mut updates = Vec::new();
        for friend in friends {
            if friend.share_key_version == access.key_version {
                continue;
            }
            let public_key = decode_b64(&friend.friend.public_key)?;
            let sealed_share = sealed::seal(&access.space_key, &public_key)?;
            updates.push(ShareUpdatePayload {
                friend_id: friend.friend.user_id,
                encrypted_space_key: encode_b64(&pack_payload(&sealed_share, &[])),
            });
        }
        if updates.is_empty() {
            return Ok(0);
        }
        let payload = RefreshFriendSharesRequest {
            space_id: space_id.to_owned(),
            key_version: access.key_version,
            shares: updates,
        };
        let updated = payload.shares.len();
        self.client
            .post_empty("/space/friends/shares/refresh", &payload)
            .await?;
        self.clear_friend_share_cache()?;
        Ok(updated)
    }

    pub async fn get_space_link_status(&self, space_id: &str) -> Result<SpaceLinkStatusResponse> {
        let path = format!("/space/links/{space_id}");
        self.client.get_json(&path, &[]).await.map_err(Into::into)
    }

    pub async fn create_space_link(&self, space_id: &str) -> Result<CreatedSpaceLink> {
        let access = self
            .resolve_owned_space_access_with_root(space_id)
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!("space {space_id} is not owned by the account"))
            })?;
        let status = self.get_space_link_status(space_id).await?;
        if status.active {
            return self.created_space_link_from_status(&access.root_space_key, status);
        }
        let access_key = generate_space_link_access_key()?;
        self.write_space_link(space_id, access, access_key, "/space/links")
            .await
    }

    pub async fn rotate_space_link(&self, space_id: &str) -> Result<CreatedSpaceLink> {
        let access = self
            .resolve_owned_space_access_with_root(space_id)
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!("space {space_id} is not owned by the account"))
            })?;
        let access_key = generate_space_link_access_key()?;
        self.write_space_link(space_id, access, access_key, "/space/links/rotate")
            .await
    }

    async fn write_space_link(
        &self,
        space_id: &str,
        access: ResolvedOwnedSpaceAccess,
        access_key: String,
        path: &str,
    ) -> Result<CreatedSpaceLink> {
        let access_key_material = space_link_access_key_material(&access_key)?;
        let auth_key = derive_space_link_auth_key(&access_key_material)?;
        let wrap_key = derive_space_link_wrap_key(&access_key_material)?;
        let request = SpaceLinkCreateRequest {
            space_id: space_id.to_owned(),
            auth_key: encode_b64(&auth_key),
            key_version: access.key_version,
            encrypted_space_key: encode_b64(&encrypt_secretbox_packed(
                &wrap_key,
                &access.space_key,
            )?),
            encrypted_access_key: encode_b64(&encrypt_secretbox_packed(
                &access.root_space_key,
                access_key.as_bytes(),
            )?),
        };
        let status: SpaceLinkStatusResponse = self.client.post_json(path, &request).await?;
        Ok(CreatedSpaceLink {
            access_key,
            space_username: status.space_slug.clone(),
            space_id: space_id.to_owned(),
            space_slug: status.space_slug,
            key_version: status.key_version,
        })
    }

    fn created_space_link_from_status(
        &self,
        root_space_key: &[u8],
        status: SpaceLinkStatusResponse,
    ) -> Result<CreatedSpaceLink> {
        if status.encrypted_access_key.trim().is_empty() {
            return Err(SpaceError::InvalidInput(
                "active space link is missing encrypted access key".into(),
            ));
        }
        let access_key_bytes =
            decrypt_secretbox_packed(root_space_key, &decode_b64(&status.encrypted_access_key)?)?;
        let access_key = String::from_utf8(access_key_bytes).map_err(|err| {
            SpaceError::InvalidInput(format!("invalid space link access key utf8: {err}"))
        })?;
        space_link_access_key_material(&access_key)?;
        Ok(CreatedSpaceLink {
            access_key,
            space_username: status.space_slug.clone(),
            space_id: status.space_id,
            space_slug: status.space_slug,
            key_version: status.key_version,
        })
    }

    pub async fn delete_space_link(&self, space_id: &str) -> Result<()> {
        let path = format!("/space/links/{space_id}");
        self.client.delete_empty(&path, &[]).await?;
        Ok(())
    }

    async fn resolve_owned_space_access(
        &self,
        space_id: &str,
    ) -> Result<Option<ResolvedSpaceAccess>> {
        Ok(self
            .resolve_owned_space_access_with_root(space_id)
            .await?
            .map(|value| ResolvedSpaceAccess {
                space_key: value.space_key,
                key_version: value.key_version,
            }))
    }

    async fn resolve_owned_space_access_with_root(
        &self,
        space_id: &str,
    ) -> Result<Option<ResolvedOwnedSpaceAccess>> {
        let root_space_key = match self.get_root_space_key_cached().await? {
            Some(value) => value,
            None => return Ok(None),
        };
        let spaces = self.list_owned_spaces_cached().await?;
        let Some(record) = spaces.into_iter().find(|value| value.space_id == space_id) else {
            return Ok(None);
        };
        let packed = decode_b64(&record.encrypted_space_key)?;
        let space_key = decrypt_secretbox_packed(&root_space_key, &packed)?;
        Ok(Some(ResolvedOwnedSpaceAccess {
            root_space_key,
            space_key,
            key_version: record.key_version,
        }))
    }

    async fn resolve_shared_space_access(
        &self,
        space_id: &str,
    ) -> Result<Option<ResolvedSpaceAccess>> {
        let shares = self.list_decrypted_friend_shares_cached().await?;
        let Some(share) = shares.into_iter().find(|value| value.space_id == space_id) else {
            return Ok(None);
        };
        Ok(Some(ResolvedSpaceAccess {
            space_key: share.space_key,
            key_version: share.key_version,
        }))
    }

    async fn resolve_space_access(&self, space_id: &str) -> Result<Option<ResolvedSpaceAccess>> {
        if let Some(access) = self.resolve_owned_space_access(space_id).await? {
            return Ok(Some(access));
        }
        self.resolve_shared_space_access(space_id).await
    }

    async fn resolve_space_key_for_version(
        &self,
        space_id: &str,
        version: Option<i32>,
    ) -> Result<Option<Vec<u8>>> {
        let access = match self.resolve_space_access(space_id).await? {
            Some(value) => value,
            None => return Ok(None),
        };
        let target_version = version.unwrap_or(access.key_version);
        if target_version == access.key_version {
            return Ok(Some(access.space_key));
        }
        let history = self.build_space_key_history_for_space(space_id).await?;
        Ok(history.get(&target_version).cloned())
    }

    async fn get_root_space_key_cached(&self) -> Result<Option<Vec<u8>>> {
        if let Some(value) = cache_lock(&self.root_space_key_cache, "root space key")?.clone() {
            return Ok(value);
        }
        let value = self.get_root_space_key().await?;
        *cache_lock(&self.root_space_key_cache, "root space key")? = Some(value.clone());
        Ok(value)
    }

    async fn list_owned_spaces_cached(&self) -> Result<Vec<SpaceKeyResponse>> {
        if let Some(value) = cache_lock(&self.owned_spaces_cache, "owned spaces")?.clone() {
            return Ok(value);
        }
        let value = self.list_owned_spaces().await?;
        *cache_lock(&self.owned_spaces_cache, "owned spaces")? = Some(value.clone());
        Ok(value)
    }

    async fn list_decrypted_friend_shares_cached(&self) -> Result<Vec<DecryptedFriendShare>> {
        if let Some(value) = cache_lock(&self.friend_shares_cache, "friend shares")?.clone() {
            return Ok(value);
        }
        let value = self
            .list_friend_shares()
            .await?
            .into_iter()
            .map(|share| self.decrypt_friend_share(&share))
            .collect::<Result<Vec<_>>>()?;
        *cache_lock(&self.friend_shares_cache, "friend shares")? = Some(value.clone());
        Ok(value)
    }

    fn clear_owned_space_cache(&self) -> Result<()> {
        *cache_lock(&self.owned_spaces_cache, "owned spaces")? = None;
        Ok(())
    }

    fn clear_friend_share_cache(&self) -> Result<()> {
        *cache_lock(&self.friend_shares_cache, "friend shares")? = None;
        Ok(())
    }
}

fn ensure_space_upload_size(purpose: &str, encrypted_size: usize, max_bytes: usize) -> Result<()> {
    if encrypted_size == 0 || encrypted_size > max_bytes {
        return Err(SpaceError::InvalidInput(format!(
            "{purpose} upload size must be between 1 and {max_bytes} bytes"
        )));
    }
    Ok(())
}

fn validate_message_payload(payload: &MessagePayload, plaintext_len: usize) -> Result<()> {
    if payload.text.chars().count() > MAX_SPACE_MESSAGE_TEXT_CHARS {
        return Err(SpaceError::InvalidInput(format!(
            "message text must be {MAX_SPACE_MESSAGE_TEXT_CHARS} characters or fewer"
        )));
    }
    if payload.text.len() > MAX_SPACE_MESSAGE_TEXT_BYTES {
        return Err(SpaceError::InvalidInput(format!(
            "message text must be {MAX_SPACE_MESSAGE_TEXT_BYTES} bytes or fewer"
        )));
    }
    if plaintext_len > MAX_SPACE_MESSAGE_PAYLOAD_BYTES {
        return Err(SpaceError::InvalidInput(format!(
            "message payload must be {MAX_SPACE_MESSAGE_PAYLOAD_BYTES} bytes or fewer"
        )));
    }
    Ok(())
}

fn post_response_from_feed_item(item: &FeedItem) -> PostResponse {
    PostResponse {
        post_id: item.post_id,
        space_id: item.space_id.clone(),
        space_slug: item.space_slug.clone(),
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
                .map_err(|err| SpaceError::InvalidInput(format!("invalid {field} utf8: {err}")))
        })
        .transpose()
}

impl SpaceLinkCtx {
    pub async fn open(input: OpenSpaceLinkCtxInput) -> Result<Self> {
        let access_key_material = space_link_access_key_material(&input.access_key)?;
        let auth_key = derive_space_link_auth_key(&access_key_material)?;
        let wrap_key = derive_space_link_wrap_key(&access_key_material)?;
        let client = build_http_client(
            &input.base_url,
            None,
            input.user_agent,
            input.client_package,
            input.client_version,
        )?;
        let lookup_path = format!(
            "/space/public/by-slug/{}",
            urlencoding::encode(input.space_username.trim().trim_start_matches('@'))
        );
        let lookup: SpaceLookupResponse = client.get_json(&lookup_path, &[]).await?;
        let response = client
            .post_json::<SpaceLinkLoginResponse, _>(
                "/space/links/session",
                &SpaceLinkLoginRequest {
                    space_id: lookup.space_id,
                    auth_key: encode_b64(&auth_key),
                },
            )
            .await?;
        client.set_auth_token(Some(response.session_token.clone()));
        let space_key =
            decrypt_secretbox_packed(&wrap_key, &decode_b64(&response.encrypted_space_key)?)?;
        Ok(Self {
            client,
            session_token: response.session_token,
            owner_handle: response.owner,
            space_id: response.space_id,
            space_slug: response.space_slug,
            owner_public_key: if response.public_key.trim().is_empty() {
                Vec::new()
            } else {
                decode_b64(&response.public_key)?
            },
            space_key,
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

    pub fn space_id(&self) -> &str {
        &self.space_id
    }

    pub fn space_slug(&self) -> &str {
        &self.space_slug
    }

    pub fn owner_public_key(&self) -> &[u8] {
        &self.owner_public_key
    }

    pub fn key_version(&self) -> i32 {
        self.key_version
    }

    pub fn space_key(&self) -> &[u8] {
        &self.space_key
    }

    pub async fn get_space_profile_raw(
        &self,
        version: Option<i32>,
    ) -> Result<SpaceProfileResponse> {
        let mut query = vec![("spaceId", self.space_id.clone())];
        if let Some(value) = version {
            query.push(("version", value.to_string()));
        }
        self.client
            .get_json("/space/profile", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn get_space_profile_decrypted(
        &self,
        version: Option<i32>,
    ) -> Result<DecryptedSpaceProfile> {
        let profile = self.get_space_profile_raw(version).await?;
        let space_key = self
            .resolve_space_key_for_version(Some(profile.version))
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!(
                    "missing space key for version {}",
                    profile.version
                ))
            })?;
        decrypt_space_profile(&profile, &space_key)
    }

    pub async fn list_posts(&self, cursor: Option<String>, limit: Option<i32>) -> Result<PostPage> {
        let mut query = vec![("spaceId", self.space_id.clone())];
        if let Some(value) = cursor.filter(|value| !value.trim().is_empty()) {
            query.push(("cursor", value));
        }
        if let Some(value) = limit {
            query.push(("limit", value.to_string()));
        }
        self.client
            .get_json("/space/posts", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn get_post(&self, post_id: i64) -> Result<PostResponse> {
        let path = format!("/space/posts/{post_id}");
        self.client.get_json(&path, &[]).await.map_err(Into::into)
    }

    pub async fn decrypt_post_key_fields(
        &self,
        post_id: i64,
        encrypted_post_key: &str,
        key_version: i32,
    ) -> Result<Vec<u8>> {
        let space_key = self
            .resolve_space_key_for_version(Some(key_version))
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!("missing space key for post {post_id}"))
            })?;
        let packed = decode_b64(encrypted_post_key)?;
        decrypt_secretbox_packed(&space_key, &packed)
    }

    pub async fn decrypt_post_key(&self, post: &PostResponse) -> Result<Vec<u8>> {
        self.decrypt_post_key_fields(post.post_id, &post.encrypted_post_key, post.key_version)
            .await
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
        actor: &SpaceActorResponse,
    ) -> Result<Option<Vec<u8>>> {
        if actor.encrypted_profile.trim().is_empty()
            || actor.space_id != self.space_id
            || actor.key_version <= 0
        {
            return Ok(None);
        }
        let Some(space_key) = self
            .resolve_space_key_for_version(Some(actor.key_version))
            .await?
        else {
            return Ok(None);
        };
        Ok(Some(decrypt_secretbox_packed(
            &space_key,
            &decode_b64(&actor.encrypted_profile)?,
        )?))
    }

    pub async fn download_post_asset(&self, post_id: i64, object_key: &str) -> Result<Vec<u8>> {
        let post = self.get_post(post_id).await?;
        let decrypted = self.decrypt_post(&post).await?;
        self.download_decrypted_asset(object_key, &decrypted.post_key)
            .await
    }

    pub async fn download_post_asset_with_key(
        &self,
        post_id: i64,
        encrypted_post_key: &str,
        key_version: i32,
        object_key: &str,
    ) -> Result<Vec<u8>> {
        let post_key = self
            .decrypt_post_key_fields(post_id, encrypted_post_key, key_version)
            .await?;
        self.download_decrypted_asset(object_key, &post_key).await
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
        let path = format!("/space/posts/{post_id}/likes");
        self.client
            .get_json(&path, &query)
            .await
            .map_err(Into::into)
    }

    pub async fn list_space_key_versions(&self) -> Result<Vec<SpaceKeyVersionResponse>> {
        let query = vec![("spaceId", self.space_id.clone())];
        self.client
            .get_json("/space/versions", &query)
            .await
            .map_err(Into::into)
    }

    pub fn build_space_key_history(
        &self,
        versions: &[SpaceKeyVersionResponse],
    ) -> Result<BTreeMap<i32, Vec<u8>>> {
        build_space_key_history_map(self.key_version, &self.space_key, versions)
    }

    pub async fn get_asset_url(&self, object_key: &str) -> Result<AssetDownloadResponse> {
        let query = vec![
            ("spaceId", self.space_id.clone()),
            ("objectKey", object_key.to_owned()),
        ];
        self.client
            .get_json("/space/assets/redirect", &query)
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

    async fn resolve_space_key_for_version(&self, version: Option<i32>) -> Result<Option<Vec<u8>>> {
        let target_version = version.unwrap_or(self.key_version);
        if target_version == self.key_version {
            return Ok(Some(self.space_key.clone()));
        }
        let versions = self.list_space_key_versions().await?;
        let history = build_space_key_history_map(self.key_version, &self.space_key, &versions)?;
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

fn cache_lock<'a, T>(cache: &'a Mutex<T>, name: &str) -> Result<MutexGuard<'a, T>> {
    cache
        .lock()
        .map_err(|_| SpaceError::InvalidInput(format!("{name} cache poisoned")))
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

fn decrypt_space_profile(
    profile: &SpaceProfileResponse,
    space_key: &[u8],
) -> Result<DecryptedSpaceProfile> {
    let profile_bytes = if profile.encrypted_profile.is_empty() {
        Vec::new()
    } else {
        decrypt_secretbox_packed(space_key, &decode_b64(&profile.encrypted_profile)?)?
    };
    Ok(DecryptedSpaceProfile {
        space_id: profile.space_id.clone(),
        space_slug: profile.space_slug.clone(),
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

fn build_space_key_history_map(
    current_version: i32,
    current_key: &[u8],
    versions: &[SpaceKeyVersionResponse],
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

    fn test_account_ctx(base_url: &str) -> AccountSpaceCtx {
        let (public_key, private_key) = keys::generate_keypair().expect("valid keypair");
        AccountSpaceCtx::open(OpenAccountSpaceCtxInput {
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
        .expect("account space ctx should open")
    }

    fn root_entity_response(master_key: &[u8], root_space_key: &[u8]) -> String {
        let payload = encrypt_entity_key(master_key, root_space_key).expect("root space entity");
        json!({
            "type": ROOT_SPACE_KEY_TYPE,
            "encryptedKey": payload.encrypted_key,
            "header": payload.header,
        })
        .to_string()
    }

    fn owned_space_response(
        root_space_key: &[u8],
        space_key: &[u8],
        space_id: &str,
        space_slug: &str,
        key_version: i32,
    ) -> String {
        json!([{
            "spaceId": space_id,
            "spaceSlug": space_slug,
            "encryptedSpaceKey": encode_b64(
                &encrypt_secretbox_packed(root_space_key, space_key).expect("space key wrap")
            ),
            "encryptedProfile": "",
            "keyVersion": key_version
        }])
        .to_string()
    }

    #[tokio::test]
    async fn get_or_create_root_space_key_creates_when_missing() {
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
            .get_or_create_root_space_key()
            .await
            .expect("root space key should be created");

        assert_eq!(root, expected_root);
        ensure.assert_async().await;
    }

    #[tokio::test]
    async fn get_or_create_root_space_key_uses_existing_key_from_ensure() {
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
            .get_or_create_root_space_key()
            .await
            .expect("root space key should come from ensure response");
        assert_eq!(root, expected_root);
        ensure.assert_async().await;
    }

    #[tokio::test]
    async fn space_link_open_decrypts_current_space_key() {
        let mut server = Server::new_async().await;
        let space_key = generate_key();
        let access_key = "AbC123xYz789";
        let access_key_material =
            space_link_access_key_material(access_key).expect("access key material");
        let auth_key = derive_space_link_auth_key(&access_key_material).expect("auth key");
        let wrap_key = derive_space_link_wrap_key(&access_key_material).expect("wrap key");
        let encrypted_space_key = encode_b64(
            &encrypt_secretbox_packed(&wrap_key, &space_key).expect("encrypted space key"),
        );

        let lookup = server
            .mock("GET", "/space/public/by-slug/owner-gallery")
            .with_status(200)
            .with_body(
                json!({
                    "spaceId": "space_owner_gallery",
                    "spaceSlug": "owner-gallery",
                    "owner": "owner-gallery",
                })
                .to_string(),
            )
            .create_async()
            .await;

        let session = server
            .mock("POST", "/space/links/session")
            .match_body(Matcher::JsonString(
                json!({
                    "spaceId": "space_owner_gallery",
                    "authKey": encode_b64(&auth_key),
                })
                .to_string(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "sessionToken": "space-link-token",
                    "spaceId": "space_owner_gallery",
                    "spaceSlug": "owner-gallery",
                    "owner": "owner-handle",
                    "keyVersion": 3,
                    "encryptedSpaceKey": encrypted_space_key,
                    "encryptedProfile": "",
                })
                .to_string(),
            )
            .create_async()
            .await;

        let ctx = SpaceLinkCtx::open(OpenSpaceLinkCtxInput {
            base_url: server.url(),
            space_username: "@owner-gallery".to_owned(),
            access_key: access_key.to_owned(),
            user_agent: None,
            client_package: None,
            client_version: None,
        })
        .await
        .expect("space link ctx should open");

        assert_eq!(ctx.space_id(), "space_owner_gallery");
        assert_eq!(ctx.space_slug(), "owner-gallery");
        assert_eq!(ctx.key_version(), 3);
        assert_eq!(ctx.space_key(), space_key.as_slice());
        lookup.assert_async().await;
        session.assert_async().await;
    }

    #[tokio::test]
    async fn space_link_open_rejects_wrong_access_key() {
        let mut server = Server::new_async().await;
        let space_key = generate_key();
        let correct_access_key = "CorrectKey12";
        let wrong_access_key = "WrongKey1234";
        let correct_access_key_material = space_link_access_key_material(correct_access_key)
            .expect("correct access key material");
        let wrong_access_key_material =
            space_link_access_key_material(wrong_access_key).expect("wrong access key material");
        let wrong_auth_key =
            derive_space_link_auth_key(&wrong_access_key_material).expect("auth key");
        let correct_wrap_key =
            derive_space_link_wrap_key(&correct_access_key_material).expect("wrap key");
        let encrypted_space_key = encode_b64(
            &encrypt_secretbox_packed(&correct_wrap_key, &space_key).expect("encrypted space key"),
        );

        let lookup = server
            .mock("GET", "/space/public/by-slug/owner-gallery")
            .with_status(200)
            .with_body(
                json!({
                    "spaceId": "space_owner_gallery",
                    "spaceSlug": "owner-gallery",
                    "owner": "owner-gallery",
                })
                .to_string(),
            )
            .create_async()
            .await;

        let session = server
            .mock("POST", "/space/links/session")
            .match_body(Matcher::JsonString(
                json!({
                    "spaceId": "space_owner_gallery",
                    "authKey": encode_b64(&wrong_auth_key),
                })
                .to_string(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "sessionToken": "space-link-token",
                    "spaceId": "space_owner_gallery",
                    "spaceSlug": "owner-gallery",
                    "owner": "owner-handle",
                    "keyVersion": 3,
                    "encryptedSpaceKey": encrypted_space_key,
                })
                .to_string(),
            )
            .create_async()
            .await;

        let err = match SpaceLinkCtx::open(OpenSpaceLinkCtxInput {
            base_url: server.url(),
            space_username: "owner-gallery".to_owned(),
            access_key: wrong_access_key.to_owned(),
            user_agent: None,
            client_package: None,
            client_version: None,
        })
        .await
        {
            Ok(_) => panic!("wrong access key should not decrypt space key"),
            Err(err) => err,
        };

        assert!(matches!(err, SpaceError::Crypto(_)));
        lookup.assert_async().await;
        session.assert_async().await;
    }

    #[tokio::test]
    async fn space_link_decrypt_post_key_uses_post_version() {
        let mut server = Server::new_async().await;
        let current_space_key = generate_key();
        let previous_space_key = generate_key();
        let post_key = generate_key();
        let wrapped_previous = encode_b64(
            &encrypt_secretbox_packed(&current_space_key, &previous_space_key)
                .expect("wrapped previous key"),
        );
        let versions = server
            .mock("GET", "/space/versions")
            .match_header("x-auth-token", "link-token")
            .match_query(Matcher::UrlEncoded(
                "spaceId".into(),
                "space_owner_gallery".into(),
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
        let ctx = SpaceLinkCtx {
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
            space_id: "space_owner_gallery".to_owned(),
            space_slug: "owner-gallery".to_owned(),
            owner_public_key: Vec::new(),
            space_key: current_space_key,
            key_version: 2,
        };
        let post = PostResponse {
            post_id: 42,
            space_id: "space_owner_gallery".to_owned(),
            space_slug: "owner-gallery".to_owned(),
            owner_user_id: 7,
            author: SpaceActorResponse {
                user_id: 7,
                space_id: "space_owner_gallery".to_owned(),
                space_slug: "owner-gallery".to_owned(),
                key_version: 2,
                ..Default::default()
            },
            encrypted_post_key: encode_b64(
                &encrypt_secretbox_packed(&previous_space_key, &post_key)
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
    async fn space_link_download_post_asset_with_key_skips_post_fetch() {
        let mut server = Server::new_async().await;
        let space_key = generate_key();
        let post_key = generate_key();
        let object_key = "space/1/posts/post-object";
        let encrypted_post_key =
            encode_b64(&encrypt_secretbox_packed(&space_key, &post_key).expect("post key wrap"));
        let encrypted_asset =
            encrypt_asset_payload(&post_key, b"post-image").expect("asset encryption");

        let redirect = server
            .mock("GET", "/space/assets/redirect")
            .match_header("x-auth-token", "link-token")
            .match_query(Matcher::AllOf(vec![
                Matcher::UrlEncoded("spaceId".into(), "space_owner_gallery".into()),
                Matcher::UrlEncoded("objectKey".into(), object_key.into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "url": format!("{}/objects/post-object", server.url()),
                    "expiresIn": 900
                })
                .to_string(),
            )
            .create_async()
            .await;
        let object = server
            .mock("GET", "/objects/post-object")
            .with_status(200)
            .with_body(encrypted_asset)
            .create_async()
            .await;
        let ctx = SpaceLinkCtx {
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
            space_id: "space_owner_gallery".to_owned(),
            space_slug: "owner-gallery".to_owned(),
            owner_public_key: Vec::new(),
            space_key,
            key_version: 1,
        };

        let bytes = ctx
            .download_post_asset_with_key(42, &encrypted_post_key, 1, object_key)
            .await
            .expect("asset should decrypt");

        assert_eq!(bytes, b"post-image");
        redirect.assert_async().await;
        object.assert_async().await;
    }

    #[tokio::test]
    async fn account_space_key_resolution_is_cached_within_context() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_space_key = generate_key();
        let friend_space_key = generate_key();
        let encrypted_profile = encode_b64(
            &encrypt_secretbox_packed(&friend_space_key, b"friend-profile").expect("profile wrap"),
        );
        let sealed_share =
            sealed::seal(&friend_space_key, ctx.public_key()).expect("friend share seal");
        let encrypted_space_key = encode_b64(&pack_payload(&sealed_share, &[]));

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_SPACE_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_space_key))
            .expect(1)
            .create_async()
            .await;
        let spaces = server
            .mock("GET", "/space")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(owned_space_response(
                &root_space_key,
                &generate_key(),
                "space_owner_main",
                "owner",
                1,
            ))
            .expect(1)
            .create_async()
            .await;
        let shares = server
            .mock("GET", "/space/friends/shares")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "friend": "friend",
                    "spaceId": "space_friend",
                    "spaceSlug": "friend",
                    "encryptedSpaceKey": encrypted_space_key,
                    "keyVersion": 1
                }])
                .to_string(),
            )
            .expect(1)
            .create_async()
            .await;
        let actor = SpaceActorResponse {
            user_id: 7,
            space_id: "space_friend".to_owned(),
            space_slug: "friend".to_owned(),
            key_version: 1,
            encrypted_profile,
            ..Default::default()
        };

        let first = ctx
            .decrypt_actor_profile(&actor)
            .await
            .expect("first profile decrypt");
        let second = ctx
            .decrypt_actor_profile(&actor)
            .await
            .expect("second profile decrypt");

        assert_eq!(first.as_deref(), Some(b"friend-profile".as_slice()));
        assert_eq!(second.as_deref(), Some(b"friend-profile".as_slice()));
        entity.assert_async().await;
        spaces.assert_async().await;
        shares.assert_async().await;
    }

    #[tokio::test]
    async fn upload_post_asset_uses_presign_and_object_store() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());

        let presign = server
            .mock("POST", "/space/uploads/presign")
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
            .mock("POST", "/space/uploads/presign")
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
    async fn presign_uploads_reject_oversized_space_assets() {
        let server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());

        let post_error = ctx
            .presign_post_upload(MAX_SPACE_POST_UPLOAD_BYTES + 1)
            .await
            .expect_err("oversized post upload should fail before presign");
        assert!(post_error.to_string().contains("post upload size"));
        assert!(
            post_error
                .to_string()
                .contains(&MAX_SPACE_POST_UPLOAD_BYTES.to_string())
        );

        let avatar_error = ctx
            .presign_avatar_upload("space_owner_main", MAX_SPACE_AVATAR_UPLOAD_BYTES + 1)
            .await
            .expect_err("oversized avatar upload should fail before presign");
        assert!(avatar_error.to_string().contains("avatar upload size"));
        assert!(
            avatar_error
                .to_string()
                .contains(&MAX_SPACE_AVATAR_UPLOAD_BYTES.to_string())
        );
    }

    #[tokio::test]
    async fn upload_avatar_uses_avatar_presign_and_object_store() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let presign = server
            .mock("POST", "/space/uploads/presign")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"purpose\":\"avatar\"".into()),
                Matcher::Regex("\"spaceId\":\"space_owner_main\"".into()),
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
            .upload_avatar("space_owner_main", &generate_key(), b"avatar-bytes")
            .await
            .expect("avatar upload should succeed");

        assert_eq!(payload.object_key, "avatar-object");
        assert!(payload.size.unwrap_or_default() > 0);
        presign.assert_async().await;
        upload.assert_async().await;
    }

    #[tokio::test]
    async fn create_space_with_key_sends_encrypted_space_and_profile_payloads() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let space_key = generate_key();
        let root_space_key = generate_key();
        let ensure_root = server
            .mock("POST", "/user-entity/key/ensure")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"type\":\"space\"".into()),
                Matcher::Regex("\"encryptedKey\":\"[^\"]+\"".into()),
                Matcher::Regex("\"header\":\"[^\"]+\"".into()),
            ]))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_space_key))
            .create_async()
            .await;
        let create_space = server
            .mock("POST", "/space")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"spaceSlug\":\"owner-main\"".into()),
                Matcher::Regex("\"encryptedSpaceKey\":\"[^\"]+\"".into()),
                Matcher::Regex("\"encryptedProfile\":\"[^\"]+\"".into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "spaceId": "space_owner_main",
                    "spaceSlug": "owner-main",
                    "encryptedSpaceKey": "",
                    "encryptedProfile": "",
                    "keyVersion": 1
                })
                .to_string(),
            )
            .create_async()
            .await;

        let created = ctx
            .create_space_with_key("owner-main", &space_key, b"profile-json")
            .await
            .expect("space should be created");

        assert_eq!(created.space_id, "space_owner_main");
        assert_eq!(created.space_slug, "owner-main");
        assert_eq!(created.key_version, 1);
        let profile_plaintext =
            decrypt_secretbox_packed(&space_key, &decode_b64(&created.encrypted_profile).unwrap())
                .expect("created profile should decrypt");
        assert_eq!(profile_plaintext, b"profile-json");
        ensure_root.assert_async().await;
        create_space.assert_async().await;
    }

    #[tokio::test]
    async fn create_post_includes_space_key_version() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_space_key = generate_key();
        let space_key = generate_key();
        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_SPACE_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_space_key))
            .create_async()
            .await;
        let spaces = server
            .mock("GET", "/space")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "spaceId": "space_owner_main",
                    "spaceSlug": "owner-main",
                    "encryptedSpaceKey": encode_b64(&encrypt_secretbox_packed(&root_space_key, &space_key).expect("space key wrap")),
                    "encryptedProfile": "",
                    "keyVersion": 3
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let create = server
            .mock("POST", "/space/posts")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::Regex("\"keyVersion\":3".into()))
            .with_status(200)
            .with_body(json!({"postId": 42}).to_string())
            .create_async()
            .await;

        let (post_id, _) = ctx
            .create_post("space_owner_main", &[], None, None)
            .await
            .expect("post creation should send key version");

        assert_eq!(post_id, 42);
        entity.assert_async().await;
        spaces.assert_async().await;
        create.assert_async().await;
    }

    #[tokio::test]
    async fn update_space_profile_sends_encrypted_profile_and_avatar_payload() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_space_key = generate_key();
        let space_key = generate_key();
        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_SPACE_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_space_key))
            .create_async()
            .await;
        let spaces = server
            .mock("GET", "/space")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(owned_space_response(
                &root_space_key,
                &space_key,
                "space_owner_main",
                "owner-main",
                3,
            ))
            .create_async()
            .await;
        let update = server
            .mock("POST", "/space/profile")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"spaceId\":\"space_owner_main\"".into()),
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
            .update_space_profile(
                "space_owner_main",
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
        spaces.assert_async().await;
        update.assert_async().await;
    }

    #[tokio::test]
    async fn get_space_profile_decrypted_loads_and_decrypts_profile() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_space_key = generate_key();
        let space_key = generate_key();
        let encrypted_profile = encode_b64(
            &encrypt_secretbox_packed(&space_key, b"profile-json").expect("profile wrap"),
        );
        let profile = server
            .mock("GET", "/space/profile")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "spaceId".into(),
                "space_owner_main".into(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "spaceId": "space_owner_main",
                    "spaceSlug": "owner-main",
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
                ROOT_SPACE_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_space_key))
            .create_async()
            .await;
        let spaces = server
            .mock("GET", "/space")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(owned_space_response(
                &root_space_key,
                &space_key,
                "space_owner_main",
                "owner-main",
                3,
            ))
            .create_async()
            .await;

        let decrypted = ctx
            .get_space_profile_decrypted("space_owner_main", None)
            .await
            .expect("profile should decrypt");

        assert_eq!(decrypted.space_id, "space_owner_main");
        assert_eq!(decrypted.space_slug, "owner-main");
        assert_eq!(decrypted.version, 3);
        assert_eq!(decrypted.friends, 2);
        assert_eq!(decrypted.profile, b"profile-json");
        profile.assert_async().await;
        entity.assert_async().await;
        spaces.assert_async().await;
    }

    #[tokio::test]
    async fn add_friend_from_link_sends_reciprocal_space_shares() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_space_key = generate_key();
        let requester_space_key = generate_key();
        let target_space_key = generate_key();
        let (target_public_key, _) = keys::generate_keypair().expect("valid target keypair");
        let entity_payload =
            encrypt_entity_key(&ctx.master_key, &root_space_key).expect("root space entity");

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_SPACE_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "type": ROOT_SPACE_KEY_TYPE,
                    "encryptedKey": entity_payload.encrypted_key,
                    "header": entity_payload.header,
                })
                .to_string(),
            )
            .create_async()
            .await;
        let spaces = server
            .mock("GET", "/space")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "spaceId": "space_viewer_main",
                    "spaceSlug": "viewer-main",
                    "encryptedSpaceKey": encode_b64(&encrypt_secretbox_packed(&root_space_key, &requester_space_key).expect("space key wrap")),
                    "encryptedProfile": "",
                    "keyVersion": 4
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let add = server
            .mock("POST", "/space/friends/add")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"targetSpaceId\":\"space_owner_main\"".into()),
                Matcher::Regex("\"linkSessionToken\":\"link-session-token\"".into()),
                Matcher::Regex("\"requesterSpaceId\":\"space_viewer_main\"".into()),
                Matcher::Regex("\"targetKeyVersion\":5".into()),
                Matcher::Regex("\"requesterKeyVersion\":4".into()),
                Matcher::Regex("\"targetEncryptedSpaceKey\":\"[^\"]+\"".into()),
                Matcher::Regex("\"requesterEncryptedSpaceKey\":\"[^\"]+\"".into()),
            ]))
            .with_status(200)
            .with_body(json!({"status": "friend"}).to_string())
            .create_async()
            .await;
        let link = SpaceLinkCtx {
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
            space_id: "space_owner_main".to_owned(),
            space_slug: "owner-main".to_owned(),
            owner_public_key: target_public_key,
            space_key: target_space_key,
            key_version: 5,
        };

        let response = ctx
            .add_friend_from_link(&link)
            .await
            .expect("direct friendship should send reciprocal shares");

        assert_eq!(response.status, "friend");
        entity.assert_async().await;
        spaces.assert_async().await;
        add.assert_async().await;
    }

    #[tokio::test]
    async fn space_status_mutations_accept_empty_server_responses() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());

        let delete_post = server
            .mock("DELETE", "/space/posts/42")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .create_async()
            .await;
        let unfriend_space = server
            .mock("POST", "/space/friends/unfriend")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(
                json!({"targetSpaceId": "space_owner_main"}).to_string(),
            ))
            .with_status(200)
            .create_async()
            .await;
        let unfriend_username = server
            .mock("POST", "/space/friends/unfriend")
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
        ctx.unfriend_by_space("space_owner_main")
            .await
            .expect("unfriend by space should accept empty response");
        ctx.unfriend_by_username("owner")
            .await
            .expect("unfriend by username should accept empty response");

        delete_post.assert_async().await;
        unfriend_space.assert_async().await;
        unfriend_username.assert_async().await;
    }

    #[tokio::test]
    async fn update_post_caption_uses_caption_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let update = server
            .mock("POST", "/space/posts/42/caption")
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
            .mock("POST", "/space/posts/42/like")
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
            .mock("GET", "/space/unread")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(json!({"feedUnread": true, "notificationsUnread": false}).to_string())
            .create_async()
            .await;
        let feed_read = server
            .mock("POST", "/space/feed/read")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(json!({"postId": 42}).to_string()))
            .with_status(200)
            .with_body(json!({"feedUnread": false, "notificationsUnread": false}).to_string())
            .create_async()
            .await;
        let notifications_read = server
            .mock("POST", "/space/messages/read")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(
                json!({"friendSpaceId": "space_friend"}).to_string(),
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
            !ctx.mark_notifications_read("space_friend")
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
        let root_space_key = generate_key();
        let space_key = generate_key();
        let (friend_public_key, _) = keys::generate_keypair().expect("valid friend keypair");

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_SPACE_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_space_key))
            .create_async()
            .await;
        let spaces = server
            .mock("GET", "/space")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(owned_space_response(
                &root_space_key,
                &space_key,
                "space_owner_main",
                "owner-main",
                3,
            ))
            .create_async()
            .await;
        let friends = server
            .mock("GET", "/space/friends")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "spaceId".into(),
                "space_owner_main".into(),
            ))
            .with_status(200)
            .with_body(
                json!([{
                    "friend": {
                        "userId": 7,
                        "spaceId": "space_friend",
                        "spaceSlug": "friend",
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
            .mock("POST", "/space/messages/space_friend")
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
                        "spaceId": "space_owner_main",
                        "spaceSlug": "owner-main",
                        "publicKey": encode_b64(&ctx.public_key),
                        "keyVersion": 3
                    },
                    "recipient": {
                        "userId": 7,
                        "spaceId": "space_friend",
                        "spaceSlug": "friend",
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
            .mock("POST", "/space/message/wmsg_reply/like")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(json!({"like": true}).to_string()))
            .with_status(200)
            .with_body(json!({"liked": true}).to_string())
            .create_async()
            .await;
        let delete = server
            .mock("DELETE", "/space/message/wmsg_reply")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .create_async()
            .await;

        let created = ctx
            .reply_to_message("space_friend", "wmsg_parent", "hello")
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
        spaces.assert_async().await;
        friends.assert_async().await;
        reply.assert_async().await;
        like.assert_async().await;
        delete.assert_async().await;
    }

    #[test]
    fn message_payload_limits_reject_oversized_text_and_payload() {
        let valid = MessagePayload {
            version: 1,
            kind: MESSAGE_KIND_REGULAR.to_owned(),
            text: "hello".to_owned(),
            quote: None,
        };
        let valid_plaintext = serde_json::to_vec(&valid).expect("valid payload json");
        validate_message_payload(&valid, valid_plaintext.len())
            .expect("short message should be accepted");

        let too_many_chars = MessagePayload {
            text: "a".repeat(MAX_SPACE_MESSAGE_TEXT_CHARS + 1),
            ..valid.clone()
        };
        let plaintext = serde_json::to_vec(&too_many_chars).expect("long text json");
        let err = validate_message_payload(&too_many_chars, plaintext.len())
            .expect_err("long message text should be rejected");
        assert!(err.to_string().contains("characters or fewer"));

        let oversized_payload = MessagePayload {
            text: "ok".to_owned(),
            quote: Some(MessageQuote {
                post_id: 1,
                space_id: "space_owner_main".to_owned(),
                encrypted_post_key: None,
                key_version: None,
                caption: Some("a".repeat(MAX_SPACE_MESSAGE_PAYLOAD_BYTES)),
                object_key: None,
                width: None,
                height: None,
                media_type: None,
            }),
            ..valid
        };
        let plaintext = serde_json::to_vec(&oversized_payload).expect("large payload json");
        let err = validate_message_payload(&oversized_payload, plaintext.len())
            .expect_err("large serialized payload should be rejected");
        assert!(err.to_string().contains("payload must be"));
    }

    #[tokio::test]
    async fn list_post_likers_uses_post_likes_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let likers = server
            .mock("GET", "/space/posts/42/likes")
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
                            "spaceId": "space_liker",
                            "spaceSlug": "liker"
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

        assert_eq!(response.likers[0].actor.space_id, "space_liker");
        assert_eq!(response.next_cursor, "2000:8");
        likers.assert_async().await;
    }

    #[tokio::test]
    async fn list_space_friends_uses_space_friends_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let friends = server
            .mock("GET", "/space/friends")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "spaceId".into(),
                "space_owner_main".into(),
            ))
            .with_status(200)
            .with_body(
                json!([{
                    "friend": {
                        "userId": 8,
                        "spaceId": "space_friend",
                        "spaceSlug": "friend",
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
            .list_space_friends("space_owner_main")
            .await
            .expect("friends should load");

        assert_eq!(response.len(), 1);
        assert_eq!(response[0].friend.space_id, "space_friend");
        assert_eq!(response[0].share_key_version, 2);
        friends.assert_async().await;
    }

    #[tokio::test]
    async fn get_relationship_uses_relationship_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let relationship = server
            .mock("GET", "/space/friends/relationship")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "targetSpaceId".into(),
                "space_friend".into(),
            ))
            .with_status(200)
            .with_body(json!({"relationship": "friend"}).to_string())
            .create_async()
            .await;

        let response = ctx
            .get_relationship("space_friend")
            .await
            .expect("relationship should load");

        assert_eq!(response.relationship, "friend");
        relationship.assert_async().await;
    }

    #[tokio::test]
    async fn space_link_list_post_likers_uses_session_token() {
        let mut server = Server::new_async().await;
        let ctx = SpaceLinkCtx {
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
            space_id: "space_owner_main".to_owned(),
            space_slug: "owner-main".to_owned(),
            owner_public_key: Vec::new(),
            space_key: generate_key(),
            key_version: 1,
        };
        let likers = server
            .mock("GET", "/space/posts/42/likes")
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
        let root_space_key = generate_key();
        let space_key = generate_key();
        let (friend_public_key, _) = keys::generate_keypair().expect("valid friend keypair");
        let entity_payload =
            encrypt_entity_key(&ctx.master_key, &root_space_key).expect("root space entity");

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_SPACE_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "type": ROOT_SPACE_KEY_TYPE,
                    "encryptedKey": entity_payload.encrypted_key,
                    "header": entity_payload.header,
                })
                .to_string(),
            )
            .create_async()
            .await;
        let spaces = server
            .mock("GET", "/space")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "spaceId": "space_owner_main",
                    "spaceSlug": "owner-main",
                    "encryptedSpaceKey": encode_b64(&encrypt_secretbox_packed(&root_space_key, &space_key).expect("space key wrap")),
                    "encryptedProfile": "",
                    "keyVersion": 3
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let friends = server
            .mock("GET", "/space/friends")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "spaceId".into(),
                "space_owner_main".into(),
            ))
            .with_status(200)
            .with_body(
                json!([{
                    "friend": {
                        "userId": 7,
                        "spaceId": "space_viewer",
                        "spaceSlug": "viewer",
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
            .mock("POST", "/space/friends/shares/refresh")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"friendId\":7".into()),
                Matcher::Regex("\"keyVersion\":3".into()),
            ]))
            .with_status(200)
            .create_async()
            .await;

        let updated = ctx
            .refresh_friend_shares("space_owner_main")
            .await
            .expect("refresh should accept empty response");

        assert_eq!(updated, 1);
        entity.assert_async().await;
        spaces.assert_async().await;
        friends.assert_async().await;
        refresh.assert_async().await;
    }

    #[tokio::test]
    async fn space_link_status_create_and_delete_use_link_endpoints() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_space_key = generate_key();
        let space_key = generate_key();

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_SPACE_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_space_key))
            .expect(1)
            .create_async()
            .await;
        let spaces = server
            .mock("GET", "/space")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(owned_space_response(
                &root_space_key,
                &space_key,
                "space_owner_main",
                "owner-main",
                3,
            ))
            .expect(1)
            .create_async()
            .await;
        let status = server
            .mock("GET", "/space/links/space_owner_main")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!({
                    "spaceId": "space_owner_main",
                    "spaceSlug": "owner-main",
                    "keyVersion": 3,
                    "active": false,
                    "encryptedAccessKey": "",
                    "createdAt": "2026-04-16T00:00:00Z",
                    "updatedAt": "2026-04-16T00:00:00Z"
                })
                .to_string(),
            )
            .expect(2)
            .create_async()
            .await;
        let create = server
            .mock("POST", "/space/links")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"spaceId\":\"space_owner_main\"".into()),
                Matcher::Regex("\"authKey\":\"[^\"]+\"".into()),
                Matcher::Regex("\"keyVersion\":3".into()),
                Matcher::Regex("\"encryptedSpaceKey\":\"[^\"]+\"".into()),
                Matcher::Regex("\"encryptedAccessKey\":\"[^\"]+\"".into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "spaceId": "space_owner_main",
                    "spaceSlug": "owner-main",
                    "keyVersion": 3,
                    "active": true,
                    "encryptedAccessKey": "owner-link-secret",
                    "createdAt": "2026-04-16T00:00:00Z",
                    "updatedAt": "2026-04-16T00:00:00Z"
                })
                .to_string(),
            )
            .create_async()
            .await;
        let rotate = server
            .mock("POST", "/space/links/rotate")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::AllOf(vec![
                Matcher::Regex("\"spaceId\":\"space_owner_main\"".into()),
                Matcher::Regex("\"authKey\":\"[^\"]+\"".into()),
                Matcher::Regex("\"keyVersion\":3".into()),
                Matcher::Regex("\"encryptedSpaceKey\":\"[^\"]+\"".into()),
                Matcher::Regex("\"encryptedAccessKey\":\"[^\"]+\"".into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "spaceId": "space_owner_main",
                    "spaceSlug": "owner-main",
                    "keyVersion": 3,
                    "active": true,
                    "encryptedAccessKey": "rotated-owner-link-secret",
                    "createdAt": "2026-04-16T00:00:00Z",
                    "updatedAt": "2026-04-16T00:01:00Z"
                })
                .to_string(),
            )
            .create_async()
            .await;
        let delete = server
            .mock("DELETE", "/space/links/space_owner_main")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .create_async()
            .await;

        let status_response = ctx
            .get_space_link_status("space_owner_main")
            .await
            .expect("link status should load");
        let created = ctx
            .create_space_link("space_owner_main")
            .await
            .expect("link should be created");
        let rotated = ctx
            .rotate_space_link("space_owner_main")
            .await
            .expect("link should be rotated");
        ctx.delete_space_link("space_owner_main")
            .await
            .expect("link should be deleted");

        assert!(!status_response.active);
        assert_eq!(created.space_id, "space_owner_main");
        assert_eq!(created.space_username, "owner-main");
        assert_eq!(created.access_key.len(), 12);
        assert!(
            created
                .access_key
                .bytes()
                .all(|value| value.is_ascii_alphanumeric())
        );
        assert_eq!(created.key_version, 3);
        assert_eq!(rotated.space_id, "space_owner_main");
        assert_eq!(rotated.space_username, "owner-main");
        assert_eq!(rotated.access_key.len(), 12);
        assert_ne!(rotated.access_key, created.access_key);
        status.assert_async().await;
        entity.assert_async().await;
        spaces.assert_async().await;
        create.assert_async().await;
        rotate.assert_async().await;
        delete.assert_async().await;
    }

    #[tokio::test]
    async fn create_space_link_reuses_active_encrypted_access_key() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_space_key = generate_key();
        let space_key = generate_key();
        let access_key = "AbC123xYz789";
        let encrypted_access_key = encode_b64(
            &encrypt_secretbox_packed(&root_space_key, access_key.as_bytes())
                .expect("encrypted access key"),
        );

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_SPACE_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(root_entity_response(&ctx.master_key, &root_space_key))
            .create_async()
            .await;
        let spaces = server
            .mock("GET", "/space")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(owned_space_response(
                &root_space_key,
                &space_key,
                "space_owner_main",
                "owner-main",
                3,
            ))
            .create_async()
            .await;
        let status = server
            .mock("GET", "/space/links/space_owner_main")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!({
                    "spaceId": "space_owner_main",
                    "spaceSlug": "owner-main",
                    "keyVersion": 3,
                    "active": true,
                    "encryptedAccessKey": encrypted_access_key,
                    "createdAt": "2026-04-16T00:00:00Z",
                    "updatedAt": "2026-04-16T00:00:00Z"
                })
                .to_string(),
            )
            .create_async()
            .await;

        let created = ctx
            .create_space_link("space_owner_main")
            .await
            .expect("active link should be reusable");

        assert_eq!(created.access_key, access_key);
        assert_eq!(created.space_id, "space_owner_main");
        assert_eq!(created.space_username, "owner-main");
        assert_eq!(created.key_version, 3);
        entity.assert_async().await;
        spaces.assert_async().await;
        status.assert_async().await;
    }

    #[tokio::test]
    async fn list_feed_uses_space_feed_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let feed = server
            .mock("GET", "/space/feed")
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
                        "spaceId": "space_owner_gallery",
                        "spaceSlug": "owner-gallery",
                        "ownerUserId": 7,
                        "author": {
                            "userId": 7,
                            "spaceId": "space_owner_gallery",
                            "spaceSlug": "owner-gallery"
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
    async fn list_posts_uses_space_posts_page_endpoint() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let posts = server
            .mock("GET", "/space/posts")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::AllOf(vec![
                Matcher::UrlEncoded("spaceId".into(), "space_owner_gallery".into()),
                Matcher::UrlEncoded("cursor".into(), "42".into()),
                Matcher::UrlEncoded("limit".into(), "5".into()),
            ]))
            .with_status(200)
            .with_body(
                json!({
                    "items": [{
                        "postId": 41,
                        "spaceId": "space_owner_gallery",
                        "spaceSlug": "owner-gallery",
                        "ownerUserId": 7,
                        "author": {
                            "userId": 7,
                            "spaceId": "space_owner_gallery",
                            "spaceSlug": "owner-gallery"
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
            .list_posts("space_owner_gallery", Some("42".to_owned()), Some(5))
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
        let root_space_key = generate_key();
        let space_key = generate_key();
        let post_key = generate_key();
        let caption = b"hello from post";
        let entity_payload =
            encrypt_entity_key(&ctx.master_key, &root_space_key).expect("root space entity");

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_SPACE_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "type": ROOT_SPACE_KEY_TYPE,
                    "encryptedKey": entity_payload.encrypted_key,
                    "header": entity_payload.header,
                })
                .to_string(),
            )
            .create_async()
            .await;
        let spaces = server
            .mock("GET", "/space")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "spaceId": "space_owner_gallery",
                    "spaceSlug": "owner-gallery",
                    "encryptedSpaceKey": encode_b64(&encrypt_secretbox_packed(&root_space_key, &space_key).expect("space key wrap")),
                    "encryptedProfile": "",
                    "keyVersion": 3
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let post = server
            .mock("GET", "/space/posts/42")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!({
                    "postId": 42,
                    "spaceId": "space_owner_gallery",
                    "spaceSlug": "owner-gallery",
                    "author": {
                        "userId": 7,
                        "spaceId": "space_owner_gallery",
                        "spaceSlug": "owner-gallery"
                    },
                    "encryptedPostKey": encode_b64(&encrypt_secretbox_packed(&space_key, &post_key).expect("post key wrap")),
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
        spaces.assert_async().await;
        post.assert_async().await;
    }

    #[tokio::test]
    async fn hydrate_space_keys_loads_owned_and_friends_spaces() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_space_key = generate_key();
        let owned_space_key = generate_key();
        let shared_space_key = generate_key();
        let entity_payload =
            encrypt_entity_key(&ctx.master_key, &root_space_key).expect("root space entity");
        let sealed_share =
            sealed::seal(&shared_space_key, &ctx.public_key).expect("sealed space share");

        let entity = server
            .mock("GET", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_SPACE_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "type": ROOT_SPACE_KEY_TYPE,
                    "encryptedKey": entity_payload.encrypted_key,
                    "header": entity_payload.header,
                })
                .to_string(),
            )
            .create_async()
            .await;
        let owned = server
            .mock("GET", "/space")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "spaceId": "space_owner_gallery",
                    "spaceSlug": "owner-gallery",
                    "encryptedSpaceKey": encode_b64(&encrypt_secretbox_packed(&root_space_key, &owned_space_key).expect("owned wrap")),
                    "encryptedProfile": "",
                    "keyVersion": 1
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let shares = server
            .mock("GET", "/space/friends/shares")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "friend": "owner",
                    "spaceId": "space_shared_gallery",
                    "spaceSlug": "shared-gallery",
                    "encryptedSpaceKey": encode_b64(&pack_payload(&sealed_share, &[])),
                    "encryptedProfile": "",
                    "keyVersion": 4
                }])
                .to_string(),
            )
            .create_async()
            .await;

        let hydrated = ctx
            .hydrate_space_keys()
            .await
            .expect("space keys should hydrate");

        assert_eq!(hydrated.owned.len(), 1);
        assert_eq!(hydrated.owned[0].0, "space_owner_gallery");
        assert_eq!(hydrated.owned[0].1, owned_space_key);
        assert_eq!(hydrated.friends.len(), 1);
        assert_eq!(hydrated.friends[0].space_id, "space_shared_gallery");
        assert_eq!(hydrated.friends[0].space_key, shared_space_key);
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
            SpaceKeyVersionResponse {
                version: 3,
                wrapped_prev_key: encode_b64(&encrypt_secretbox_packed(&v3, &v2).expect("wrap v2")),
                created_at: "2026-01-03T00:00:00Z".to_owned(),
            },
            SpaceKeyVersionResponse {
                version: 2,
                wrapped_prev_key: encode_b64(&encrypt_secretbox_packed(&v2, &v1).expect("wrap v1")),
                created_at: "2026-01-02T00:00:00Z".to_owned(),
            },
        ];

        let history = build_space_key_history_map(3, &v3, &versions).expect("history");

        assert_eq!(history.get(&3), Some(&v3));
        assert_eq!(history.get(&2), Some(&v2));
        assert_eq!(history.get(&1), Some(&v1));
    }
}
