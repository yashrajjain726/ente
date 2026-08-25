use ente_accounts::auth::KeyAttributes;
use serde::{Deserialize, Serialize};

use crate::models::LegacyContactState;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyPublicKeyResponse {
    pub public_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyAddContactRequest {
    pub email: String,
    pub encrypted_key: String,
    pub recovery_notice_in_days: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyUpdateContactRequest {
    #[serde(rename = "userID")]
    pub user_id: i64,
    #[serde(rename = "emergencyContactID")]
    pub emergency_contact_id: i64,
    pub state: LegacyContactState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyUpdateRecoveryNoticeRequest {
    #[serde(rename = "emergencyContactID")]
    pub emergency_contact_id: i64,
    pub recovery_notice_in_days: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyContactIdentifier {
    #[serde(rename = "userID")]
    pub user_id: i64,
    #[serde(rename = "emergencyContactID")]
    pub emergency_contact_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyRecoveryIdentifier {
    pub id: String,
    #[serde(rename = "userID")]
    pub user_id: i64,
    #[serde(rename = "emergencyContactID")]
    pub emergency_contact_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyRecoveryInfoResponse {
    pub encrypted_key: String,
    #[serde(rename = "userKeyAttr")]
    pub user_key_attr: KeyAttributes,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacySetupSrpRequest {
    #[serde(rename = "srpUserID")]
    pub srp_user_id: String,
    pub srp_salt: String,
    pub srp_verifier: String,
    #[serde(rename = "srpA")]
    pub srp_a: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyInitChangePasswordRequest {
    #[serde(rename = "recoveryID")]
    pub recovery_id: String,
    #[serde(rename = "setupSRPRequest")]
    pub setup_srp_request: LegacySetupSrpRequest,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacySetupSrpResponse {
    #[serde(rename = "setupID")]
    pub setup_id: String,
    #[serde(rename = "srpB")]
    pub srp_b: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyUpdatedKeyAttr {
    pub kek_salt: String,
    pub encrypted_key: String,
    pub key_decryption_nonce: String,
    pub mem_limit: u32,
    pub ops_limit: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyUpdateSrpAndKeysRequest {
    #[serde(rename = "setupID")]
    pub setup_id: String,
    #[serde(rename = "srpM1")]
    pub srp_m1: String,
    #[serde(rename = "updatedKeyAttr")]
    pub updated_key_attr: LegacyUpdatedKeyAttr,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyChangePasswordRequest {
    #[serde(rename = "recoveryID")]
    pub recovery_id: String,
    #[serde(rename = "updateSrpAndKeysRequest")]
    pub update_srp_and_keys_request: LegacyUpdateSrpAndKeysRequest,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyChangePasswordResponse {
    #[serde(rename = "srpM2")]
    pub srp_m2: String,
}
