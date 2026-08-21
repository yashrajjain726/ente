use std::sync::Arc;

use ente_accounts::auth::{self, KeyAttributes, SrpSession};
use ente_core::b64;
use ente_core::crypto::{self, SecretVec, sealed, secretbox};
use ente_core::http::{self, Api};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::{Error, Result};
use crate::kit::{
    create_legacy_kit_request, decode_download_content, decode_legacy_kit_record,
    validate_notice_period,
};
use crate::kit_models::{
    LegacyKit, LegacyKitCreateResult, LegacyKitOwnerRecoverySession, LegacyKitShare,
};
use crate::kit_transport::{
    LegacyKitDownloadContentResponse, LegacyKitOwnerActionRequest,
    LegacyKitOwnerRecoverySessionResponse, LegacyKitRecordResponse,
    LegacyKitUpdateRecoveryNoticeRequest, ListLegacyKitsResponse,
};
use crate::models::{LegacyContactState, LegacyInfo, LegacyRecoveryBundle};
use crate::transport::{
    LegacyAddContactRequest, LegacyChangePasswordRequest, LegacyChangePasswordResponse,
    LegacyContactIdentifier, LegacyInfoResponse, LegacyInitChangePasswordRequest,
    LegacyPublicKeyResponse, LegacyRecoveryIdentifier, LegacyRecoveryInfoResponse,
    LegacySetupSrpRequest, LegacySetupSrpResponse, LegacyUpdateContactRequest,
    LegacyUpdateRecoveryNoticeRequest, LegacyUpdateSrpAndKeysRequest, LegacyUpdatedKeyAttr,
};

pub struct LegacyClient {
    api: Arc<Api>,
    master_key: Arc<SecretVec>,
}

impl LegacyClient {
    pub fn new(api: Arc<Api>, master_key: Arc<SecretVec>) -> Self {
        Self { api, master_key }
    }

    pub async fn info(&self) -> Result<LegacyInfo> {
        Ok(self
            .api
            .get("/emergency-contacts/info")
            .send()
            .await?
            .error_for_status()?
            .json::<LegacyInfoResponse>()
            .await?)
    }

    pub async fn public_key(&self, email: &str) -> Result<Option<String>> {
        let response = self
            .api
            .get("/users/public-key")
            .query(&[("email", email.trim())])
            .send()
            .await?;
        if response.status() == 404 {
            return Ok(None);
        }
        let response = response
            .error_for_status()?
            .json::<LegacyPublicKeyResponse>()
            .await?;
        Ok(Some(response.public_key))
    }

    pub fn verification_id(&self, public_key_b64: &str) -> Result<String> {
        let public_key = b64::decode(public_key_b64)?;
        let digest = Sha256::digest(&public_key);
        auth::recovery_key_to_mnemonic(&b64::encode(digest.as_slice())).map_err(Into::into)
    }

