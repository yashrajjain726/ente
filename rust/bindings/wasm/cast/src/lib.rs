use ente_cast::ReceiverCredentials;
use serde::Serialize;
use serde_wasm_bindgen as swb;
use tsify::Tsify;
use wasm_bindgen::prelude::*;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Cast(#[from] ente_cast::Error),
    #[error(transparent)]
    Serde(#[from] swb::Error),
}

impl From<Error> for JsValue {
    fn from(error: Error) -> Self {
        ente_wasm_lib::js_error(&error, None)
    }
}

#[wasm_bindgen]
pub struct CastReceiver {
    inner: ReceiverCredentials,
}

impl Default for CastReceiver {
    fn default() -> Self {
        Self {
            inner: ReceiverCredentials::generate(),
        }
    }
}

#[wasm_bindgen]
impl CastReceiver {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self::default()
    }

    #[wasm_bindgen(getter, js_name = publicKey)]
    pub fn public_key(&self) -> String {
        self.inner.public_key()
    }

    #[wasm_bindgen(getter, js_name = pqPublicKey)]
    pub fn pq_public_key(&self) -> String {
        self.inner.pq_public_key()
    }

    #[wasm_bindgen(js_name = openPayload)]
    pub fn open_payload(
        &self,
        encrypted_payload: &str,
    ) -> Result<<CastPayload as Tsify>::JsType, Error> {
        let payload = self.inner.open_payload(encrypted_payload)?;
        CastPayload {
            collection_id: payload.collection_id,
            cast_token: payload.cast_token,
            collection_key: payload.collection_key,
        }
        .into_js()
        .map_err(Into::into)
    }
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct CastPayload {
    #[serde(rename = "collectionID")]
    collection_id: i64,
    cast_token: String,
    collection_key: String,
}

#[derive(Serialize, Tsify)]
#[serde(rename_all = "camelCase")]
pub struct PreparedCastPayload {
    cast_token: String,
    encrypted_payload: String,
}

#[wasm_bindgen(js_name = preparePayload)]
pub fn prepare_payload(
    public_key: &str,
    pq_public_key: Option<String>,
    collection_id: i64,
    collection_key: &str,
) -> Result<<PreparedCastPayload as Tsify>::JsType, Error> {
    let payload = ente_cast::prepare_payload(
        public_key,
        pq_public_key.as_deref(),
        collection_id,
        collection_key,
    )?;
    PreparedCastPayload {
        cast_token: payload.cast_token,
        encrypted_payload: payload.encrypted_payload,
    }
    .into_js()
    .map_err(Into::into)
}
