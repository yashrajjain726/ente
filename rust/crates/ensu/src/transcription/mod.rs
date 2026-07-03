mod audio;
mod model;
mod text;
mod transcriber;

pub use model::ModelEvent;
pub use transcriber::Transcriber;

#[derive(Debug, thiserror::Error)]
pub enum TranscriptionError {
    #[error("Transcription model is not downloaded")]
    NotDownloaded,
    #[error("Voice activity model is not downloaded")]
    VadNotDownloaded,
    #[error("{0}")]
    InvalidAudio(String),
    #[error(transparent)]
    Download(#[from] crate::download::Error),
    #[error("{0}")]
    Transcribe(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

impl From<transcribe_rs::TranscribeError> for TranscriptionError {
    fn from(value: transcribe_rs::TranscribeError) -> Self {
        Self::Transcribe(value.to_string())
    }
}

impl From<rubato::ResamplerConstructionError> for TranscriptionError {
    fn from(value: rubato::ResamplerConstructionError) -> Self {
        Self::InvalidAudio(value.to_string())
    }
}

pub type Result<T> = std::result::Result<T, TranscriptionError>;
