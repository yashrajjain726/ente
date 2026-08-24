use std::sync::Arc;

use ente_core::{
    crypto::SecretVec,
    http::{Api, ApiConfig, Auth, Http},
};
use ente_legacy::{
    LegacyClient, LegacyContactRecord, LegacyContactState, LegacyInfo, LegacyRecoverySession,
};

use crate::CLIENT_PACKAGE;
use crate::support::auth::{self, TestAccount};

pub struct LegacyPairState {
    pub owner: TestAccount,
    pub trusted: TestAccount,
}

pub struct LegacyPair {
    pub owner: TestAccount,
    pub trusted: TestAccount,
    pub owner_ctx: LegacyClient,
    pub trusted_ctx: LegacyClient,
}

pub fn open_client(endpoint: &str, account: &TestAccount) -> LegacyClient {
    let api = Api::new(
        Http::new().unwrap(),
        ApiConfig {
            origin: endpoint.to_string(),
            client_package: Some(CLIENT_PACKAGE.to_string()),
            client_version: Some("0.0.1".to_string()),
            user_agent: Some("ente-legacy-e2e".to_string()),
            auth: Some(Auth::User(account.auth_token.clone())),
        },
    );
    LegacyClient::new(
        Arc::new(api),
        Arc::new(SecretVec::new(account.master_key.clone())),
    )
}

pub async fn create_accepted_pair_state(
    endpoint: &str,
    recovery_notice_in_days: i32,
) -> LegacyPairState {
    let owner = auth::create_account_strict(endpoint, "legacy-owner", "LegacyOwner").await;
    let trusted = auth::create_fixture_account(endpoint, "legacy-trusted").await;

    let owner_ctx = open_client(endpoint, &owner);
    let trusted_ctx = open_client(endpoint, &trusted);

    owner_ctx
        .add_contact(
            &trusted.email,
            &owner.key_attributes,
            Some(recovery_notice_in_days),
        )
        .await
        .unwrap();
    trusted_ctx
        .update_contact(owner.user_id, trusted.user_id, LegacyContactState::Accepted)
        .await
        .unwrap();

    LegacyPairState { owner, trusted }
}

pub fn open_pair(endpoint: &str, state: &LegacyPairState) -> LegacyPair {
    let owner = state.owner.clone();
    let trusted = state.trusted.clone();
    let owner_ctx = open_client(endpoint, &owner);
    let trusted_ctx = open_client(endpoint, &trusted);

    LegacyPair {
        owner,
        trusted,
        owner_ctx,
        trusted_ctx,
    }
}

pub fn owner_contact(
    info: &LegacyInfo,
    owner_user_id: i64,
    trusted_user_id: i64,
) -> Option<&LegacyContactRecord> {
    info.contacts.iter().find(|record| {
        record.user.id == owner_user_id && record.emergency_contact.id == trusted_user_id
    })
}

pub fn trusted_contact(
    info: &LegacyInfo,
    owner_user_id: i64,
    trusted_user_id: i64,
) -> Option<&LegacyContactRecord> {
    info.others_emergency_contact.iter().find(|record| {
        record.user.id == owner_user_id && record.emergency_contact.id == trusted_user_id
    })
}

pub fn owner_recovery_session(
    info: &LegacyInfo,
    owner_user_id: i64,
    trusted_user_id: i64,
) -> Option<&LegacyRecoverySession> {
    info.recover_sessions.iter().find(|session| {
        session.user.id == owner_user_id && session.emergency_contact.id == trusted_user_id
    })
}

pub fn trusted_recovery_session(
    info: &LegacyInfo,
    owner_user_id: i64,
    trusted_user_id: i64,
) -> Option<&LegacyRecoverySession> {
    info.others_recovery_session.iter().find(|session| {
        session.user.id == owner_user_id && session.emergency_contact.id == trusted_user_id
    })
}
