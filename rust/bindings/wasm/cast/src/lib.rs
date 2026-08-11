use ente_cast::ReceiverCredentials;
use wasm_bindgen::prelude::*;

use ente_wasm_log as _;

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

    #[wasm_bindgen(js_name = openPayload)]
    pub fn open_payload(&self, encrypted_payload: &str) -> Result<CastPayload, JsError> {
        Ok(self.inner.open_payload(encrypted_payload)?.into())
    }
}

#[wasm_bindgen]
pub struct CastPayload {
    inner: ente_cast::CastPayload,
}

impl From<ente_cast::CastPayload> for CastPayload {
    fn from(inner: ente_cast::CastPayload) -> Self {
        Self { inner }
    }
}

#[wasm_bindgen]
impl CastPayload {
    #[wasm_bindgen(getter, js_name = collectionID)]
    pub fn collection_id(&self) -> i64 {
        self.inner.collection_id
    }

    #[wasm_bindgen(getter, js_name = castToken)]
    pub fn cast_token(&self) -> String {
        self.inner.cast_token.clone()
    }

    #[wasm_bindgen(getter, js_name = collectionKey)]
    pub fn collection_key(&self) -> String {
        self.inner.collection_key.clone()
    }
}

#[wasm_bindgen(js_name = sealPayload)]
pub fn seal_payload(
    public_key: &str,
    collection_id: i64,
    cast_token: String,
    collection_key: String,
) -> Result<String, JsError> {
    Ok(ente_cast::seal_payload(
        public_key,
        &ente_cast::CastPayload {
            collection_id,
            cast_token,
            collection_key,
        },
    )?)
}
