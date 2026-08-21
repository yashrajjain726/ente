use ente_legacy::{LegacyKitRecoveryClient, LegacyKitShare};
use serde::Deserialize;
use serde_wasm_bindgen as swb;
use wasm_bindgen::prelude::*;

use ente_wasm_log as _;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Legacy(#[from] ente_legacy::Error),
    #[error(transparent)]
    Serde(#[from] swb::Error),
}

impl Error {
    fn name(&self) -> Option<&'static str> {
        match self {
            Self::Legacy(ente_legacy::Error::LegacyKitInactive) => Some("legacy_kit_inactive"),
            _ => None,
        }
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
pub async fn legacy_kit_open_recovery(input: JsValue) -> Result<LegacyKitRecoveryHandle, Error> {
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
    pub fn session(&self) -> Result<JsValue, Error> {
        Ok(swb::to_value(self.inner.session())?)
    }

    pub async fn refresh_session(&self) -> Result<JsValue, Error> {
        let session = self.inner.refresh_session().await?;
        Ok(swb::to_value(&session)?)
    }

    pub async fn change_password(&self, new_password: String) -> Result<(), Error> {
        Ok(self.inner.change_password(&new_password).await?)
    }
}
