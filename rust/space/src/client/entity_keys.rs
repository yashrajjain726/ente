//! Space entity keys.
//!
//! Entity keys are small wrapped keys the server stores per account under a
//! string type tag (for example the Space root key). These methods read and
//! write them through the `/space/entity-key` endpoints; the payload is opaque
//! ciphertext to this layer.

use super::AccountSpaceCtx;
use crate::error::{Result, SpaceError};
use crate::transport::{CreateEntityKeyRequest, EntityKeyPayload, EntityKeyResponse};
use ente_core::http::Error as HttpError;

impl AccountSpaceCtx {
    pub async fn get_entity_key(&self, key_type: &str) -> Result<Option<EntityKeyPayload>> {
        let query = vec![("type", key_type.to_owned())];
        let payload = self
            .client()
            .get_json_optional::<EntityKeyResponse>("/space/entity-key", &query)
            .await?;
        Ok(payload.map(|value| EntityKeyPayload {
            encrypted_key: value.encrypted_key,
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
        };
        match self
            .client()
            .post_empty("/space/entity-key", &request)
            .await
        {
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
        };
        let response = self
            .client()
            .post_json::<EntityKeyResponse, _>("/space/entity-key/ensure", &request)
            .await?;
        Ok(EntityKeyPayload {
            encrypted_key: response.encrypted_key,
        })
    }
}
