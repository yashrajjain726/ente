use std::sync::RwLock;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Duration;

use ente_core::http::Error;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, LOCATION};
#[cfg(not(target_arch = "wasm32"))]
use reqwest::redirect::Policy;
use reqwest::{Response, Url};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

const TOKEN_HEADER: &str = "X-Auth-Token";
const SPACE_SESSION_TOKEN_HEADER: &str = "X-Space-Session-Token";
const CLIENT_PKG_HEADER: &str = "X-Client-Package";
const CLIENT_VERSION_HEADER: &str = "X-Client-Version";

#[derive(Clone, Default)]
pub struct HttpConfig {
    pub base_url: String,
    pub auth_token: Option<String>,
    pub space_session_token: Option<String>,
    pub user_agent: Option<String>,
    pub client_package: Option<String>,
    pub client_version: Option<String>,
    pub timeout_secs: Option<u64>,
}

pub struct HttpClient {
    client: reqwest::Client,
    no_redirect_client: reqwest::Client,
    base_url: String,
    auth_token: RwLock<Option<Zeroizing<String>>>,
    space_session_token: Option<Zeroizing<String>>,
    #[cfg(not(target_arch = "wasm32"))]
    user_agent: Option<String>,
    client_package: Option<String>,
    client_version: Option<String>,
}

#[derive(Clone)]
pub struct ObjectStoreHttpClient {
    client: reqwest::Client,
}

#[derive(Deserialize)]
struct ApiErrorBody {
    code: Option<String>,
    message: Option<String>,
}

impl HttpClient {
    pub fn new_with_config(config: HttpConfig) -> Result<Self, Error> {
        let base_url = config.base_url.trim_end_matches('/').to_string();

        #[cfg(not(target_arch = "wasm32"))]
        let mut builder = reqwest::Client::builder();
        #[cfg(target_arch = "wasm32")]
        let builder = reqwest::Client::builder();
        #[cfg(not(target_arch = "wasm32"))]
        if let Some(timeout) = config.timeout_secs {
            builder = builder.timeout(Duration::from_secs(timeout));
        }
        let client = builder.build().map_err(Error::from)?;

        #[cfg(not(target_arch = "wasm32"))]
        let mut no_redirect_builder = reqwest::Client::builder().redirect(Policy::none());
        #[cfg(target_arch = "wasm32")]
        let no_redirect_builder = reqwest::Client::builder();
        #[cfg(not(target_arch = "wasm32"))]
        if let Some(timeout) = config.timeout_secs {
            no_redirect_builder = no_redirect_builder.timeout(Duration::from_secs(timeout));
        }
        let no_redirect_client = no_redirect_builder.build().map_err(Error::from)?;

        Ok(Self {
            client,
            no_redirect_client,
            base_url,
            auth_token: RwLock::new(config.auth_token.map(Zeroizing::new)),
            space_session_token: config.space_session_token.map(Zeroizing::new),
            #[cfg(not(target_arch = "wasm32"))]
            user_agent: config.user_agent,
            client_package: config.client_package,
            client_version: config.client_version,
        })
    }

    pub fn set_auth_token(&self, auth_token: Option<String>) {
        *self.auth_token.write().expect("auth token lock poisoned") =
            auth_token.map(Zeroizing::new);
    }

    pub fn object_store(&self) -> ObjectStoreHttpClient {
        ObjectStoreHttpClient {
            client: self.no_redirect_client.clone(),
        }
    }

    pub async fn get_json<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<T, Error> {
        let url = self.request_url(path)?;
        let request_context = request_context_with_query("GET", &url, query);
        let request = self
            .client
            .get(&url)
            .headers(self.build_headers()?)
            .query(query);
        let response = request
            .send()
            .await
            .map_err(Error::from)
            .map_err(|error| with_request_context(error, &request_context))?;
        parse_json_response(response)
            .await
            .map_err(|error| with_request_context(error, &request_context))
    }

