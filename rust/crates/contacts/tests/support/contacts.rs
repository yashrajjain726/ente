use std::sync::Arc;

use ente_contacts::{ContactsClient, OpenContactsInput};
use ente_core::{
    crypto::SecretVec,
    http::{Api, ApiConfig, Auth, Http},
};

use crate::CLIENT_PACKAGE;
use crate::support::auth::TestAccount;

pub fn open_client(endpoint: &str, account: &TestAccount) -> ContactsClient {
    let api = Api::new(
        Http::new().unwrap(),
        ApiConfig {
            origin: endpoint.to_string(),
            client_package: Some(CLIENT_PACKAGE.to_string()),
            client_version: Some("0.0.1".to_string()),
            user_agent: Some("ente-contacts-e2e".to_string()),
            auth: Some(Auth::User(account.auth_token.clone())),
        },
    );
    ContactsClient::open(
        Arc::new(api),
        Arc::new(SecretVec::new(account.master_key.clone())),
        OpenContactsInput {
            user_id: account.user_id,
            cached_wrapped_root_contact_key: None,
        },
    )
    .unwrap()
    .client
}
