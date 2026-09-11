use ente_accounts::auth;
use ente_core::b64;
use wasm_bindgen::prelude::*;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Accounts(#[from] ente_accounts::Error),
}

impl Error {
    fn name(&self) -> Option<&'static str> {
        match self {
            Self::Accounts(ente_accounts::Error::InsufficientMemory) => Some("insufficient_memory"),
            _ => None,
        }
    }
}

impl From<Error> for JsValue {
    fn from(error: Error) -> Self {
        crate::js_error(&error, error.name())
    }
}

#[wasm_bindgen(getter_with_clone)]
pub struct GeneratedKek {
    #[wasm_bindgen(readonly)]
    pub key: String,
    #[wasm_bindgen(readonly)]
    pub salt: String,
    #[wasm_bindgen(readonly, js_name = memLimit)]
    pub mem_limit: u32,
    #[wasm_bindgen(readonly, js_name = opsLimit)]
    pub ops_limit: u32,
}

impl From<auth::GeneratedKek> for GeneratedKek {
    fn from(generated: auth::GeneratedKek) -> Self {
        Self {
            key: b64::encode(&generated.key),
            salt: b64::encode(&generated.salt),
            mem_limit: generated.mem_limit,
            ops_limit: generated.ops_limit,
        }
    }
}

#[wasm_bindgen(js_name = authGenerateInteractiveKek)]
pub fn auth_generate_interactive_kek(password: &str) -> Result<GeneratedKek, Error> {
    Ok(auth::generate_interactive_kek(password)?.into())
}
