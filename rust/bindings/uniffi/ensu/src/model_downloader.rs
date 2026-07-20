use std::path::Path;
use std::sync::Arc;

use crate::download::DownloadError;
use crate::llm::LlmError;

#[derive(Debug, Clone, uniffi::Enum)]
pub enum ModelDownloadTarget {
    Gguf {
        id: String,
        url: String,
        sha256: String,
        mmproj_url: Option<String>,
        mmproj_sha256: Option<String>,
    },
    TarGz {
        id: String,
        url: String,
        sha256: String,
    },
    File {
        id: String,
        name: String,
        url: String,
        sha256: String,
    },
}

impl From<ModelDownloadTarget> for ente_model_download::ModelDownloadTarget {
    fn from(value: ModelDownloadTarget) -> Self {
        match value {
            ModelDownloadTarget::Gguf {
                id,
                url,
                sha256,
                mmproj_url,
                mmproj_sha256,
            } => ente_model_download::ModelDownloadTarget::gguf(
                id,
                url,
                sha256,
                mmproj_url,
                mmproj_sha256,
            ),
            ModelDownloadTarget::TarGz { id, url, sha256 } => Self::TarGz { id, url, sha256 },
            ModelDownloadTarget::File {
                id,
                name,
                url,
                sha256,
            } => ente_model_download::ModelDownloadTarget::file(id, name, url, sha256),
        }
    }
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct ModelDownloadProgress {
    pub downloaded_bytes: i64,
    pub total_bytes: Option<i64>,
    pub percent: i32,
    pub status: String,
    pub log_line: Option<String>,
}

impl From<ente_model_download::ModelDownloadProgress> for ModelDownloadProgress {
    fn from(value: ente_model_download::ModelDownloadProgress) -> Self {
        Self {
            downloaded_bytes: i64::try_from(value.downloaded_bytes).unwrap_or(i64::MAX),
            total_bytes: value
                .total_bytes
                .map(|total| i64::try_from(total).unwrap_or(i64::MAX)),
            percent: value.percent,
            status: value.status,
            log_line: value.log_line,
        }
    }
}

#[uniffi::export(callback_interface)]
pub trait ModelDownloadCallback: Send + Sync {
    fn on_progress(&self, progress: ModelDownloadProgress);
    fn is_cancelled(&self) -> bool;
}

#[derive(uniffi::Record)]
pub struct EnsuLegacyModels {
    pub llm_dir: Option<String>,
    pub transcription_dir: String,
    pub model_url: Option<String>,
    pub mmproj_url: Option<String>,
}

#[uniffi::export]
pub fn migrate_ensu_legacy_models(
    models_dir: String,
    legacy: EnsuLegacyModels,
    llm_targets: Vec<ModelDownloadTarget>,
    transcription_model: ModelDownloadTarget,
    voice_activity_model: ModelDownloadTarget,
) -> Option<String> {
    let llm_targets: Vec<ente_model_download::ModelDownloadTarget> =
        llm_targets.into_iter().map(Into::into).collect();
    ente_model_download::migrate_ensu_legacy_models(
        Path::new(&models_dir),
        legacy.llm_dir.as_deref().map(Path::new),
        Path::new(&legacy.transcription_dir),
        &llm_targets,
        &transcription_model.into(),
        &voice_activity_model.into(),
    );
    let defaults = ente_ensu::config::defaults();
    ente_ensu::config::legacy_selected_preset_id(
        &defaults.mobile_model_presets,
        legacy.model_url.as_deref()?,
        legacy.mmproj_url.as_deref(),
    )
}

#[derive(uniffi::Object)]
pub struct ModelDownloadCore {
    inner: ente_model_download::ModelDownloader,
}

#[uniffi::export]
impl ModelDownloadCore {
    #[uniffi::constructor]
    pub fn new(models_dir: String) -> Arc<Self> {
        Arc::new(Self {
            inner: ente_model_download::ModelDownloader::new(models_dir),
        })
    }

    pub fn model_path(&self, target: ModelDownloadTarget) -> String {
        self.inner.model_path(&target.into()).display().to_string()
    }

    pub fn mmproj_path(&self, target: ModelDownloadTarget) -> Option<String> {
        self.inner
            .file_path(&target.into(), "mmproj.gguf")
            .map(|path| path.display().to_string())
    }

    pub fn is_downloaded(&self, target: ModelDownloadTarget) -> bool {
        self.inner.is_downloaded(&target.into())
    }

    pub fn is_download_active(&self) -> bool {
        self.inner.is_download_active()
    }

    pub fn estimated_download_size(&self, target: ModelDownloadTarget) -> Option<i64> {
        self.inner.estimated_download_size(&target.into())
    }

    pub fn cancel(&self) {
        self.inner.cancel();
    }

    pub fn remove_downloaded(&self, target: ModelDownloadTarget) -> bool {
        self.inner.remove_downloaded(&target.into())
    }

    pub fn download(
        &self,
        targets: Vec<ModelDownloadTarget>,
        callback: Box<dyn ModelDownloadCallback>,
    ) -> Result<bool, LlmError> {
        let callback: Arc<dyn ModelDownloadCallback> = Arc::from(callback);
        let progress_callback = Arc::clone(&callback);
        let cancel_callback = Arc::clone(&callback);
        let targets: Vec<ente_model_download::ModelDownloadTarget> =
            targets.into_iter().map(Into::into).collect();
        self.inner
            .download(
                &targets,
                move |progress| progress_callback.on_progress(progress.into()),
                move || cancel_callback.is_cancelled(),
            )
            .map_err(|err| match DownloadError::from(err) {
                DownloadError::Cancelled => LlmError::Cancelled,
                error => LlmError::Download { error },
            })
    }
}
