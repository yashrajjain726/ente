use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

use transcribe_rs::onnx::Quantization;
use transcribe_rs::onnx::parakeet::{ParakeetModel, ParakeetParams, TimestampGranularity};

use crate::transcription::audio::extract_speech_from_pcm16;
use crate::transcription::model::{self, ModelEvent};
use crate::transcription::text::filter_transcription_output;
use crate::transcription::{Result, error};

pub struct TranscriptionModel {
    models_dir: PathBuf,
    loaded: Mutex<Option<LoadedModel>>,
}

struct LoadedModel {
    path: PathBuf,
    model: ParakeetModel,
}

impl TranscriptionModel {
    pub fn new(models_dir: impl Into<PathBuf>) -> Self {
        Self {
            models_dir: models_dir.into(),
            loaded: Mutex::new(None),
        }
    }

    pub fn is_model_downloaded(&self) -> bool {
        model::is_model_downloaded(&self.models_dir)
    }

    pub fn model_path(&self) -> PathBuf {
        model::model_path(&self.models_dir)
    }

    pub fn model_size_mb(&self) -> u64 {
        model::model_size_mb()
    }

    pub fn download_model(&self, on_event: impl FnMut(ModelEvent)) -> Result<PathBuf> {
        model::download_model(&self.models_dir, on_event)
    }

    pub fn load(&self) -> Result<()> {
        let model_dir = model::model_path(&self.models_dir);
        if !model_dir.is_dir() {
            return Err(error("Transcription model is not downloaded"));
        }
        ensure_loaded(&mut self.lock(), &model_dir)
    }

    pub fn unload(&self) {
        *self.lock() = None;
    }

    pub fn transcribe(&self, input_sample_rate: u32, pcm_le: Vec<u8>) -> Result<String> {
        if pcm_le.is_empty() {
            return Ok(String::new());
        }

        let model_dir = model::model_path(&self.models_dir);
        if !model_dir.is_dir() {
            return Err(error("Transcription model is not downloaded"));
        }
        let vad_model_path = model::vad_model_path(&self.models_dir);
        if !vad_model_path.is_file() {
            return Err(error("Voice activity model is not downloaded"));
        }

        let speech = extract_speech_from_pcm16(&vad_model_path, input_sample_rate, &pcm_le)?;
        if speech.is_empty() {
            return Ok(String::new());
        }

        let mut loaded = self.lock();
        ensure_loaded(&mut loaded, &model_dir)?;
        let model = &mut loaded
            .as_mut()
            .ok_or_else(|| error("Transcription model is not loaded"))?
            .model;
        let result = model.transcribe_with(
            &speech,
            &ParakeetParams {
                timestamp_granularity: Some(TimestampGranularity::Segment),
                ..Default::default()
            },
        )?;

        Ok(filter_transcription_output(&result.text))
    }

    fn lock(&self) -> MutexGuard<'_, Option<LoadedModel>> {
        self.loaded.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

fn ensure_loaded(loaded: &mut Option<LoadedModel>, model_dir: &Path) -> Result<()> {
    if loaded.as_ref().map(|entry| entry.path.as_path()) == Some(model_dir) {
        return Ok(());
    }

    let model = ParakeetModel::load(model_dir, &Quantization::Int8)?;
    *loaded = Some(LoadedModel {
        path: model_dir.to_path_buf(),
        model,
    });
    Ok(())
}
