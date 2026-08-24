use std::sync::Arc;

use ente_contacts::{OpenContactsInput, WrappedRootContactKey};
use ente_core::{
    b64,
    crypto::SecretVec,
    http::{Api, ApiConfig, Auth, Http},
};
use serde::{Deserialize, Serialize};
use serde_wasm_bindgen as swb;
use wasm_bindgen::prelude::*;

use ente_wasm_log as _;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Contacts(#[from] ente_contacts::Error),
    #[error(transparent)]
    Serde(#[from] swb::Error),
    #[error(transparent)]
    Decode(#[from] b64::DecodeError),
}

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenContactsJsInput {
    base_url: String,
    auth_token: String,
    user_id: i64,
    master_key_b64: String,
    cached_wrapped_root_contact_key: Option<WrappedRootContactKey>,
    client_package: Option<String>,
    client_version: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContactRecordJs {
    id: String,
    contact_user_id: i64,
    email: Option<String>,
    name: Option<String>,
    #[serde(rename = "profilePictureAttachmentID")]
    profile_picture_attachment_id: Option<String>,
    is_deleted: bool,
    updated_at: i64,
}

impl From<ente_contacts::ContactRecord> for ContactRecordJs {
    fn from(value: ente_contacts::ContactRecord) -> Self {
        Self {
            id: value.id,
            contact_user_id: value.contact_user_id,
            email: value.email,
            name: value.name,
            profile_picture_attachment_id: value.profile_picture_attachment_id,
            is_deleted: value.is_deleted,
            updated_at: value.updated_at,
        }
    }
}

#[wasm_bindgen(js_name = openContacts)]
pub fn open_contacts(input: JsValue) -> Result<ContactsClient, Error> {
    let input: OpenContactsJsInput = swb::from_value(input)?;
    let api = Arc::new(Api::new(
        Http::new().map_err(ente_contacts::Error::from)?,
        ApiConfig {
            origin: input.base_url,
            client_package: input.client_package,
            client_version: input.client_version,
            user_agent: None,
            auth: Some(Auth::User(input.auth_token)),
        },
    ));
    let opened = ente_contacts::ContactsClient::open(
        Arc::clone(&api),
        Arc::new(SecretVec::new(b64::decode(&input.master_key_b64)?)),
        OpenContactsInput {
            user_id: input.user_id,
            cached_wrapped_root_contact_key: input.cached_wrapped_root_contact_key,
        },
    )?;

    Ok(ContactsClient {
        api,
        inner: opened.client,
    })
}

#[wasm_bindgen]
pub struct ContactsClient {
    api: Arc<Api>,
    inner: ente_contacts::ContactsClient,
}

#[wasm_bindgen]
impl ContactsClient {
    #[wasm_bindgen(js_name = updateAuthToken)]
    pub fn update_auth_token(&self, auth_token: String) {
        self.api.set_auth(Some(Auth::User(auth_token)));
    }

    #[wasm_bindgen(js_name = currentWrappedRootContactKey)]
    pub fn current_wrapped_root_contact_key(&self) -> Result<JsValue, Error> {
        swb::to_value(&self.inner.current_wrapped_root_contact_key()).map_err(Into::into)
    }

    #[wasm_bindgen(js_name = getDiff)]
    pub async fn get_diff(&self, since_time: i64, limit: u16) -> Result<JsValue, Error> {
        let diff: Vec<ContactRecordJs> = self
            .inner
            .get_diff(since_time, limit)
            .await?
            .into_iter()
            .map(Into::into)
            .collect();
        swb::to_value(&diff).map_err(Into::into)
    }

    #[wasm_bindgen(js_name = getProfilePicture)]
    pub async fn get_profile_picture(&self, contact_id: &str) -> Result<Vec<u8>, Error> {
        self.inner
            .get_profile_picture(contact_id)
            .await
            .map_err(Into::into)
    }
}
