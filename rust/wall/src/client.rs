use std::collections::BTreeMap;

use crate::crypto::{
    decode_b64, decode_b64_url, decrypt_entity_key, decrypt_secretbox_packed,
    derive_wall_link_auth_key, derive_wall_link_wrap_key, encode_b64, encode_b64_url,
    encrypt_asset_payload, encrypt_entity_key, encrypt_secretbox_packed, generate_key,
    pack_payload, unpack_payload,
};
use crate::error::{Result, WallError};
use crate::models::{
    CreatedWall, CreatedWallLink, DecryptedComment, DecryptedFollowShare, DecryptedPost,
    DecryptedWallProfile, FeedItem, FeedPage, HydratedKeys, OpenAccountWallCtxInput,
    OpenWallLinkCtxInput, PrivateKeySource,
};
use crate::transport::{
    ApproveFollowPayload, AssetDownloadResponse, CancelFollowRequestPayload, CommentResponse,
    CommunityResponse, CreateCommentRequest, CreateEntityKeyRequest, CreatePostRequest,
    CreatePostResponse, CreateWallRequest, EntityKeyPayload, EntityKeyResponse,
    FollowRequestCreatedResponse, FollowRequestPayload, FollowRequestResponse, FollowShareResponse,
    LikePostRequest, LikePostResponse, ListCommentsResponse, OutgoingFollowRequestResponse,
    PostObjectPayload, PostPage, PostResponse, PresignUploadRequest, PresignUploadResponse,
    ProfileAvatarPayload, RefreshFollowSharesRequest, RejectFollowPayload, RotateWallKeyRequest,
    ShareUpdatePayload, UpdatePostCaptionRequest, UpdateWallProfileRequest,
    UpdateWallProfileResponse, UpdateWallSlugRequest, WallFollowerResponse, WallKeyResponse,
    WallKeyVersionResponse, WallLinkCreateRequest, WallLinkLoginRequest, WallLinkLoginResponse,
    WallLinkStatusResponse, WallLookupResponse, WallProfileResponse,
};
use ente_core::crypto::{sealed, secretbox};
use ente_core::http::{Error as HttpError, HttpClient, HttpConfig};

