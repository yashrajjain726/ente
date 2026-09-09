use wasm_bindgen::prelude::*;

use crate::session::Session;

#[derive(Debug, thiserror::Error)]
#[error(transparent)]
pub struct Error(#[from] ente_collections::Error);

impl Error {
    fn name(&self) -> Option<&'static str> {
        None
    }

    fn message(&self) -> String {
        ente_core::error::chain(self)
    }
}

impl From<Error> for JsValue {
    fn from(error: Error) -> Self {
        let js_error = js_sys::Error::new(&error.message());
        if let Some(name) = error.name() {
            js_error.set_name(name);
        }
        js_error.into()
    }
}

#[wasm_bindgen(js_name = collectionsOpenKey)]
pub fn open_key(
    session: &Session,
    owner_id: i64,
    encrypted_key: &str,
    key_decryption_nonce: Option<String>,
) -> Result<String, Error> {
    Ok(ente_core::b64::encode(
        ente_collections::open_collection_key(
            session.inner(),
            owner_id,
            encrypted_key,
            key_decryption_nonce.as_deref(),
        )?
        .as_bytes(),
    ))
}
