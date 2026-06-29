use ente_core::http::Error as HttpError;
use ente_rs::models::account::App;
use ente_space::{AccountSpaceCtx, OpenAccountSpaceCtxInput, PrivateKeySource, SpaceError};
use serde::Deserialize;

use crate::support::auth::TestAccount;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpaceBrowserSessionResponse {
    session_token: String,
}

pub async fn open_ctx(endpoint: &str, account: &TestAccount) -> AccountSpaceCtx {
    let session = reqwest::Client::new()
        .post(format!("{endpoint}/account/space/sessions"))
        .header("X-Auth-Token", &account.auth_token)
        .header("X-Client-Package", App::Photos.client_package())
        .json(&serde_json::json!({ "sessionWrapKey": "space-e2e-session-wrap-key" }))
        .send()
        .await
        .expect("space session create request failed");
    assert!(
        session.status().is_success(),
        "space session create failed with HTTP {}",
        session.status()
    );
    let session = session
        .json::<SpaceBrowserSessionResponse>()
        .await
        .expect("space session create response parse failed");

    AccountSpaceCtx::open(OpenAccountSpaceCtxInput {
        base_url: endpoint.to_string(),
        space_session_token: Some(session.session_token),
        master_key: account.master_key.clone(),
        public_key: account.public_key.clone(),
        private_key_source: PrivateKeySource::Plain(account.secret_key.clone()),
        user_agent: Some("ente-e2e".to_string()),
        client_package: Some(App::Photos.client_package().to_string()),
        client_version: Some("ente-e2e".to_string()),
    })
    .expect("space context should open")
}

pub fn profile_payload(display_name: &str, bio: &str) -> Vec<u8> {
    format!(r#"{{"displayName":"{display_name}","bio":"{bio}"}}"#).into_bytes()
}

pub fn assert_http_status<T>(result: Result<T, SpaceError>, expected_status: u16) {
    match result {
        Err(SpaceError::Http(HttpError::Http { status, .. })) if status == expected_status => {}
        Err(error) => panic!("expected HTTP {expected_status}, got {error:?}"),
        Ok(_) => panic!("expected HTTP {expected_status}, got success"),
    }
}

pub fn assert_invalid_input_contains<T>(result: Result<T, SpaceError>, expected: &str) {
    match result {
        Err(SpaceError::InvalidInput(message)) if message.contains(expected) => {}
        Err(error) => panic!("expected invalid input containing {expected:?}, got {error:?}"),
        Ok(_) => panic!("expected invalid input containing {expected:?}, got success"),
    }
}
