//! Public Space links.
//!
//! A Space link lets anyone with the access key open the Space read-only (see
//! [`SpaceLinkCtx`](super::SpaceLinkCtx)). The owner side here creates, rotates,
//! inspects, and deletes a link: the access key is derived into auth and wrap
//! keys, the Space key is wrapped to the link, and the access key itself is
//! stored sealed under the Space root key so the owner can recover it later.

use super::{AccountSpaceCtx, ResolvedOwnedSpaceAccess};
use crate::crypto::{
    decrypt_secretbox_payload, derive_space_link_auth_key, derive_space_link_wrap_key,
    encrypt_secretbox_payload, generate_space_link_access_key, space_link_access_key_material,
};
use crate::error::{Result, SpaceError};
use crate::models::CreatedSpaceLink;
use crate::transport::{SpaceLinkCreateRequest, SpaceLinkStatusResponse};
use ente_core::crypto::{decode_b64, encode_b64};

impl AccountSpaceCtx {
    pub async fn get_space_link_status(&self, space_id: &str) -> Result<SpaceLinkStatusResponse> {
        let path = format!("/space/links/{space_id}");
        self.client().get_json(&path, &[]).await.map_err(Into::into)
    }

    pub async fn create_space_link(&self, space_id: &str) -> Result<CreatedSpaceLink> {
        let access = self
            .resolve_owned_space_access_with_root(space_id)
            .await?
            .ok_or_else(|| {
                SpaceError::InvalidInput(format!("space {space_id} is not owned by the account"))
            })?;
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
            link_wrapped_space_key: encode_b64(&encrypt_secretbox_payload(
                &wrap_key,
                &access.space_key,
            )?),
            encrypted_access_key: encode_b64(&encrypt_secretbox_payload(
                &access.space_root_key,
                access_key.as_bytes(),
            )?),
        };
        let status: SpaceLinkStatusResponse = self.client().post_json(path, &request).await?;
        self.created_space_link_from_status(&access.space_root_key, status)
    }

    fn created_space_link_from_status(
        &self,
        space_root_key: &[u8],
        status: SpaceLinkStatusResponse,
    ) -> Result<CreatedSpaceLink> {
        if status.encrypted_access_key.trim().is_empty() {
            return Err(SpaceError::InvalidInput(
                "active space link is missing encrypted access key".into(),
            ));
        }
        let access_key_bytes =
            decrypt_secretbox_payload(space_root_key, &decode_b64(&status.encrypted_access_key)?)?;
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
        self.client().delete_empty(&path, &[]).await?;
        Ok(())
    }
}
