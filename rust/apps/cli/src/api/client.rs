use crate::models::error::Result;
use ente_core::http::{self, Api, ApiConfig, Auth, Http, RetryProfile};
use ente_core::urls::PRODUCTION_API_BASE_URL;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

const DEFAULT_CLIENT_PACKAGE: &str = "io.ente.photos";
pub(crate) const USER_AGENT: &str = concat!("ente-rs/", env!("CARGO_PKG_VERSION"));

pub struct ApiClient {
    http: Http,
    pub(crate) base_url: String,
    client_package: String,
    tokens: Arc<RwLock<HashMap<String, String>>>,
}

impl ApiClient {
    pub fn new(base_url: Option<String>) -> Result<Self> {
        Self::new_with_client_package(base_url, DEFAULT_CLIENT_PACKAGE)
    }

    pub fn new_with_client_package<S>(base_url: Option<String>, client_package: S) -> Result<Self>
    where
        S: Into<String>,
    {
        Ok(Self {
            http: Http::new()?,
            base_url: base_url.unwrap_or_else(|| PRODUCTION_API_BASE_URL.to_string()),
            client_package: client_package.into(),
            tokens: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    pub fn add_token(&self, account_id: &str, token: &str) {
        let mut tokens = self.tokens.write().unwrap();
        tokens.insert(account_id.to_string(), token.to_string());
    }

    pub fn remove_token(&self, account_id: &str) {
        let mut tokens = self.tokens.write().unwrap();
        tokens.remove(account_id);
    }

    pub fn get_token(&self, account_id: &str) -> Option<String> {
        let tokens = self.tokens.read().unwrap();
        tokens.get(account_id).cloned()
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub fn client_package(&self) -> &str {
        &self.client_package
    }

    pub(crate) fn api(&self, account_id: Option<&str>) -> Api {
        let auth = account_id.and_then(|id| {
            let token = self.get_token(id);
            if token.is_none() {
                log::warn!("No token found for account {id}");
            }
            token.map(Auth::User)
        });
        Api::new(
            self.http.clone(),
            ApiConfig {
                origin: self.base_url.clone(),
                client_package: Some(self.client_package.clone()),
                client_version: None,
                user_agent: Some(USER_AGENT.to_string()),
                auth,
            },
        )
    }

    pub async fn download_file(&self, url: &str, account_id: Option<&str>) -> Result<Vec<u8>> {
        let token = account_id.and_then(|id| self.get_token(id));
        Ok(
            http::retry_with_profile(RetryProfile::Background, || async {
                let mut request = self.http.get(url);
                if let Some(token) = &token {
                    // A header would ride the redirect to presigned storage; a query does not.
                    request = request.query(&[("token", token)]);
                }
                request.send().await?.error_for_status()?.bytes().await
            })
            .await?,
        )
    }
}
