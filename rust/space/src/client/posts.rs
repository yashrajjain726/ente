//! Space posts and feed.
//!
//! Posts carry a per-post key (wrapped to the Space key) plus an encrypted
//! caption and photo objects. These methods create and list posts, page the
//! cross-Space feed, decrypt post keys/captions/objects, and handle likes,
//! notifications, and post asset downloads. Key resolution and caching are
//! delegated to the spine in [`super`](super::AccountSpaceCtx).

use super::{
    AccountSpaceCtx, decrypt_post_object_metadata, ensure_post_objects_are_photos,
    post_response_from_feed_item,
};
use crate::crypto::{decrypt_secretbox_payload, encrypt_secretbox_payload, generate_key};
use crate::error::{Result, SpaceError};
use crate::models::{DecryptedPost, FeedItem, FeedPage, HydratedKeys, PostObjectMetadata};
use crate::transport::{
    CreatePostRequest, CreatePostResponse, LikePostRequest, LikePostResponse,
    ListPostLikersResponse, MarkNotificationsReadRequest, PostObjectPayload, PostPage,
    PostResponse, SpaceActorResponse, SpaceUnreadStatusResponse, UpdatePostCaptionRequest,
};
use ente_core::crypto::{decode_b64, encode_b64};

impl AccountSpaceCtx {
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
        let post_key_bytes = post_key.map_or_else(generate_key, ToOwned::to_owned);
        ensure_post_objects_are_photos(objects, &post_key_bytes)?;
        let access = self
            .resolve_owned_space_access(space_id)
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!("space {space_id} is not owned by the account"))
            })?;
        let caption_cipher = match caption_plaintext {
            Some(value) => Some(encode_b64(&encrypt_secretbox_payload(
                &post_key_bytes,
                value,
            )?)),
            None => None,
        };
        let request = CreatePostRequest {
            space_id: space_id.to_owned(),
            encrypted_post_key: encode_b64(&encrypt_secretbox_payload(
                &access.space_key,
                &post_key_bytes,
            )?),
            key_version: access.key_version,
            caption_cipher,
            objects: objects.to_vec(),
        };
        let response = self
            .client()
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
        self.client()
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
        self.client()
            .get_json("/space/feed", &query)
            .await
            .map_err(Into::into)
    }

    pub async fn unread_status(&self) -> Result<SpaceUnreadStatusResponse> {
        self.client()
            .get_json("/space/unread", &[])
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
        self.client()
            .post_json(
                "/space/messages/read",
                &MarkNotificationsReadRequest { friend_space_id },
            )
            .await
            .map_err(Into::into)
    }

    pub async fn get_post(&self, post_id: i64) -> Result<PostResponse> {
        let path = format!("/space/posts/{post_id}");
        self.client().get_json(&path, &[]).await.map_err(Into::into)
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
        let space_root_key = self.get_space_root_key().await?;
        let owned_records = self.list_owned_spaces().await?;
        let mut owned = Vec::with_capacity(owned_records.len());
        if let Some(space_root_key) = space_root_key {
            for record in owned_records {
                let packed = decode_b64(&record.root_wrapped_space_key)?;
                let space_key = decrypt_secretbox_payload(&space_root_key, &packed)?;
                owned.push((record.space_id, space_key));
            }
        }

        let friends_records = self.list_friend_shares().await?;
        let mut friends = Vec::with_capacity(friends_records.len());
        for record in &friends_records {
            friends.push(self.decrypt_friend_share(record).await?);
        }

        Ok(HydratedKeys { owned, friends })
    }

    pub fn decrypt_post_key(&self, space_key: &[u8], post: &PostResponse) -> Result<Vec<u8>> {
        let packed = decode_b64(&post.encrypted_post_key)?;
        decrypt_secretbox_payload(space_key, &packed)
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
        decrypt_secretbox_payload(&space_key, &packed)
    }

    pub async fn decrypt_post_caption_fields(
        &self,
        space_id: &str,
        post_id: i64,
        encrypted_post_key: &str,
        key_version: i32,
        caption_cipher: &str,
    ) -> Result<Option<Vec<u8>>> {
        if caption_cipher.trim().is_empty() {
            return Ok(None);
        }
        let post_key = self
            .decrypt_post_key_fields(space_id, post_id, encrypted_post_key, key_version)
            .await?;
        let packed = decode_b64(caption_cipher)?;
        Ok(Some(decrypt_secretbox_payload(&post_key, &packed)?))
    }

    pub fn decrypt_post(&self, space_key: &[u8], post: &PostResponse) -> Result<DecryptedPost> {
        let post_key = self.decrypt_post_key(space_key, post)?;
        let caption_plaintext = if post.caption_cipher.is_empty() {
            None
        } else {
            let packed = decode_b64(&post.caption_cipher)?;
            Some(decrypt_secretbox_payload(&post_key, &packed)?)
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
        Ok(self
            .decrypt_post_object_metadata(post_key, object)?
            .and_then(|metadata| metadata.blur_hash))
    }

    pub fn decrypt_post_object_metadata(
        &self,
        post_key: &[u8],
        object: &PostObjectPayload,
    ) -> Result<Option<PostObjectMetadata>> {
        decrypt_post_object_metadata(post_key, object)
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
        Ok(Some(decrypt_secretbox_payload(
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
                Some(value) => Some(encode_b64(&encrypt_secretbox_payload(post_key, value)?)),
                None => None,
            },
        };
        let path = format!("/space/posts/{post_id}/caption");
        self.client()
            .post_empty(&path, &request)
            .await
            .map_err(Into::into)
    }

    pub async fn delete_post(&self, post_id: i64) -> Result<()> {
        let path = format!("/space/posts/{post_id}");
        self.client()
            .delete_empty(&path, &[])
            .await
            .map_err(Into::into)
    }

    pub async fn like_post(&self, post_id: i64, like: bool) -> Result<LikePostResponse> {
        let path = format!("/space/posts/{post_id}/like");
        let request = LikePostRequest { like };
        self.client()
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
        self.client()
            .get_json(&path, &query)
            .await
            .map_err(Into::into)
    }
}