const ROOT_WALL_KEY_TYPE: &str = "wall";
const UPLOAD_PURPOSE_AVATAR: &str = "avatar";

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
    owner_handle: String,
    wall_id: String,
    wall_slug: String,
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

    pub async fn get_root_wall_key(&self) -> Result<Option<Vec<u8>>> {
        let payload = match self.get_entity_key(ROOT_WALL_KEY_TYPE).await? {
            Some(value) => value,
            None => return Ok(None),
        };
        Ok(Some(decrypt_entity_key(&self.master_key, &payload)?))
    }

    pub async fn get_or_create_root_wall_key(&self) -> Result<Vec<u8>> {
        if let Some(root_wall_key) = self.get_root_wall_key().await? {
            return Ok(root_wall_key);
        }
        let root_wall_key = generate_key();
        let payload = encrypt_entity_key(&self.master_key, &root_wall_key)?;
        match self.create_entity_key(ROOT_WALL_KEY_TYPE, &payload).await {
            Ok(()) => Ok(root_wall_key),
            Err(WallError::EntityKeyConflict) => self.get_root_wall_key().await?.ok_or_else(|| {
                WallError::InvalidInput("root wall key was created but not retrievable".into())
            }),
            Err(err) => Err(err),
        }
    }

    pub async fn list_owned_walls(&self) -> Result<Vec<WallKeyResponse>> {
        self.client.get_json("/wall", &[]).await.map_err(Into::into)
    }

    pub async fn list_follow_shares(&self) -> Result<Vec<FollowShareResponse>> {
        self.client
            .get_json("/wall/follow/shares", &[])
            .await
            .map_err(Into::into)
    }

    pub fn decrypt_follow_share(
        &self,
        share: &FollowShareResponse,
    ) -> Result<DecryptedFollowShare> {
        let packed = decode_b64(&share.encrypted_wall_key)?;
        let (ciphertext, _) = unpack_payload(&packed)?;
        if ciphertext.is_empty() {
            return Err(WallError::MissingEncryptedWallKey);
        }
        let wall_key = sealed::open(&ciphertext, &self.public_key, &self.private_key)?;
        Ok(DecryptedFollowShare {
            followee: share.followee.clone(),
            wall_id: share.wall_id.clone(),
            wall_slug: share.wall_slug.clone(),
            wall_key,
            key_version: share.key_version,
        })
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

    pub async fn search_community(
        &self,
        query: &str,
        cursor: Option<String>,
        limit: Option<i32>,
    ) -> Result<CommunityResponse> {
        let mut query_params = vec![("q", query.to_owned())];
        if let Some(value) = cursor.filter(|value| !value.trim().is_empty()) {
            query_params.push(("cursor", value));
        }
        if let Some(value) = limit {
            query_params.push(("limit", value.to_string()));
        }
        self.client
            .get_json("/wall/community", &query_params)
            .await
            .map_err(Into::into)
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
        })
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

    pub async fn fetch_post_decrypted(&self, post_id: i64) -> Result<DecryptedPost> {
        let path = format!("/wall/posts/{post_id}");
        let post: PostResponse = self.client.get_json(&path, &[]).await?;
        self.decrypt_post_for_wall(&post.wall_id, &post).await
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

        let followed_records = self.list_follow_shares().await?;
        let mut followed = Vec::with_capacity(followed_records.len());
        for record in &followed_records {
            followed.push(self.decrypt_follow_share(record)?);
        }

        Ok(HydratedKeys { owned, followed })
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

    pub async fn list_comments(
        &self,
        post_id: i64,
        limit: Option<i32>,
        cursor: Option<i64>,
    ) -> Result<ListCommentsResponse> {
        let mut query = Vec::new();
        if let Some(value) = limit {
            query.push(("limit", value.to_string()));
        }
        if let Some(value) = cursor {
            query.push(("cursor", value.to_string()));
        }
        let path = format!("/wall/posts/{post_id}/comments");
        self.client
            .get_json(&path, &query)
            .await
            .map_err(Into::into)
    }

    pub async fn create_comment(
        &self,
        post_id: i64,
        post_key: &[u8],
        plaintext: &[u8],
        parent_comment_id: Option<i64>,
    ) -> Result<CommentResponse> {
        let request = CreateCommentRequest {
            comment_cipher: encode_b64(&encrypt_secretbox_packed(post_key, plaintext)?),
            parent_comment_id,
        };
        let path = format!("/wall/posts/{post_id}/comments");
        self.client
            .post_json(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub fn decrypt_comment(
        &self,
        post_key: &[u8],
        comment: &CommentResponse,
    ) -> Result<DecryptedComment> {
        let packed = decode_b64(&comment.comment_cipher)?;
        Ok(DecryptedComment {
            plaintext: decrypt_secretbox_packed(post_key, &packed)?,
        })
    }

    pub async fn delete_comment(&self, post_id: i64, comment_id: i64) -> Result<()> {
        let path = format!("/wall/posts/{post_id}/comments/{comment_id}");
        self.client
            .delete_empty(&path, &[])
            .await
            .map_err(Into::into)
    }

    pub async fn request_follow_by_wall(
        &self,
        wall_id: &str,
    ) -> Result<FollowRequestCreatedResponse> {
        let request = FollowRequestPayload {
            target_username: None,
            target_wall_id: Some(wall_id.to_owned()),
        };
        self.client
            .post_json("/wall/follow/request", &request)
            .await
            .map_err(Into::into)
    }

    pub async fn request_follow_by_username(
        &self,
        username: &str,
    ) -> Result<FollowRequestCreatedResponse> {
        let request = FollowRequestPayload {
            target_username: Some(username.to_owned()),
            target_wall_id: None,
        };
        self.client
            .post_json("/wall/follow/request", &request)
            .await
            .map_err(Into::into)
    }

    pub async fn list_incoming_follow_requests(&self) -> Result<Vec<FollowRequestResponse>> {
        self.client
            .get_json("/wall/follow/requests", &[])
            .await
            .map_err(Into::into)
    }

    pub async fn list_follow_requests(&self) -> Result<Vec<FollowRequestResponse>> {
        self.list_incoming_follow_requests().await
    }

    pub async fn list_outgoing_follow_requests(
        &self,
    ) -> Result<Vec<OutgoingFollowRequestResponse>> {
        self.client
            .get_json("/wall/follow/requests/outgoing", &[])
            .await
            .map_err(Into::into)
    }

    pub async fn approve_follow_request(
        &self,
        request: &FollowRequestResponse,
    ) -> Result<FollowRequestCreatedResponse> {
        let access = self
            .resolve_owned_wall_access(&request.wall_id)
            .await?
            .ok_or_else(|| {
                WallError::InvalidInput(format!(
                    "wall {} is not owned by the account",
                    request.wall_id
                ))
            })?;
        let follower_public_key = decode_b64(&request.follower_public_key)?;
        let sealed_share = sealed::seal(&access.wall_key, &follower_public_key)?;
        let payload = ApproveFollowPayload {
            request_id: request.request_id,
            wall_id: request.wall_id.clone(),
            encrypted_wall_key: encode_b64(&pack_payload(&sealed_share, &[])),
        };
        self.client
            .post_json("/wall/follow/approve", &payload)
            .await
            .map_err(Into::into)
    }

    pub async fn reject_follow_request(&self, request_id: i64) -> Result<()> {
        let payload = RejectFollowPayload { request_id };
        self.client
            .post_empty("/wall/follow/reject", &payload)
            .await
            .map_err(Into::into)
    }

    pub async fn cancel_follow_request(&self, request_id: i64) -> Result<()> {
        let payload = CancelFollowRequestPayload { request_id };
        self.client
            .post_empty("/wall/follow/request/cancel", &payload)
            .await
            .map_err(Into::into)
    }

    pub async fn cancel_follow_request_by_wall(&self, wall_id: &str) -> Result<()> {
        let request = self
            .list_outgoing_follow_requests()
            .await?
            .into_iter()
            .find(|request| request.wall_id == wall_id)
            .ok_or_else(|| {
                WallError::InvalidInput(format!("no pending follow request for wall {wall_id}"))
            })?;
        self.cancel_follow_request(request.request_id).await
    }

    pub async fn unfollow_by_wall(&self, wall_id: &str) -> Result<()> {
        let request = FollowRequestPayload {
            target_username: None,
            target_wall_id: Some(wall_id.to_owned()),
        };
        self.client
            .post_empty("/wall/follow/unfollow", &request)
            .await
            .map_err(Into::into)
    }

    pub async fn unfollow_by_username(&self, username: &str) -> Result<()> {
        let request = FollowRequestPayload {
            target_username: Some(username.to_owned()),
            target_wall_id: None,
        };
        self.client
            .post_empty("/wall/follow/unfollow", &request)
            .await
            .map_err(Into::into)
    }

    pub async fn list_wall_followers(&self, wall_id: &str) -> Result<Vec<WallFollowerResponse>> {
        let query = vec![("wallId", wall_id.to_owned())];
        self.client
            .get_json("/wall/follow/followers", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn refresh_follow_shares(&self, wall_id: &str) -> Result<usize> {
        let access = self
            .resolve_owned_wall_access(wall_id)
            .await?
            .ok_or_else(|| {
                WallError::InvalidInput(format!("wall {wall_id} is not owned by the account"))
            })?;
        let followers = self.list_wall_followers(wall_id).await?;
        let mut updates = Vec::new();
        for follower in followers {
            if follower.key_version == access.key_version {
                continue;
            }
            let public_key = decode_b64(&follower.public_key)?;
            let sealed_share = sealed::seal(&access.wall_key, &public_key)?;
            updates.push(ShareUpdatePayload {
                follower_id: follower.follower_id,
                encrypted_wall_key: encode_b64(&pack_payload(&sealed_share, &[])),
            });
        }
        if updates.is_empty() {
            return Ok(0);
        }
        let payload = RefreshFollowSharesRequest {
            wall_id: wall_id.to_owned(),
            shares: updates,
        };
        let updated = payload.shares.len();
        self.client
            .post_empty("/wall/follow/shares/refresh", &payload)
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
        let access_key = generate_key();
        let auth_key = derive_wall_link_auth_key(&access_key)?;
        let wrap_key = derive_wall_link_wrap_key(&access_key)?;
        let request = WallLinkCreateRequest {
            wall_id: wall_id.to_owned(),
            auth_key: encode_b64(&auth_key),
            key_version: access.key_version,
            encrypted_wall_key: encode_b64(&encrypt_secretbox_packed(&wrap_key, &access.wall_key)?),
        };
        let status: WallLinkStatusResponse = self.client.post_json("/wall/links", &request).await?;
        Ok(CreatedWallLink {
            access_key: encode_b64_url(&access_key),
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
        let shares = self.list_follow_shares().await?;
        let Some(record) = shares.into_iter().find(|value| value.wall_id == wall_id) else {
            return Ok(None);
        };
        let share = self.decrypt_follow_share(&record)?;
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
        author: item.wall_slug.clone(),
        encrypted_post_key: item.encrypted_post_key.clone(),
        caption_cipher: item.caption_cipher.clone(),
        key_version: item.key_version,
        objects: item.objects.clone(),
        created_at: item.created_at.clone(),
        likes: item.likes,
        viewer_liked: item.viewer_liked,
        comments: item.comments,
    }
}

impl WallLinkCtx {
    pub async fn open(input: OpenWallLinkCtxInput) -> Result<Self> {
        let access_key = decode_b64_url(&input.access_key)?;
        let auth_key = derive_wall_link_auth_key(&access_key)?;
        let wrap_key = derive_wall_link_wrap_key(&access_key)?;
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
            owner_handle: response.owner,
            wall_id: response.wall_id,
            wall_slug: response.wall_slug,
            wall_key,
            key_version: response.key_version,
        })
    }

    pub fn client(&self) -> &HttpClient {
        &self.client
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

    pub fn decrypt_post_key(&self, post: &PostResponse) -> Result<Vec<u8>> {
        let packed = decode_b64(&post.encrypted_post_key)?;
        decrypt_secretbox_packed(&self.wall_key, &packed)
    }

    pub async fn decrypt_post(&self, post: &PostResponse) -> Result<DecryptedPost> {
        let wall_key = self
            .resolve_wall_key_for_version(Some(post.key_version))
            .await?
            .ok_or_else(|| {
                WallError::InvalidInput(format!("missing wall key for post {}", post.post_id))
            })?;
        let post_key = decrypt_secretbox_packed(&wall_key, &decode_b64(&post.encrypted_post_key)?)?;
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

    pub async fn list_comments(
        &self,
        post_id: i64,
        limit: Option<i32>,
        cursor: Option<i64>,
    ) -> Result<ListCommentsResponse> {
        let mut query = Vec::new();
        if let Some(value) = limit {
            query.push(("limit", value.to_string()));
        }
        if let Some(value) = cursor {
            query.push(("cursor", value.to_string()));
        }
        let path = format!("/wall/posts/{post_id}/comments");
        self.client
            .get_json(&path, &query)
            .await
            .map_err(Into::into)
    }

    pub fn decrypt_comment(
        &self,
        post_key: &[u8],
        comment: &CommentResponse,
    ) -> Result<DecryptedComment> {
        let packed = decode_b64(&comment.comment_cipher)?;
        Ok(DecryptedComment {
            plaintext: decrypt_secretbox_packed(post_key, &packed)?,
        })
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

    #[tokio::test]
    async fn get_or_create_root_wall_key_creates_when_missing() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let first_get = server
            .mock("GET", "/user-entity/key")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_WALL_KEY_TYPE.into(),
            ))
            .with_status(404)
            .create_async()
            .await;
        let create = server
            .mock("POST", "/user-entity/key")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(r#"{"status":"ok"}"#)
            .create_async()
            .await;

        let root = ctx
            .get_or_create_root_wall_key()
            .await
            .expect("root wall key should be created");

        assert_eq!(root.len(), 32);
        first_get.assert_async().await;
        create.assert_async().await;
    }

    #[tokio::test]
    async fn get_or_create_root_wall_key_refetches_on_conflict() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let expected_root = generate_key();
        let payload = encrypt_entity_key(&ctx.master_key, &expected_root).expect("entity key");

        let missing = server
            .mock("GET", "/user-entity/key")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_WALL_KEY_TYPE.into(),
            ))
            .with_status(404)
            .expect(1)
            .create_async()
            .await;
        let conflict = server
            .mock("POST", "/user-entity/key")
            .with_status(409)
            .with_body("conflict")
            .create_async()
            .await;
        let refetch = server
            .mock("GET", "/user-entity/key")
            .match_query(Matcher::UrlEncoded(
                "type".into(),
                ROOT_WALL_KEY_TYPE.into(),
            ))
            .with_status(200)
            .with_body(
                json!({
                    "type": ROOT_WALL_KEY_TYPE,
                    "encryptedKey": payload.encrypted_key,
                    "header": payload.header,
                })
                .to_string(),
            )
            .expect(1)
            .create_async()
            .await;

        let root = ctx
            .get_or_create_root_wall_key()
            .await
            .expect("root wall key should refetch on conflict");
        assert_eq!(root, expected_root);
        missing.assert_async().await;
        conflict.assert_async().await;
        refetch.assert_async().await;
    }

    #[tokio::test]
    async fn wall_link_open_decrypts_current_wall_key() {
        let mut server = Server::new_async().await;
        let wall_key = generate_key();
        let access_key = generate_key();
        let auth_key = derive_wall_link_auth_key(&access_key).expect("auth key");
        let wrap_key = derive_wall_link_wrap_key(&access_key).expect("wrap key");
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
            access_key: encode_b64_url(&access_key),
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
        let correct_access_key = generate_key();
        let wrong_access_key = generate_key();
        let wrong_auth_key = derive_wall_link_auth_key(&wrong_access_key).expect("auth key");
        let correct_wrap_key = derive_wall_link_wrap_key(&correct_access_key).expect("wrap key");
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
            access_key: encode_b64_url(&wrong_access_key),
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
    async fn follow_request_helpers_use_explicit_incoming_and_outgoing_routes() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());

        let incoming = server
            .mock("GET", "/wall/follow/requests")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "requestId": 41,
                    "follower": "viewer",
                    "wallId": "wall_owner_main",
                    "wallSlug": "owner-main",
                    "followerPublicKey": "cHVi",
                    "status": "pending",
                    "createdAt": "2026-04-16T00:00:00Z"
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let outgoing = server
            .mock("GET", "/wall/follow/requests/outgoing")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "requestId": 42,
                    "followee": "owner",
                    "wallId": "wall_owner_main",
                    "wallSlug": "owner-main",
                    "status": "pending",
                    "createdAt": "2026-04-16T00:00:00Z"
                }])
                .to_string(),
            )
            .expect(2)
            .create_async()
            .await;
        let cancel = server
            .mock("POST", "/wall/follow/request/cancel")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(json!({"requestId": 42}).to_string()))
            .with_status(200)
            .expect(2)
            .create_async()
            .await;

        let incoming_requests = ctx
            .list_incoming_follow_requests()
            .await
            .expect("incoming follow requests should load");
        assert_eq!(incoming_requests.len(), 1);
        assert_eq!(incoming_requests[0].request_id, 41);

        let outgoing_requests = ctx
            .list_outgoing_follow_requests()
            .await
            .expect("outgoing follow requests should load");
        assert_eq!(outgoing_requests.len(), 1);
        assert_eq!(outgoing_requests[0].followee, "owner");

        ctx.cancel_follow_request(42)
            .await
            .expect("direct cancel should succeed");

        ctx.cancel_follow_request_by_wall("wall_owner_main")
            .await
            .expect("cancel by wall should resolve outgoing request");

        incoming.assert_async().await;
        outgoing.assert_async().await;
        cancel.assert_async().await;
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
        let delete_comment = server
            .mock("DELETE", "/wall/posts/42/comments/7")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .create_async()
            .await;
        let reject = server
            .mock("POST", "/wall/follow/reject")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(json!({"requestId": 11}).to_string()))
            .with_status(200)
            .create_async()
            .await;
        let unfollow_wall = server
            .mock("POST", "/wall/follow/unfollow")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::JsonString(
                json!({"targetWallId": "wall_owner_main"}).to_string(),
            ))
            .with_status(200)
            .create_async()
            .await;
        let unfollow_username = server
            .mock("POST", "/wall/follow/unfollow")
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
        ctx.delete_comment(42, 7)
            .await
            .expect("delete comment should accept empty response");
        ctx.reject_follow_request(11)
            .await
            .expect("reject should accept empty response");
        ctx.unfollow_by_wall("wall_owner_main")
            .await
            .expect("unfollow by wall should accept empty response");
        ctx.unfollow_by_username("owner")
            .await
            .expect("unfollow by username should accept empty response");

        delete_post.assert_async().await;
        delete_comment.assert_async().await;
        reject.assert_async().await;
        unfollow_wall.assert_async().await;
        unfollow_username.assert_async().await;
    }

    #[tokio::test]
    async fn refresh_follow_shares_accepts_empty_server_response() {
        let mut server = Server::new_async().await;
        let ctx = test_account_ctx(&server.url());
        let root_wall_key = generate_key();
        let wall_key = generate_key();
        let (follower_public_key, _) = keys::generate_keypair().expect("valid follower keypair");
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
        let followers = server
            .mock("GET", "/wall/follow/followers")
            .match_header("x-auth-token", "token")
            .match_query(Matcher::UrlEncoded(
                "wallId".into(),
                "wall_owner_main".into(),
            ))
            .with_status(200)
            .with_body(
                json!([{
                    "followerId": 7,
                    "username": "viewer",
                    "publicKey": encode_b64(&follower_public_key),
                    "keyVersion": 2,
                    "createdAt": "2026-04-16T00:00:00Z"
                }])
                .to_string(),
            )
            .create_async()
            .await;
        let refresh = server
            .mock("POST", "/wall/follow/shares/refresh")
            .match_header("x-auth-token", "token")
            .match_body(Matcher::Regex("\"followerId\":7".into()))
            .with_status(200)
            .create_async()
            .await;

        let updated = ctx
            .refresh_follow_shares("wall_owner_main")
            .await
            .expect("refresh should accept empty response");

        assert_eq!(updated, 1);
        entity.assert_async().await;
        walls.assert_async().await;
        followers.assert_async().await;
        refresh.assert_async().await;
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
                        "encryptedPostKey": "cGFja2Vk",
                        "captionCipher": "",
                        "keyVersion": 3,
                        "objects": [],
                        "createdAt": "2026-04-16T00:00:00Z",
                        "likes": 2,
                        "viewerLiked": true,
                        "comments": 1
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
                        "author": "owner-gallery",
                        "encryptedPostKey": "cGFja2Vk",
                        "captionCipher": "",
                        "keyVersion": 3,
                        "objects": [],
                        "createdAt": "2026-04-16T00:00:00Z",
                        "likes": 2,
                        "viewerLiked": true,
                        "comments": 1
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
                    "author": "owner-gallery",
                    "encryptedPostKey": encode_b64(&encrypt_secretbox_packed(&wall_key, &post_key).expect("post key wrap")),
                    "captionCipher": encode_b64(&encrypt_secretbox_packed(&post_key, caption).expect("caption wrap")),
                    "keyVersion": 3,
                    "objects": [],
                    "createdAt": "2026-04-16T00:00:00Z",
                    "likes": 0,
                    "viewerLiked": false,
                    "comments": 0
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
    async fn hydrate_wall_keys_loads_owned_and_followed_walls() {
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
            .mock("GET", "/wall/follow/shares")
            .match_header("x-auth-token", "token")
            .with_status(200)
            .with_body(
                json!([{
                    "followee": "owner",
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
        assert_eq!(hydrated.followed.len(), 1);
        assert_eq!(hydrated.followed[0].wall_id, "wall_shared_gallery");
        assert_eq!(hydrated.followed[0].wall_key, shared_wall_key);
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
