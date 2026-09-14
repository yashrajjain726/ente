use std::time::{Duration, SystemTime, UNIX_EPOCH};

use ente_accounts::auth::recovery_key_from_mnemonic_or_hex;
use ente_accounts::{
    AccountsClient, AccountsClientConfig, AuthFlow, AuthFlowUi, AuthenticatedAccount,
    CreateAccountParams, LoginParams, OtpPurpose, SecondFactorMethod, SetupTwoFactorParams,
    TotpPurpose,
};
use ente_core::b64;
use ente_core::crypto::SecretVec;
use ente_test_support::HARDCODED_OTT;
pub use ente_test_support::account_fixture::{
    TestAccount, create_account as create_fixture_account,
};
use hmac::{Hmac, KeyInit, Mac};
use sha1::Sha1;
use zeroize::Zeroizing;

use crate::CLIENT_PACKAGE;

type HmacSha1 = Hmac<Sha1>;

struct TestUi {
    otp: String,
    totp_secret: Option<String>,
    allow_totp: bool,
}

impl TestUi {
    fn otp_only() -> Self {
        Self {
            otp: HARDCODED_OTT.into(),
            totp_secret: None,
            allow_totp: false,
        }
    }

    fn with_totp(secret: Option<String>) -> Self {
        Self {
            otp: HARDCODED_OTT.into(),
            totp_secret: secret,
            allow_totp: true,
        }
    }
}

impl AuthFlowUi for TestUi {
    fn read_email_otp(
        &mut self,
        _email: &str,
        _purpose: OtpPurpose,
        _resent: bool,
    ) -> ente_accounts::Result<String> {
        Ok(self.otp.clone())
    }

    fn read_totp_code(&mut self, _purpose: TotpPurpose) -> ente_accounts::Result<String> {
        if !self.allow_totp {
            return Err(ente_accounts::Error::InvalidInput(
                "TOTP was requested unexpectedly in this e2e flow".into(),
            ));
        }

        let secret = self.totp_secret.as_deref().ok_or_else(|| {
            ente_accounts::Error::InvalidInput("No TOTP secret captured for rust e2e flow".into())
        })?;
        Ok(current_totp(secret))
    }

    fn report_retryable_error(&mut self, _message: &str) -> ente_accounts::Result<()> {
        Ok(())
    }

    fn choose_second_factor(
        &mut self,
        _methods: &[SecondFactorMethod],
    ) -> ente_accounts::Result<SecondFactorMethod> {
        Ok(SecondFactorMethod::Totp)
    }

    fn present_passkey_verification(&mut self, _url: &str) -> ente_accounts::Result<()> {
        Err(ente_accounts::Error::InvalidInput(
            "Passkey flow not expected in rust e2e tests".into(),
        ))
    }

    fn wait_for_passkey_verification(&mut self) -> ente_accounts::Result<()> {
        Err(ente_accounts::Error::InvalidInput(
            "Passkey flow not expected in rust e2e tests".into(),
        ))
    }

    fn present_totp_secret(
        &mut self,
        secret_code: &str,
        _qr_code: &str,
    ) -> ente_accounts::Result<()> {
        self.totp_secret = Some(secret_code.to_string());
        Ok(())
    }
}

pub async fn create_account(endpoint: &str, email: String, password: String) -> TestAccount {
    let client = accounts_client(endpoint).unwrap();
    let mut ui = TestUi::otp_only();

    let authenticated = tokio::time::timeout(Duration::from_secs(180), async {
        let mut flow = AuthFlow::new(&client, &mut ui);
        flow.create_account(CreateAccountParams {
            email: email.clone(),
            password: Zeroizing::new(password.clone()),
            source: Some("testAccount".into()),
        })
        .await
    })
    .await
    .expect("signup timed out")
    .expect("signup failed");

    test_account_from_authenticated(email, password, authenticated)
}

pub async fn create_account_strict(
    endpoint: &str,
    email_prefix: &str,
    password_prefix: &str,
) -> TestAccount {
    create_account(
        endpoint,
        crate::support::unique_test_email(email_prefix),
        crate::support::unique_password(password_prefix),
    )
    .await
}

pub async fn login_without_totp(
    endpoint: &str,
    email: &str,
    password: &str,
) -> ente_accounts::Result<AuthenticatedAccount> {
    let mut ui = TestUi::otp_only();
    login_with_ui(endpoint, email, password, &mut ui).await
}

