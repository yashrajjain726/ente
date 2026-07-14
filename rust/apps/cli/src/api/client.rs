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
        self.api_at(&self.base_url, account_id)
    }

    fn api_at(&self, origin: &str, account_id: Option<&str>) -> Api {
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
                origin: origin.to_owned(),
                client_package: Some(self.client_package.clone()),
                client_version: None,
                user_agent: Some(USER_AGENT.to_string()),
                auth,
            },
        )
    }

    pub async fn download_file(&self, url: &str) -> Result<Vec<u8>> {
        Ok(
            http::retry_with_profile(RetryProfile::Background, || async {
                self.http
                    .get(url)
                    .send()
                    .await?
                    .error_for_status()?
                    .bytes()
                    .await
            })
            .await?,
        )
    }

    pub async fn download_from_proxy(
        &self,
        origin: &str,
        account_id: &str,
        file_id: i64,
    ) -> Result<Vec<u8>> {
        let api = self.api_at(origin, Some(account_id));
        Ok(
            http::retry_with_profile(RetryProfile::Background, || async {
                api.get("/")
                    .query(&[("fileID", file_id)])
                    .send()
                    .await?
                    .error_for_status()?
                    .bytes()
                    .await
            })
            .await?,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mockito::{Matcher, Server};

    #[tokio::test]
    async fn proxy_download_uses_api_headers() {
        let mut server = Server::new_async().await;
        let download = server
            .mock("GET", "/")
            .match_query(Matcher::UrlEncoded("fileID".into(), "12345".into()))
            .match_header("x-auth-token", "token")
            .match_header("x-client-package", "io.ente.locker")
            .with_body("file")
            .create_async()
            .await;
        let client = ApiClient::new_with_client_package(None, "io.ente.locker").unwrap();
        client.add_token("account", "token");

        let bytes = client
            .download_from_proxy(&server.url(), "account", 12345)
            .await
            .unwrap();

        download.assert_async().await;
        assert_eq!(bytes, b"file");
    }
}
