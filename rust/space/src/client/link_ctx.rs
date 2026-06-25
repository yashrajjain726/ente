//! Public Space link viewer.
//!
//! [`SpaceLinkCtx`] is the unauthenticated counterpart to
//! [`AccountSpaceCtx`](super::AccountSpaceCtx): it opens a shared Space from a
//! public link by exchanging the link access key for a session token and the
//! wrapped Space key, then exposes read-only access to that Space's posts,
//! profile, and assets. It holds a single resolved `space_key` rather than the
//! account key hierarchy.

use super::{
    AssetDownloadResponse, SpaceLinkCtx, build_http_client, build_space_key_history_map,
    decrypt_space_profile,
};
use crate::crypto::{
    decrypt_secretbox_payload, derive_space_link_auth_key, derive_space_link_wrap_key,
    space_link_access_key_material,
};
use crate::error::{Result, SpaceError};
use std::collections::BTreeMap;

use crate::models::{DecryptedPost, DecryptedSpaceProfile, OpenSpaceLinkCtxInput};
use crate::transport::{
    ListPostLikersResponse, PostPage, PostResponse, SpaceActorResponse, SpaceKeyVersionResponse,
    SpaceLinkLoginRequest, SpaceLinkLoginResponse, SpaceLookupResponse, SpaceProfileResponse,
};
use ente_core::{
    crypto::{decode_b64, encode_b64},
    http::HttpClient,
};

impl SpaceLinkCtx {
    pub async fn open(input: OpenSpaceLinkCtxInput) -> Result<Self> {
        let access_key_material = space_link_access_key_material(&input.access_key)?;
        let auth_key = derive_space_link_auth_key(&access_key_material)?;
        let wrap_key = derive_space_link_wrap_key(&access_key_material)?;
        let client = build_http_client(
            &input.base_url,
            None,
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
            decrypt_secretbox_payload(&wrap_key, &decode_b64(&response.link_wrapped_space_key)?)?;
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
        decrypt_secretbox_payload(&space_key, &packed)
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
            Some(decrypt_secretbox_payload(
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
        Ok(Some(decrypt_secretbox_payload(
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

    pub async fn get_profile_asset_url(
        &self,
        asset_type: &str,
        object_id: &str,
    ) -> Result<AssetDownloadResponse> {
        let query = vec![
            ("spaceId", self.space_id.clone()),
            ("assetType", asset_type.to_owned()),
            ("objectID", object_id.to_owned()),
        ];
        self.client
            .get_json("/space/assets/redirect", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn download_profile_asset(
        &self,
        asset_type: &str,
        object_id: &str,
    ) -> Result<Vec<u8>> {
        let download = self.get_profile_asset_url(asset_type, object_id).await?;
        let encrypted = self.client.object_store().get_bytes(&download.url).await?;
        crate::crypto::decrypt_asset_payload(self.space_key(), &encrypted)
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