    pub async fn get_json_optional<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<Option<T>, Error> {
        let url = self.request_url(path)?;
        let request_context = request_context_with_query("GET", &url, query);
        let request = self
            .client
            .get(&url)
            .headers(self.build_headers()?)
            .query(query);
        let response = request
            .send()
            .await
            .map_err(Error::from)
            .map_err(|error| with_request_context(error, &request_context))?;
        if response.status().as_u16() == 404 {
            return Ok(None);
        }
        parse_json_response(response)
            .await
            .map(Some)
            .map_err(|error| with_request_context(error, &request_context))
    }

    pub async fn post_json<T: DeserializeOwned, B: Serialize + ?Sized>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, Error> {
        let url = self.request_url(path)?;
        let request_context = request_context("POST", &url);
        let request = self
            .client
            .post(&url)
            .headers(self.build_headers()?)
            .json(body);
        let response = request
            .send()
            .await
            .map_err(Error::from)
            .map_err(|error| with_request_context(error, &request_context))?;
        parse_json_response(response)
            .await
            .map_err(|error| with_request_context(error, &request_context))
    }

    pub async fn post_empty<B: Serialize + ?Sized>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<(), Error> {
        let url = self.request_url(path)?;
        let request_context = request_context("POST", &url);
        let request = self
            .client
            .post(&url)
            .headers(self.build_headers()?)
            .json(body);
        let response = request
            .send()
            .await
            .map_err(Error::from)
            .map_err(|error| with_request_context(error, &request_context))?;
        parse_empty_response(response)
            .await
            .map_err(|error| with_request_context(error, &request_context))
    }

    pub async fn put_json<T: DeserializeOwned, B: Serialize + ?Sized>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, Error> {
        let url = self.request_url(path)?;
        let request_context = request_context("PUT", &url);
        let request = self
            .client
            .put(&url)
            .headers(self.build_headers()?)
            .json(body);
        let response = request
            .send()
            .await
            .map_err(Error::from)
            .map_err(|error| with_request_context(error, &request_context))?;
        parse_json_response(response)
            .await
            .map_err(|error| with_request_context(error, &request_context))
    }

    pub async fn put_empty<B: Serialize + ?Sized>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<(), Error> {
        let url = self.request_url(path)?;
        let request_context = request_context("PUT", &url);
        let request = self
            .client
            .put(&url)
            .headers(self.build_headers()?)
            .json(body);
        let response = request
            .send()
            .await
            .map_err(Error::from)
            .map_err(|error| with_request_context(error, &request_context))?;
        parse_empty_response(response)
            .await
            .map_err(|error| with_request_context(error, &request_context))
    }

    pub async fn delete_empty(&self, path: &str, query: &[(&str, String)]) -> Result<(), Error> {
        let url = self.request_url(path)?;
        let request_context = request_context_with_query("DELETE", &url, query);
        let request = self
            .client
            .delete(&url)
            .headers(self.build_headers()?)
            .query(query);
        let response = request
            .send()
            .await
            .map_err(Error::from)
            .map_err(|error| with_request_context(error, &request_context))?;
        parse_empty_response(response)
            .await
            .map_err(|error| with_request_context(error, &request_context))
    }

    pub async fn delete_json<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<T, Error> {
        let url = self.request_url(path)?;
        let request_context = request_context_with_query("DELETE", &url, query);
        let request = self
            .client
            .delete(&url)
            .headers(self.build_headers()?)
            .query(query);
        let response = request
            .send()
            .await
            .map_err(Error::from)
            .map_err(|error| with_request_context(error, &request_context))?;
        parse_json_response(response)
            .await
            .map_err(|error| with_request_context(error, &request_context))
    }

    fn request_url(&self, path: &str) -> Result<String, Error> {
        if !path.starts_with('/') {
            return Err(Error::InvalidUrl(
                "request paths must start with '/'".to_string(),
            ));
        }
        debug_assert!(
            !path_contains_dot_segments(path),
            "request paths must be trusted endpoint paths without dot segments"
        );

        let base = Url::parse(&self.base_url)
            .map_err(|e| Error::InvalidUrl(format!("invalid base URL: {e}")))?;
        if base.query().is_some() || base.fragment().is_some() {
            return Err(Error::InvalidUrl(
                "base URL must not contain a query or fragment".to_string(),
            ));
        }

        Ok(format!("{}{}", self.base_url, path))
    }

