use std::sync::Arc;

use ente_accounts::auth::KeyAttributes;
use ente_core::{
    b64,
    crypto::SecretVec,
    http::{Api, ApiConfig, Auth, Http},
};
use ente_legacy::{
    LegacyClient as InnerLegacyClient, LegacyContactState, LegacyKitRecoveryClient, LegacyKitShare,
};
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
    #[error(transparent)]
    Decode(#[from] b64::DecodeError),
}

impl Error {
    fn name(&self) -> Option<&'static str> {
        match self {
            Self::Legacy(ente_legacy::Error::LegacyKitInactive) => Some("legacy_kit_inactive"),
            Self::Legacy(ente_legacy::Error::ContactNotOnEnte) => Some("contact_not_on_ente"),
            Self::Legacy(ente_legacy::Error::ActiveRecoverySession) => {
                Some("active_recovery_session")
            }
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

#[wasm_bindgen(js_name = openLegacy)]
pub fn open_legacy(
    base_url: String,
    auth_token: String,
    master_key_b64: String,
    client_package: Option<String>,
    client_version: Option<String>,
) -> Result<LegacyClient, Error> {
    let api = Arc::new(Api::new(
        Http::new().map_err(ente_legacy::Error::from)?,
        ApiConfig {
            origin: base_url,
            client_package,
            client_version,
            user_agent: None,
            auth: Some(Auth::User(auth_token)),
        },
    ));
    let master_key = Arc::new(SecretVec::new(b64::decode(&master_key_b64)?));

    Ok(LegacyClient(InnerLegacyClient::new(api, master_key)))
}

#[wasm_bindgen]
pub struct LegacyClient(InnerLegacyClient);

#[wasm_bindgen]
impl LegacyClient {
    #[wasm_bindgen(js_name = getInfo)]
    pub async fn get_info(&self) -> Result<JsValue, Error> {
        swb::to_value(&self.0.info().await?).map_err(Into::into)
    }

    #[wasm_bindgen(js_name = publicKey)]
    pub async fn public_key(&self, email: String) -> Result<Option<String>, Error> {
        self.0.public_key(&email).await.map_err(Into::into)
    }

    #[wasm_bindgen(js_name = verificationID)]
    pub fn verification_id(&self, public_key_b64: String) -> Result<String, Error> {
        self.0.verification_id(&public_key_b64).map_err(Into::into)
    }

    #[wasm_bindgen(js_name = addContact)]
    pub async fn add_contact(
        &self,
        email: String,
        current_user_key_attrs: JsValue,
        recovery_notice_in_days: Option<i32>,
    ) -> Result<(), Error> {
        let current_user_key_attrs: KeyAttributes = swb::from_value(current_user_key_attrs)?;
        self.0
            .add_contact(&email, &current_user_key_attrs, recovery_notice_in_days)
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = updateContact)]
    pub async fn update_contact(
        &self,
        user_id: i64,
        emergency_contact_id: i64,
        state: JsValue,
    ) -> Result<(), Error> {
        let state: LegacyContactState = swb::from_value(state)?;
        self.0
            .update_contact(user_id, emergency_contact_id, state)
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = updateRecoveryNotice)]
    pub async fn update_recovery_notice(
        &self,
        emergency_contact_id: i64,
        recovery_notice_in_days: i32,
    ) -> Result<(), Error> {
        self.0
            .update_recovery_notice(emergency_contact_id, recovery_notice_in_days)
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = startRecovery)]
    pub async fn start_recovery(
        &self,
        user_id: i64,
        emergency_contact_id: i64,
    ) -> Result<(), Error> {
        self.0
            .start_recovery(user_id, emergency_contact_id)
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = stopRecovery)]
    pub async fn stop_recovery(
        &self,
        recovery_id: String,
        user_id: i64,
        emergency_contact_id: i64,
    ) -> Result<(), Error> {
        self.0
            .stop_recovery(&recovery_id, user_id, emergency_contact_id)
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = rejectRecovery)]
    pub async fn reject_recovery(
        &self,
        recovery_id: String,
        user_id: i64,
        emergency_contact_id: i64,
    ) -> Result<(), Error> {
        self.0
            .reject_recovery(&recovery_id, user_id, emergency_contact_id)
            .await
            .map_err(Into::into)
    }

    #[wasm_bindgen(js_name = changePassword)]
    pub async fn change_password(
        &self,
        recovery_id: String,
        current_user_key_attrs: JsValue,
        new_password: String,
    ) -> Result<(), Error> {
        let current_user_key_attrs: KeyAttributes = swb::from_value(current_user_key_attrs)?;
        self.0
            .change_password(&recovery_id, &current_user_key_attrs, &new_password)
            .await
            .map_err(Into::into)
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
