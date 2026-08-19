use serde::{Deserialize, Serialize};

use crate::commands::common::ApiError;

impl From<ente_ensu_crypto::Error> for ApiError {
    fn from(error: ente_ensu_crypto::Error) -> Self {
        ApiError::new(error.code(), error.to_string())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedChatPayload {
    encrypted_data: String,
    header: String,
}

impl From<ente_ensu_crypto::EncryptedChatPayload> for EncryptedChatPayload {
    fn from(payload: ente_ensu_crypto::EncryptedChatPayload) -> Self {
        Self {
            encrypted_data: payload.encrypted_data,
            header: payload.header,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayloadEncryptInput {
    value: String,
    key_b64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayloadDecryptInput {
    encrypted_data_b64: String,
    header_b64: String,
    key_b64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldInput {
    value: String,
    key_b64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentInput {
    data_b64: String,
    key_b64: String,
    session_uuid: String,
}

#[tauri::command]
pub fn chat_crypto_generate_key() -> String {
    ente_ensu_crypto::generate_chat_key()
}

#[tauri::command]
pub fn chat_crypto_encrypt_payload(
    input: PayloadEncryptInput,
) -> Result<EncryptedChatPayload, ApiError> {
    ente_ensu_crypto::encrypt_payload(&input.value, &input.key_b64)
        .map(Into::into)
        .map_err(Into::into)
}

#[tauri::command]
pub fn chat_crypto_decrypt_payload(input: PayloadDecryptInput) -> Result<String, ApiError> {
    ente_ensu_crypto::decrypt_payload(&input.encrypted_data_b64, &input.header_b64, &input.key_b64)
        .map_err(Into::into)
}

#[tauri::command]
pub fn chat_crypto_encrypt_field(input: FieldInput) -> Result<String, ApiError> {
    ente_ensu_crypto::encrypt_field_b64(&input.value, &input.key_b64).map_err(Into::into)
}

#[tauri::command]
pub fn chat_crypto_decrypt_field(input: FieldInput) -> Result<String, ApiError> {
    ente_ensu_crypto::decrypt_field_b64(&input.value, &input.key_b64).map_err(Into::into)
}

#[tauri::command]
pub fn chat_crypto_encrypt_attachment(input: AttachmentInput) -> Result<String, ApiError> {
    ente_ensu_crypto::encrypt_attachment_b64(&input.data_b64, &input.key_b64, &input.session_uuid)
        .map_err(Into::into)
}

#[tauri::command]
pub fn chat_crypto_decrypt_attachment(input: AttachmentInput) -> Result<String, ApiError> {
    ente_ensu_crypto::decrypt_attachment_b64(&input.data_b64, &input.key_b64, &input.session_uuid)
        .map_err(Into::into)
}