    fn build_headers(&self) -> Result<HeaderMap, Error> {
        let mut headers = self.build_public_headers()?;
        if let Some(auth_token) = self
            .auth_token
            .read()
            .expect("auth token lock poisoned")
            .as_ref()
        {
            let token =
                HeaderValue::from_str(auth_token).map_err(|e| Error::Parse(e.to_string()))?;
            headers.insert(TOKEN_HEADER, token);
        }
        if let Some(space_session_token) = self.space_session_token.as_ref() {
            let token = HeaderValue::from_str(space_session_token)
                .map_err(|e| Error::Parse(e.to_string()))?;
            headers.insert(SPACE_SESSION_TOKEN_HEADER, token);
        }
        Ok(headers)
    }

    fn build_public_headers(&self) -> Result<HeaderMap, Error> {
        let mut headers = HeaderMap::new();
        #[cfg(not(target_arch = "wasm32"))]
        if let Some(user_agent) = &self.user_agent {
            let value =
                HeaderValue::from_str(user_agent).map_err(|e| Error::Parse(e.to_string()))?;
            headers.insert(reqwest::header::USER_AGENT, value);
        }
        if let Some(client_package) = &self.client_package {
            let value =
                HeaderValue::from_str(client_package).map_err(|e| Error::Parse(e.to_string()))?;
            headers.insert(CLIENT_PKG_HEADER, value);
        }
        if let Some(client_version) = &self.client_version {
            let value =
                HeaderValue::from_str(client_version).map_err(|e| Error::Parse(e.to_string()))?;
            headers.insert(CLIENT_VERSION_HEADER, value);
        }
        Ok(headers)
    }
}

impl ObjectStoreHttpClient {
    pub async fn get_bytes(&self, url: &str) -> Result<Vec<u8>, Error> {
        get_bytes_with_client(&self.client, url).await
    }

    pub async fn put_bytes(
        &self,
        url: &str,
        body: &[u8],
        headers: &[(&str, String)],
    ) -> Result<(), Error> {
        put_bytes_with_client(&self.client, url, body, headers).await
    }
}

async fn get_bytes_with_client(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, Error> {
    let mut current_url = parse_url(url)?;
    for _ in 0..5 {
        let response = client
            .get(current_url.clone())
            .headers(HeaderMap::new())
            .send()
            .await
            .map_err(Error::from)?;
        if response.status().is_redirection()
            && let Some(location) = response.headers().get(LOCATION)
        {
            current_url = resolve_redirect(&current_url, location)?;
            continue;
        }
        return parse_bytes_response(response).await;
    }

    Err(Error::InvalidUrl("too many redirects".to_string()))
}

async fn put_bytes_with_client(
    client: &reqwest::Client,
    url: &str,
    body: &[u8],
    headers: &[(&str, String)],
) -> Result<(), Error> {
    let header_map = build_header_map(headers)?;
    let mut current_url = parse_url(url)?;
    for _ in 0..5 {
        let response = client
            .put(current_url.clone())
            .headers(header_map.clone())
            .body(body.to_vec())
            .send()
            .await
            .map_err(Error::from)?;
        if response.status().is_redirection()
            && let Some(location) = response.headers().get(LOCATION)
        {
            current_url = resolve_redirect(&current_url, location)?;
            continue;
        }
        return parse_empty_response(response).await;
    }

    Err(Error::InvalidUrl("too many redirects".to_string()))
}

fn build_header_map(headers: &[(&str, String)]) -> Result<HeaderMap, Error> {
    let mut header_map = HeaderMap::new();
    for (name, value) in headers {
        let header_name =
            HeaderName::from_bytes(name.as_bytes()).map_err(|e| Error::Parse(e.to_string()))?;
        let header_value = HeaderValue::from_str(value).map_err(|e| Error::Parse(e.to_string()))?;
        header_map.insert(header_name, header_value);
    }
    Ok(header_map)
}

fn parse_url(url: &str) -> Result<Url, Error> {
    Url::parse(url).map_err(|e| Error::InvalidUrl(format!("invalid url: {e}")))
}

fn resolve_redirect(current_url: &Url, location: &HeaderValue) -> Result<Url, Error> {
    let next = location
        .to_str()
        .map_err(|e| Error::InvalidUrl(format!("invalid redirect location: {e}")))?;
    Url::parse(next)
        .or_else(|_| current_url.join(next))
        .map_err(|e| Error::InvalidUrl(format!("invalid redirect location: {e}")))
}

async fn parse_json_response<T: DeserializeOwned>(response: Response) -> Result<T, Error> {
    let text = parse_text_response(response).await?;
    serde_json::from_str(&text).map_err(Into::into)
}

async fn parse_text_response(response: Response) -> Result<String, Error> {
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "failed to read error body".to_string());
        let (code, message) = parse_api_error_body(&body);
        return Err(Error::Http {
            status,
            code,
            message,
        });
    }
    response.text().await.map_err(Into::into)
}

