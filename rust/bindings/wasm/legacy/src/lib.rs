use ente_legacy::{LegacyKitRecoveryClient, LegacyKitShare};
use js_sys::Reflect;
use serde::Deserialize;
use serde_wasm_bindgen as swb;
use wasm_bindgen::prelude::*;

use ente_wasm_log as _;

pub struct LegacyError {
    kind: &'static str,
    message: String,
}

impl From<LegacyError> for JsValue {
    fn from(error: LegacyError) -> Self {
        let js_error = js_sys::Error::new(&error.message);
        Reflect::set(
            js_error.as_ref(),
            &JsValue::from_str("kind"),
            &JsValue::from_str(error.kind),
        )
        .expect("setting error kind should not fail");
        js_error.into()
    }
}

impl From<ente_legacy::Error> for LegacyError {
    fn from(error: ente_legacy::Error) -> Self {
        use ente_legacy::ErrorKind as K;
        let kind = match error.kind() {
            K::Network => "network",
            K::Http => "http",
            K::Parse => "parse",
            K::Crypto => "crypto",
            K::Auth => "auth",
            K::InvalidInput => "invalid_input",
            K::ActiveRecoverySession => "active_recovery_session",
        };
        Self {
            kind,
            message: ente_core::error::chain(&error),
        }
    }
}

impl From<swb::Error> for LegacyError {
    fn from(error: swb::Error) -> Self {
        Self {
            kind: "serde",
            message: error.to_string(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenLegacyKitRecoveryInput {
    base_url: String,
    shares: Vec<LegacyKitShare>,
    email: Option<String>,
    client_package: Option<String>,
    client_version: Option<String>,
    user_agent: Option<String>,
}

#[wasm_bindgen]
pub async fn legacy_kit_open_recovery(
    input: JsValue,
) -> Result<LegacyKitRecoveryHandle, LegacyError> {
    let input: OpenLegacyKitRecoveryInput = swb::from_value(input)?;
    let client = LegacyKitRecoveryClient::new_with_headers(
        input.base_url,
        input.client_package,
        input.client_version,
        input.user_agent,
    )?;
    let handle = client
        .open_from_shares(&input.shares, input.email.as_deref())
        .await?;
    Ok(LegacyKitRecoveryHandle { inner: handle })
}

#[wasm_bindgen]
pub struct LegacyKitRecoveryHandle {
    inner: ente_legacy::LegacyKitRecoveryHandle,
}

#[wasm_bindgen]
impl LegacyKitRecoveryHandle {
    pub fn session(&self) -> Result<JsValue, LegacyError> {
        swb::to_value(self.inner.session()).map_err(Into::into)
    }

    pub async fn refresh_session(&self) -> Result<JsValue, LegacyError> {
        let session = self.inner.refresh_session().await?;
        swb::to_value(&session).map_err(Into::into)
    }

    pub async fn change_password(&self, new_password: String) -> Result<(), LegacyError> {
        self.inner
            .change_password(&new_password)
            .await
            .map_err(Into::into)
    }
}
