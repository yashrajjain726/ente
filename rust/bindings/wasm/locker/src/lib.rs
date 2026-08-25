use ente_contacts::{OpenContactsInput, WrappedRootContactKey};
use ente_wasm_core::Session;
use serde::Serialize;
use serde_wasm_bindgen as swb;
use wasm_bindgen::prelude::*;

use ente_wasm_log as _;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Contacts(#[from] ente_contacts::Error),
    #[error(transparent)]
    Serde(#[from] swb::Error),
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
pub fn open_contacts(
    session: &Session,
    user_id: i64,
    cached_encrypted_key: Option<String>,
    cached_header: Option<String>,
) -> Result<ContactsClient, Error> {
    let opened = ente_contacts::ContactsClient::open(
        session.clone_inner(),
        OpenContactsInput {
            user_id,
            cached_wrapped_root_contact_key: cached_encrypted_key.zip(cached_header).map(
                |(encrypted_key, header)| WrappedRootContactKey {
                    encrypted_key,
                    header,
                },
            ),
        },
    )?;

    Ok(ContactsClient(opened.client))
}

#[wasm_bindgen]
pub struct ContactsClient(ente_contacts::ContactsClient);

#[wasm_bindgen]
impl ContactsClient {
    #[wasm_bindgen(js_name = currentWrappedRootContactKey)]
    pub fn current_wrapped_root_contact_key(&self) -> Result<JsValue, Error> {
        swb::to_value(&self.0.current_wrapped_root_contact_key()).map_err(Into::into)
    }

    #[wasm_bindgen(js_name = getDiff)]
    pub async fn get_diff(&self, since_time: i64, limit: u16) -> Result<JsValue, Error> {
        let diff: Vec<ContactRecordJs> = self
            .0
            .get_diff(since_time, limit)
            .await?
            .into_iter()
            .map(Into::into)
            .collect();
        swb::to_value(&diff).map_err(Into::into)
    }

    #[wasm_bindgen(js_name = getProfilePicture)]
    pub async fn get_profile_picture(&self, contact_id: &str) -> Result<Vec<u8>, Error> {
        self.0
            .get_profile_picture(contact_id)
            .await
            .map_err(Into::into)
    }
}
