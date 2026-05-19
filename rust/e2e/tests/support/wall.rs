use ente_core::http::Error as HttpError;
use ente_rs::models::account::App;
use ente_wall::{AccountWallCtx, OpenAccountWallCtxInput, PrivateKeySource, WallError};

use crate::support::auth::TestAccount;

pub fn open_ctx(endpoint: &str, account: &TestAccount) -> AccountWallCtx {
    AccountWallCtx::open(OpenAccountWallCtxInput {
        base_url: endpoint.to_string(),
        auth_token: account.auth_token.clone(),
        master_key: account.master_key.clone(),
        public_key: account.public_key.clone(),
        private_key_source: PrivateKeySource::Plain(account.secret_key.clone()),
        user_id: Some(account.user_id),
        user_agent: Some("ente-e2e".to_string()),
        client_package: Some(App::Photos.client_package().to_string()),
        client_version: Some("ente-e2e".to_string()),
    })
    .expect("wall context should open")
}

pub fn profile_payload(display_name: &str, bio: &str) -> Vec<u8> {
    format!(r#"{{"displayName":"{display_name}","bio":"{bio}"}}"#).into_bytes()
}

pub fn assert_http_status<T>(result: Result<T, WallError>, expected_status: u16) {
    match result {
        Err(WallError::Http(HttpError::Http { status, .. })) if status == expected_status => {}
        Err(error) => panic!("expected HTTP {expected_status}, got {error:?}"),
        Ok(_) => panic!("expected HTTP {expected_status}, got success"),
    }
}

pub fn assert_invalid_input_contains<T>(result: Result<T, WallError>, expected: &str) {
    match result {
        Err(WallError::InvalidInput(message)) if message.contains(expected) => {}
        Err(error) => panic!("expected invalid input containing {expected:?}, got {error:?}"),
        Ok(_) => panic!("expected invalid input containing {expected:?}, got success"),
    }
}