async fn login_with_ui<U: AuthFlowUi>(
    endpoint: &str,
    email: &str,
    password: &str,
    ui: &mut U,
) -> ente_accounts::Result<AuthenticatedAccount> {
    let client = accounts_client(endpoint)?;

    tokio::time::timeout(Duration::from_secs(90), async {
        let mut flow = AuthFlow::new(&client, ui);
        flow.login(LoginParams {
            email: email.to_string(),
            password: Zeroizing::new(password.to_string()),
        })
        .await
    })
    .await
    .expect("login timed out")
}

pub async fn enable_totp(endpoint: &str, account: &TestAccount) -> String {
    let client = accounts_client(endpoint).unwrap();
    client.set_auth_token(Some(account.auth_token.clone()));
    let mut ui = TestUi::with_totp(None);

    let result = tokio::time::timeout(Duration::from_secs(60), async {
        let mut flow = AuthFlow::new(&client, &mut ui);
        flow.setup_two_factor(SetupTwoFactorParams {
            master_key: SecretVec::new(account.master_key.clone()),
            key_attributes: Some(account.key_attributes.clone()),
        })
        .await
    })
    .await
    .expect("two-factor setup timed out")
    .expect("two-factor setup failed");

    result.secret_code
}

pub async fn fetch_two_factor_status(
    endpoint: &str,
    account: &TestAccount,
) -> ente_accounts::Result<bool> {
    fetch_two_factor_status_with_token(endpoint, &account.auth_token).await
}

async fn fetch_two_factor_status_with_token(
    endpoint: &str,
    auth_token: &str,
) -> ente_accounts::Result<bool> {
    let client = accounts_client(endpoint)?;
    client.set_auth_token(Some(auth_token.to_string()));
    client.get_two_factor_status().await
}

fn auth_token_from_authenticated(account: &AuthenticatedAccount) -> String {
    b64::encode_url_safe(&account.secrets.token)
}

pub fn test_account_from_authenticated(
    email: String,
    password: String,
    authenticated: AuthenticatedAccount,
) -> TestAccount {
    let recovery_key = recovery_key_from_mnemonic_or_hex(
        authenticated
            .recovery_key
            .as_deref()
            .expect("authentication should return a recovery key"),
    )
    .expect("authentication recovery key should be valid")
    .into_vec();

    TestAccount {
        email,
        password,
        user_id: authenticated.user_id,
        auth_token: auth_token_from_authenticated(&authenticated),
        master_key: authenticated.secrets.master_key.clone(),
        recovery_key,
        secret_key: authenticated.secrets.secret_key.clone(),
        key_attributes: authenticated.key_attributes,
    }
}

fn current_totp(secret: &str) -> String {
    let key = decode_base32(secret);
    let counter = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before UNIX_EPOCH")
        .as_secs()
        / 30;

    let mut mac = HmacSha1::new_from_slice(&key).expect("invalid HMAC key");
    mac.update(&counter.to_be_bytes());
    let digest = mac.finalize().into_bytes();
    let offset = (digest[19] & 0x0f) as usize;

    let binary = ((digest[offset] as u32 & 0x7f) << 24)
        | ((digest[offset + 1] as u32) << 16)
        | ((digest[offset + 2] as u32) << 8)
        | digest[offset + 3] as u32;

    format!("{:06}", binary % 1_000_000)
}

fn decode_base32(secret: &str) -> Vec<u8> {
    let mut output = Vec::new();
    let mut buffer = 0u32;
    let mut bits = 0u8;

    for ch in secret
        .chars()
        .filter(|ch| !ch.is_whitespace() && *ch != '=')
    {
        let value = match ch {
            'A'..='Z' => ch as u8 - b'A',
            'a'..='z' => ch as u8 - b'a',
            '2'..='7' => ch as u8 - b'2' + 26,
            _ => panic!("invalid base32 character in TOTP secret: {ch}"),
        } as u32;

        buffer = (buffer << 5) | value;
        bits += 5;

        while bits >= 8 {
            bits -= 8;
            output.push(((buffer >> bits) & 0xff) as u8);
        }
    }

    output
}

fn accounts_client(endpoint: &str) -> ente_accounts::Result<AccountsClient> {
    AccountsClient::new(
        AccountsClientConfig::new(CLIENT_PACKAGE)
            .with_origin(endpoint.to_string())
            .with_user_agent("ente-contacts-e2e"),
    )
}
