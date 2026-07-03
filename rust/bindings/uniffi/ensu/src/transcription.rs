use std::sync::Arc;

use thiserror::Error;

use ente_ensu::transcription as core;

#[derive(Debug, Error, uniffi::Error)]
pub enum TranscriptionError {
    #[error("{0}")]
    Message(String),
}

impl From<core::TranscriptionError> for TranscriptionError {
    fn from(value: core::TranscriptionError) -> Self {
        Self::Message(value.to_string())
    }
}

#[derive(Debug, Clone, uniffi::Enum)]
pub enum TranscriptionModelEvent {
    DownloadProgress {
        downloaded: u64,
        total: u64,
        percentage: f64,
    },
    ExtractionStarted,
    ExtractionCompleted,
    DownloadComplete,
    DownloadError {
        message: String,
    },
}

impl From<core::ModelEvent> for TranscriptionModelEvent {
    fn from(value: core::ModelEvent) -> Self {
        match value {
            core::ModelEvent::DownloadProgress {
                downloaded,
                total,
                percentage,
            } => Self::DownloadProgress {
                downloaded,
                total,
                percentage,
            },
            core::ModelEvent::ExtractionStarted => Self::ExtractionStarted,
            core::ModelEvent::ExtractionCompleted => Self::ExtractionCompleted,
            core::ModelEvent::DownloadComplete => Self::DownloadComplete,
            core::ModelEvent::DownloadError { message } => Self::DownloadError { message },
        }
    }
}

#[uniffi::export(callback_interface)]
pub trait TranscriptionModelEventCallback: Send + Sync {
    fn on_event(&self, event: TranscriptionModelEvent);
}

#[derive(uniffi::Object)]
pub struct Transcriber {
    inner: core::Transcriber,
}

#[uniffi::export]
impl Transcriber {
    #[uniffi::constructor]
    pub fn new(models_dir: String) -> Arc<Self> {
        Arc::new(Self {
            inner: core::Transcriber::new(models_dir),
        })
    }

    pub fn is_model_downloaded(&self) -> bool {
        self.inner.is_model_downloaded()
    }

    pub fn download_model(
        &self,
        callback: Box<dyn TranscriptionModelEventCallback>,
    ) -> Result<String, TranscriptionError> {
        self.inner
            .download_model(|event| callback.on_event(event.into()))
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(Into::into)
    }

    pub fn load_model(&self) -> Result<(), TranscriptionError> {
        self.inner.load_model().map_err(Into::into)
    }

    pub fn unload_model(&self) {
        self.inner.unload_model();
    }

    pub fn transcribe(
        &self,
        input_sample_rate: u32,
        pcm_le: Vec<u8>,
    ) -> Result<String, TranscriptionError> {
        self.inner
            .transcribe(input_sample_rate, pcm_le)
            .map_err(Into::into)
    }
}
