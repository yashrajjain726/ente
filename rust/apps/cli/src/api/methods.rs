use crate::api::client::ApiClient;
use crate::api::models::{
    Collection, File, GetCollectionsResponse, GetDiffResponse, GetFileResponse, GetFilesResponse,
    GetThumbnailUrlResponse, UserDetails,
};
use crate::models::error::Result;
use ente_core::http;
use ente_core::urls::file_download_url;

pub struct ApiMethods<'a> {
    client: &'a ApiClient,
}

impl<'a> ApiMethods<'a> {
    pub fn new(client: &'a ApiClient) -> Self {
        Self { client }
    }

    pub async fn get_user_details(&self, account_id: &str) -> Result<UserDetails> {
        let api = self.client.api(Some(account_id));
        Ok(http::retry(|| async {
            api.get("/users/details")
                .send()
                .await?
                .error_for_code()
                .await?
                .json()
                .await
        })
        .await?)
    }

    pub async fn get_collections(
        &self,
        account_id: &str,
        since_time: i64,
    ) -> Result<Vec<Collection>> {
        let api = self.client.api(Some(account_id));
        let response: GetCollectionsResponse = http::retry(|| async {
            api.get("/collections/v2")
                .query(&[("sinceTime", since_time.to_string())])
                .send()
                .await?
                .error_for_code()
                .await?
                .json()
                .await
        })
        .await?;
        Ok(response.collections)
    }

    pub async fn get_collection(&self, account_id: &str, collection_id: i64) -> Result<Collection> {
        let api = self.client.api(Some(account_id));
        Ok(http::retry(|| async {
            api.get(&format!("/collections/{collection_id}"))
                .send()
                .await?
                .error_for_code()
                .await?
                .json()
                .await
        })
        .await?)
    }

    pub async fn get_collection_files(
        &self,
        account_id: &str,
        collection_id: i64,
        since_time: i64,
    ) -> Result<(Vec<File>, bool)> {
        let api = self.client.api(Some(account_id));
        let response: GetFilesResponse = http::retry(|| async {
            api.get("/collections/v2/diff")
                .query(&[
                    ("collectionID", collection_id.to_string()),
                    ("sinceTime", since_time.to_string()),
                ])
                .send()
                .await?
                .error_for_code()
                .await?
                .json()
                .await
        })
        .await?;
        Ok((response.diff, response.has_more))
    }

    pub async fn get_file(
        &self,
        account_id: &str,
        collection_id: i64,
        file_id: i64,
    ) -> Result<File> {
        let api = self.client.api(Some(account_id));
        let response: GetFileResponse = http::retry(|| async {
            api.get("/collections/file")
                .query(&[
                    ("collectionID", collection_id.to_string()),
                    ("fileID", file_id.to_string()),
                ])
                .send()
                .await?
                .error_for_code()
                .await?
                .json()
                .await
        })
        .await?;
        Ok(response.file)
    }

    pub async fn get_diff(
        &self,
        account_id: &str,
        since_time: i64,
        limit: i32,
    ) -> Result<(Vec<File>, bool)> {
        let api = self.client.api(Some(account_id));
        let response: GetDiffResponse = http::retry(|| async {
            api.get("/diff")
                .query(&[
                    ("sinceTime", since_time.to_string()),
                    ("limit", limit.to_string()),
                ])
                .send()
                .await?
                .error_for_code()
                .await?
                .json()
                .await
        })
        .await?;
        Ok((response.diff, response.has_more))
    }

    pub async fn get_file_url(&self, _account_id: &str, file_id: i64) -> Result<String> {
        Ok(file_download_url(&self.client.base_url, file_id))
    }

    pub async fn get_thumbnail_url(&self, account_id: &str, file_id: i64) -> Result<String> {
        let api = self.client.api(Some(account_id));
        let response: GetThumbnailUrlResponse = http::retry(|| async {
            api.get(&format!("/files/preview/{file_id}"))
                .send()
                .await?
                .error_for_code()
                .await?
                .json()
                .await
        })
        .await?;
        Ok(response.url)
    }

    pub async fn download_file(&self, account_id: &str, file_id: i64) -> Result<Vec<u8>> {
        let url = self.get_file_url(account_id, file_id).await?;
        self.client.download_file(&url, Some(account_id)).await
    }

    pub async fn download_thumbnail(&self, account_id: &str, file_id: i64) -> Result<Vec<u8>> {
        let url = self.get_thumbnail_url(account_id, file_id).await?;
        self.client.download_file(&url, Some(account_id)).await
    }

    pub async fn get_trash(&self, account_id: &str, since_time: i64) -> Result<(Vec<File>, bool)> {
        let api = self.client.api(Some(account_id));
        let response: GetDiffResponse = http::retry(|| async {
            api.get("/trash/v2")
                .query(&[("sinceTime", since_time.to_string())])
                .send()
                .await?
                .error_for_code()
                .await?
                .json()
                .await
        })
        .await?;
        Ok((response.diff, response.has_more))
    }

    pub async fn delete_from_trash(&self, account_id: &str, file_ids: &[i64]) -> Result<()> {
        let api = self.client.api(Some(account_id));
        let body = serde_json::json!({ "fileIDs": file_ids });
        http::retry(|| async {
            api.post("/trash/delete")
                .json(&body)
                .send()
                .await?
                .error_for_code()
                .await?;
            Ok(())
        })
        .await?;
        Ok(())
    }

    pub async fn empty_trash(&self, account_id: &str) -> Result<()> {
        let api = self.client.api(Some(account_id));
        http::retry(|| async {
            api.delete("/trash/empty")
                .send()
                .await?
                .error_for_code()
                .await?;
            Ok(())
        })
        .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_file_url_generation() {
        let api = ApiClient::new(None).unwrap();
        let methods = ApiMethods::new(&api);

        // For production endpoint, should use CDN
        let url = methods.get_file_url("test", 12345).await;
        assert!(url.is_ok());
        assert!(url.unwrap().contains("files.ente.com"));
    }
}
