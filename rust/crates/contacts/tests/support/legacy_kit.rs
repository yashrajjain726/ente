use ente_legacy::LegacyClient;

use crate::support::{
    auth::{self, TestAccount},
    legacy,
};

pub struct LegacyKitOwner {
    pub owner: TestAccount,
    pub owner_ctx: LegacyClient,
}

pub async fn create_owner(endpoint: &str) -> LegacyKitOwner {
    let owner = auth::create_fixture_account(endpoint, "legacy-kit-owner").await;
    let owner_ctx = legacy::open_client(endpoint, &owner);
    LegacyKitOwner { owner, owner_ctx }
}
