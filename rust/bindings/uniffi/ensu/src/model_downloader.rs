use std::path::PathBuf;
use std::sync::Arc;

use crate::download::DownloadError;
use crate::llm::{LlmError, LlmModelDownloadCallback};

#[derive(Debug, Clone, uniffi::Record)]
pub struct ModelTarget {
    pub id: String,
    pub url: String,
    pub mmproj_url: Option<String>,
}

impl From<ModelTarget> for ente_model_download::ModelTarget {
    fn from(value: ModelTarget) -> Self {
        Self {
            id: value.id,
            url: value.url,
            mmproj_url: value.mmproj_url,
        }
    }
}

#[derive(uniffi::Object)]
pub struct ModelDownloader {
    inner: ente_model_download::ModelDownloader,
}

#[uniffi::export]
impl ModelDownloader {
    #[uniffi::constructor]
    pub fn new(models_dir: String, legacy_dir: Option<String>) -> Arc<Self> {
        Arc::new(Self {
            inner: ente_model_download::ModelDownloader::new(
                models_dir,
                legacy_dir.map(PathBuf::from),
            ),
        })
    }

    pub fn model_path(&self, target: ModelTarget) -> String {
        self.inner.model_path(&target.into()).display().to_string()
    }

    pub fn mmproj_path(&self, target: ModelTarget) -> Option<String> {
        self.inner
            .mmproj_path(&target.into())
            .map(|path| path.display().to_string())
    }

    pub fn is_downloaded(&self, target: ModelTarget) -> bool {
        self.inner.is_downloaded(&target.into())
    }

    pub fn is_download_active(&self) -> bool {
        self.inner.is_download_active()
    }

    pub fn estimated_download_size(&self, target: ModelTarget) -> Option<i64> {
        self.inner.estimated_download_size(&target.into())
    }

    pub fn migrate(&self) {
        self.inner.migrate();
    }

    pub fn cancel(&self) {
        self.inner.cancel();
    }

    pub fn remove_downloaded(&self, target: ModelTarget) -> bool {
        self.inner.remove_downloaded(&target.into())
    }

    pub fn download(
        &self,
        target: ModelTarget,
        callback: Box<dyn LlmModelDownloadCallback>,
    ) -> Result<bool, LlmError> {
        let callback: Arc<dyn LlmModelDownloadCallback> = Arc::from(callback);
        let progress_callback = Arc::clone(&callback);
        let cancel_callback = Arc::clone(&callback);
        self.inner
            .download(
                &target.into(),
                move |progress| progress_callback.on_progress(progress.into()),
                move || cancel_callback.is_cancelled(),
            )
            .map_err(|err| match DownloadError::from(err) {
                DownloadError::Cancelled => LlmError::Cancelled,
                error => LlmError::Download { error },
            })
    }
}