    pub async fn add_contact(
        &self,
        email: &str,
        current_user_key_attrs: &KeyAttributes,
        recovery_notice_in_days: Option<i32>,
    ) -> Result<()> {
        let public_key = self
            .public_key(email)
            .await?
            .ok_or(Error::ContactNotOnEnte)?;
        let recovery_key = self.current_recovery_key(current_user_key_attrs)?;
        let recipient_public_key = b64::decode(&public_key)?;
        let encrypted_key = sealed::seal(
            &recovery_key,
            &crypto::PublicKey::try_from_slice(&recipient_public_key)?,
        )?;

        self.api
            .post("/emergency-contacts/add")
            .json(&LegacyAddContactRequest {
                email: email.trim().to_string(),
                encrypted_key: b64::encode(&encrypted_key),
                recovery_notice_in_days,
            })
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    pub async fn update_contact(
        &self,
        user_id: i64,
        emergency_contact_id: i64,
        state: LegacyContactState,
    ) -> Result<()> {
        self.api
            .post("/emergency-contacts/update")
            .json(&LegacyUpdateContactRequest {
                user_id,
                emergency_contact_id,
                state,
            })
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    pub async fn update_recovery_notice(
        &self,
        emergency_contact_id: i64,
        recovery_notice_in_days: i32,
    ) -> Result<()> {
        self.api
            .post("/emergency-contacts/update-recovery-notice")
            .json(&LegacyUpdateRecoveryNoticeRequest {
                emergency_contact_id,
                recovery_notice_in_days,
            })
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    pub async fn start_recovery(&self, user_id: i64, emergency_contact_id: i64) -> Result<()> {
        self.contact_action(
            "/emergency-contacts/start-recovery",
            user_id,
            emergency_contact_id,
        )
        .await
    }

    pub async fn stop_recovery(
        &self,
        recovery_id: &str,
        user_id: i64,
        emergency_contact_id: i64,
    ) -> Result<()> {
        self.recovery_action(
            "/emergency-contacts/stop-recovery",
            recovery_id,
            user_id,
            emergency_contact_id,
        )
        .await
    }

    pub async fn reject_recovery(
        &self,
        recovery_id: &str,
        user_id: i64,
        emergency_contact_id: i64,
    ) -> Result<()> {
        self.recovery_action(
            "/emergency-contacts/reject-recovery",
            recovery_id,
            user_id,
            emergency_contact_id,
        )
        .await
    }

    pub async fn approve_recovery(
        &self,
        recovery_id: &str,
        user_id: i64,
        emergency_contact_id: i64,
    ) -> Result<()> {
        self.recovery_action(
            "/emergency-contacts/approve-recovery",
            recovery_id,
            user_id,
            emergency_contact_id,
        )
        .await
    }

    pub async fn recovery_bundle(
        &self,
        recovery_id: &str,
        current_user_key_attrs: &KeyAttributes,
    ) -> Result<LegacyRecoveryBundle> {
        let response = self.recovery_info(recovery_id).await?;
        let recovery_key =
            self.decrypt_recovery_key(&response.encrypted_key, current_user_key_attrs)?;

        Ok(LegacyRecoveryBundle {
            recovery_key,
            user_key_attributes: response.user_key_attr,
        })
    }

    pub async fn change_password(
        &self,
        recovery_id: &str,
        current_user_key_attrs: &KeyAttributes,
        new_password: &str,
    ) -> Result<()> {
        let bundle = self
            .recovery_bundle(recovery_id, current_user_key_attrs)
            .await?;
        let target_master_key = decrypt_master_key_with_recovery_key(
            &bundle.user_key_attributes,
            &bundle.recovery_key,
        )?;
        let (updated_key_attrs, login_key) = auth::generate_key_attributes_for_new_password(
            &target_master_key,
            &bundle.user_key_attributes,
            new_password,
        )?;
        let srp_user_id = Uuid::new_v4().to_string();
        let (mut srp_session, setup_request) =
            password_reset_setup_request(&srp_user_id, &login_key)?;
        let init_response = self
            .api
            .post("/emergency-contacts/init-change-password")
            .json(&LegacyInitChangePasswordRequest {
                recovery_id: recovery_id.to_string(),
                setup_srp_request: setup_request,
            })
            .send()
            .await?
            .error_for_status()?
            .json::<LegacySetupSrpResponse>()
            .await?;
        let srp_m1 = srp_session_m1(&mut srp_session, &init_response)?;
        let updated_key_attr = LegacyUpdatedKeyAttr {
            kek_salt: updated_key_attrs.kek_salt.clone(),
            encrypted_key: updated_key_attrs.encrypted_key.clone(),
            key_decryption_nonce: updated_key_attrs.key_decryption_nonce.clone(),
            mem_limit: updated_key_attrs.mem_limit,
            ops_limit: updated_key_attrs.ops_limit,
        };

        let change_response = self
            .api
            .post("/emergency-contacts/change-password")
            .json(&LegacyChangePasswordRequest {
                recovery_id: recovery_id.to_string(),
                update_srp_and_keys_request: LegacyUpdateSrpAndKeysRequest {
                    setup_id: init_response.setup_id,
                    srp_m1,
                    updated_key_attr,
                },
            })
            .send()
            .await?
            .error_for_status()?
            .json::<LegacyChangePasswordResponse>()
            .await?;

        let server_m2 = b64::decode(&change_response.srp_m2)?;
        srp_session.verify_m2(&server_m2)?;
        Ok(())
    }

    pub async fn kits(&self) -> Result<Vec<LegacyKit>> {
        let response = self
            .api
            .get("/legacy-kits")
            .send()
            .await?
            .error_for_status()?
            .json::<ListLegacyKitsResponse>()
            .await?;
        response
            .kits
            .into_iter()
            .map(|kit| decode_legacy_kit_record(kit, self.master_key.as_ref()))
            .collect()
    }

    pub async fn create_kit(
        &self,
        current_user_key_attrs: &KeyAttributes,
        part_names: [String; 3],
        notice_period_in_hours: i32,
    ) -> Result<LegacyKitCreateResult> {
        let (request, shares) = {
            let recovery_key = self.current_recovery_key(current_user_key_attrs)?;
            create_legacy_kit_request(
                &recovery_key,
                self.master_key.as_ref(),
                part_names,
                notice_period_in_hours,
            )?
        };

        let response = self
            .api
            .post("/legacy-kits")
            .json(&request)
            .send()
            .await?
            .error_for_status()?
            .json::<LegacyKitRecordResponse>()
            .await?;
        let kit = decode_legacy_kit_record(response, self.master_key.as_ref())?;
        Ok(LegacyKitCreateResult { kit, shares })
    }

    pub async fn download_kit_shares(&self, kit_id: &str) -> Result<Vec<LegacyKitShare>> {
        let response = self
            .api
            .get(&format!("/legacy-kits/{kit_id}/download-content"))
            .send()
            .await?
            .error_for_status()?
            .json::<LegacyKitDownloadContentResponse>()
            .await?;
        decode_download_content(response, self.master_key.as_ref())
    }

    pub async fn kit_recovery_session(
        &self,
        kit_id: &str,
    ) -> Result<LegacyKitOwnerRecoverySession> {
        let response = self
            .api
            .get(&format!("/legacy-kits/{kit_id}/recovery-session"))
            .send()
            .await?
            .error_for_status()?
            .json::<LegacyKitOwnerRecoverySessionResponse>()
            .await?;
        Ok(response.into())
    }

    pub async fn update_kit_recovery_notice(
        &self,
        kit_id: &str,
        notice_period_in_hours: i32,
    ) -> Result<()> {
        validate_notice_period(notice_period_in_hours)?;
        let path = "/legacy-kits/update-recovery-notice";
        let response = self
            .api
            .post(path)
            .json(&LegacyKitUpdateRecoveryNoticeRequest {
                kit_id: kit_id.to_string(),
                notice_period_in_hours,
            })
            .send()
            .await?;
        if response.status() == 400 {
            return if response.text().await?.contains("active recovery session") {
                Err(Error::ActiveRecoverySession)
            } else {
                Err(http::Error::Http {
                    status: 400,
                    path: path.into(),
                }
                .into())
            };
        }
        response.error_for_status()?;
        Ok(())
    }

    pub async fn block_kit_recovery(&self, kit_id: &str) -> Result<()> {
        self.api
            .post("/legacy-kits/block-recovery")
            .json(&LegacyKitOwnerActionRequest {
                kit_id: kit_id.to_string(),
            })
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    pub async fn delete_kit(&self, kit_id: &str) -> Result<()> {
        self.api
            .delete(&format!("/legacy-kits/{kit_id}"))
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    async fn contact_action(
        &self,
        path: &str,
        user_id: i64,
        emergency_contact_id: i64,
    ) -> Result<()> {
        self.api
            .post(path)
            .json(&LegacyContactIdentifier {
                user_id,
                emergency_contact_id,
            })
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    async fn recovery_action(
        &self,
        path: &str,
        recovery_id: &str,
        user_id: i64,
        emergency_contact_id: i64,
    ) -> Result<()> {
        self.api
            .post(path)
            .json(&LegacyRecoveryIdentifier {
                id: recovery_id.to_string(),
                user_id,
                emergency_contact_id,
            })
            .send()
            .await?
            .error_for_status()?;
        Ok(())
    }

    async fn recovery_info(&self, recovery_id: &str) -> Result<LegacyRecoveryInfoResponse> {
        Ok(self
            .api
            .get(&format!("/emergency-contacts/recovery-info/{recovery_id}"))
            .send()
            .await?
            .error_for_status()?
            .json::<LegacyRecoveryInfoResponse>()
            .await?)
    }

    fn current_recovery_key(&self, current_user_key_attrs: &KeyAttributes) -> Result<SecretVec> {
        let recovery_key_hex =
            auth::get_recovery_key(self.master_key.as_ref(), current_user_key_attrs)?;
        Ok(auth::recovery_key_from_mnemonic_or_hex(&recovery_key_hex)?)
    }

    fn decrypt_recovery_key(
        &self,
        encrypted_key_b64: &str,
        current_user_key_attrs: &KeyAttributes,
    ) -> Result<SecretVec> {
        let public_key = b64::decode(&current_user_key_attrs.public_key)?;
        let encrypted_key = b64::decode(encrypted_key_b64)?;
        let secret_key = self.current_secret_key(current_user_key_attrs)?;
        let decrypted = sealed::open(
            &encrypted_key,
            &crypto::PublicKey::try_from_slice(&public_key)?,
            &crypto::SecretKey::try_from_slice(&secret_key)?,
        )?;
        Ok(SecretVec::new(decrypted))
    }

    fn current_secret_key(&self, current_user_key_attrs: &KeyAttributes) -> Result<SecretVec> {
        let encrypted_secret_key = b64::decode(&current_user_key_attrs.encrypted_secret_key)?;
        let secret_key_nonce = b64::decode(&current_user_key_attrs.secret_key_decryption_nonce)?;
        let secret_key = secretbox::decrypt(
            &encrypted_secret_key,
            &crypto::Nonce::try_from_slice(&secret_key_nonce)?,
            &crypto::Key::try_from_slice(self.master_key.as_ref())?,
        )?;
        Ok(SecretVec::new(secret_key))
    }
}

fn decrypt_master_key_with_recovery_key(
    key_attributes: &KeyAttributes,
    recovery_key: &[u8],
) -> Result<SecretVec> {
    let encrypted_master_key = key_attributes
        .master_key_encrypted_with_recovery_key
        .as_ref()
        .ok_or_else(|| {
            Error::InvalidInput(
                "target key attributes missing masterKeyEncryptedWithRecoveryKey".into(),
            )
        })?;
    let master_key_nonce = key_attributes
        .master_key_decryption_nonce
        .as_ref()
        .ok_or_else(|| {
            Error::InvalidInput("target key attributes missing masterKeyDecryptionNonce".into())
        })?;
    let encrypted_master_key = b64::decode(encrypted_master_key)?;
    let master_key_nonce = b64::decode(master_key_nonce)?;
    secretbox::decrypt(
        &encrypted_master_key,
        &crypto::Nonce::try_from_slice(&master_key_nonce)?,
        &crypto::Key::try_from_slice(recovery_key)?,
    )
    .map(SecretVec::new)
    .map_err(Into::into)
}

fn password_reset_setup_request(
    srp_user_id: &str,
    login_key: &[u8],
) -> Result<(SrpSession, LegacySetupSrpRequest)> {
    let generated_srp = auth::generate_srp_setup_with_login_key(login_key, srp_user_id)?;
    let srp_session = SrpSession::new(
        srp_user_id,
        &generated_srp.srp_salt,
        &generated_srp.login_sub_key,
    )?;
    let srp_a = b64::encode(&srp_session.public_a());

    Ok((
        srp_session,
        LegacySetupSrpRequest {
            srp_user_id: srp_user_id.to_string(),
            srp_salt: b64::encode(&generated_srp.srp_salt),
            srp_verifier: b64::encode(&generated_srp.srp_verifier),
            srp_a,
        },
    ))
}

fn srp_session_m1(
    srp_session: &mut SrpSession,
    init_response: &LegacySetupSrpResponse,
) -> Result<String> {
    let server_b = b64::decode(&init_response.srp_b)?;
    let client_m1 = srp_session.compute_m1(&server_b)?;
    Ok(b64::encode(&client_m1))
}
