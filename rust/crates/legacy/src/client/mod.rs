mod contact;
mod kit;
mod recovery;

pub use contact::{
    LegacyContactRecord, LegacyContactState, LegacyInfo, LegacyRecoverySession,
    LegacyRecoveryStatus, LegacyUser,
};
pub use recovery::LegacyRecoveryBundle;

use std::sync::Arc;

use ente_accounts::auth::{self, KeyAttributes};
use ente_core::crypto::SecretVec;
use ente_core::http::Api;

use crate::Result;

pub struct LegacyClient {
    api: Arc<Api>,
    master_key: Arc<SecretVec>,
}

impl LegacyClient {
    pub fn new(api: Arc<Api>, master_key: Arc<SecretVec>) -> Self {
        Self { api, master_key }
    }

    fn current_recovery_key(&self, key_attributes: &KeyAttributes) -> Result<SecretVec> {
        let recovery_key = auth::get_recovery_key(self.master_key.as_ref(), key_attributes)?;
        Ok(auth::recovery_key_from_mnemonic_or_hex(&recovery_key)?)
    }
}