async fn parse_empty_response(response: Response) -> Result<(), Error> {
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "failed to read error body".to_string());
        let (code, message) = parse_api_error_body(&body);
        return Err(Error::Http {
            status,
            code,
            message,
        });
    }
    Ok(())
}

async fn parse_bytes_response(response: Response) -> Result<Vec<u8>, Error> {
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response
            .text()
            .await
            .unwrap_or_else(|_| "failed to read error body".to_string());
        let (code, message) = parse_api_error_body(&body);
        return Err(Error::Http {
            status,
            code,
            message,
        });
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(Into::into)
}

fn parse_api_error_body(body: &str) -> (Option<String>, String) {
    if let Ok(error_body) = serde_json::from_str::<ApiErrorBody>(body) {
        let message = error_body
            .message
            .clone()
            .or_else(|| error_body.code.clone())
            .unwrap_or_else(|| body.to_string());
        return (error_body.code, message);
    }

    (None, body.to_string())
}

fn request_context(method: &str, url: &str) -> String {
    format!("[request: {method} {}]", request_target(url))
}

fn request_context_with_query(method: &str, url: &str, query: &[(&str, String)]) -> String {
    if query.is_empty() {
        return request_context(method, url);
    }

    let Ok(mut parsed_url) = Url::parse(url) else {
        return request_context(method, url);
    };

    {
        let mut query_pairs = parsed_url.query_pairs_mut();
        for (key, value) in query {
            query_pairs.append_pair(key, value);
        }
    }

    format!(
        "[request: {method} {}]",
        request_target(parsed_url.as_ref())
    )
}

fn request_target(url: &str) -> String {
    let Ok(parsed_url) = Url::parse(url) else {
        return url.to_string();
    };

    match parsed_url.query() {
        Some(query) => format!("{}?{query}", parsed_url.path()),
        None => parsed_url.path().to_string(),
    }
}

fn with_request_context(error: Error, request_context: &str) -> Error {
    fn append_context(message: String, request_context: &str) -> String {
        if message.contains("[request:") {
            message
        } else {
            format!("{message} {request_context}")
        }
    }

    match error {
        Error::Network(message) => Error::Network(append_context(message, request_context)),
        Error::Http {
            status,
            code,
            message,
        } => Error::Http {
            status,
            code,
            message: append_context(message, request_context),
        },
        Error::Parse(message) => Error::Parse(append_context(message, request_context)),
        Error::InvalidUrl(message) => Error::InvalidUrl(append_context(message, request_context)),
    }
}

fn path_contains_dot_segments(path: &str) -> bool {
    path.split(['?', '#'])
        .next()
        .unwrap_or(path)
        .split('/')
        .any(|segment| {
            matches!(segment, "." | "..")
                || segment.eq_ignore_ascii_case("%2e")
                || segment.eq_ignore_ascii_case("%2e%2e")
        })
}
