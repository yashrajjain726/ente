use crate::ml::{
    error::{MlError, MlResult},
    onnx,
    runtime::MlRuntimeView,
    types::{DecodedImage, PetBodyResult, PetFaceResult},
};

use super::preprocess::PetEmbeddingPreprocessor;

const FACE_EMBED_INPUT_SIZE: i64 = 224;
const BODY_EMBED_INPUT_SIZE: i64 = 224;
const FACE_EMBED_CHANNELS: i64 = 3;
const BODY_EMBED_CHANNELS: i64 = 3;

pub(super) struct IndexedEmbeddingBatch {
    pub(super) indices: Vec<usize>,
    pub(super) input: Vec<f32>,
}

impl IndexedEmbeddingBatch {
    fn new(item_capacity: usize, floats_per_item: usize) -> Self {
        Self {
            indices: Vec::with_capacity(item_capacity),
            input: Vec::with_capacity(item_capacity * floats_per_item),
        }
    }

    fn is_empty(&self) -> bool {
        self.indices.is_empty()
    }
}

pub(crate) struct PetFaceEmbeddingInputs {
    pub(super) dog: IndexedEmbeddingBatch,
    pub(super) cat: IndexedEmbeddingBatch,
}

impl PetFaceEmbeddingInputs {
    pub(super) fn new(dog_capacity: usize, cat_capacity: usize) -> Self {
        let floats_per_face =
            (FACE_EMBED_INPUT_SIZE * FACE_EMBED_INPUT_SIZE * FACE_EMBED_CHANNELS) as usize;
        Self {
            dog: IndexedEmbeddingBatch::new(dog_capacity, floats_per_face),
            cat: IndexedEmbeddingBatch::new(cat_capacity, floats_per_face),
        }
    }

    pub(super) fn batch_mut(&mut self, class_id: u8) -> &mut IndexedEmbeddingBatch {
        if class_id == 1 {
            &mut self.cat
        } else {
            &mut self.dog
        }
    }
}

/// Run pet face embedding on aligned face inputs.
///
/// The species parameter (0=dog, 1=cat) selects the model to use.
///
/// Input per face: CHW float32 of shape [1, 3, 224, 224], ImageNet-normalized.
/// Output: L2-normalized embedding vector (128-d for BYOL).
///
/// This mirrors `pet_pipeline/embedding.py` `Embedder.embed_face()`.
/// Run pet face embedding using each face's own `class_id` to select the model.
///
/// Faces are grouped by species and batched per model to avoid running the
/// wrong embedding model on any detection.
pub(crate) fn run_pet_face_embedding(
    runtime: &MlRuntimeView<'_>,
    aligned_faces: PetFaceEmbeddingInputs,
    face_results: &mut [PetFaceResult],
) -> MlResult<()> {
    let aligned_count = aligned_faces.dog.indices.len() + aligned_faces.cat.indices.len();
    if aligned_count == 0 {
        return Ok(());
    }
    if aligned_count != face_results.len() {
        return Err(MlError::Postprocess(format!(
            "aligned pet faces count ({}) does not match face result count ({})",
            aligned_count,
            face_results.len()
        )));
    }

    let per_face_len =
        (FACE_EMBED_INPUT_SIZE * FACE_EMBED_INPUT_SIZE * FACE_EMBED_CHANNELS) as usize;

    for (species, batch) in [(0u8, aligned_faces.dog), (1u8, aligned_faces.cat)] {
        if batch.is_empty() {
            continue;
        }
        if batch.input.len() != per_face_len * batch.indices.len() {
            return Err(MlError::Preprocess(format!(
                "pet face batch tensor length {} does not match expected {}",
                batch.input.len(),
                per_face_len * batch.indices.len()
            )));
        }

        let mut session = if species == 0 {
            runtime.pet_face_embedding_dog_session()?
        } else {
            runtime.pet_face_embedding_cat_session()?
        };

        let (shape, output) = onnx::run_f32(
            &mut session,
            batch.input,
            [
                batch.indices.len() as i64,
                FACE_EMBED_CHANNELS,
                FACE_EMBED_INPUT_SIZE,
                FACE_EMBED_INPUT_SIZE,
            ],
        )?;

        if shape.is_empty() {
            return Err(MlError::Postprocess(
                "pet face embedding output shape is empty".to_string(),
            ));
        }
        let output_batch = shape[0] as usize;
        if output_batch != batch.indices.len() {
            return Err(MlError::Postprocess(format!(
                "pet face embedding batch mismatch: output={output_batch}, expected={}",
                batch.indices.len()
            )));
        }
        let embedding_size = output.len() / output_batch;
        if embedding_size == 0 || output.len() != output_batch * embedding_size {
            return Err(MlError::Postprocess(format!(
                "pet face embedding output not evenly divisible: len={}, batch={output_batch}",
                output.len()
            )));
        }

        for (batch_idx, &orig_idx) in batch.indices.iter().enumerate() {
            let start = batch_idx * embedding_size;
            let mut embedding = output[start..(start + embedding_size)].to_vec();
            normalize_embedding(&mut embedding);
            face_results[orig_idx].face_embedding = embedding;
            face_results[orig_idx].species = species;
        }
    }

    Ok(())
}

/// Run pet body embedding on cropped body regions.
///
/// Each body's own `coco_class` (16=dog, 15=cat) selects the embedding model,
/// so mixed-species images get the correct model per detection.
/// Bodies are grouped by species and batched per model.
///
/// This mirrors `pet_pipeline/embedding.py` `Embedder.embed_body()`.
pub(crate) fn run_pet_body_embedding(
    runtime: &MlRuntimeView<'_>,
    decoded: &DecodedImage,
    body_results: &mut [PetBodyResult],
) -> MlResult<()> {
    if body_results.is_empty() {
        return Ok(());
    }

    let per_body_len =
        (BODY_EMBED_INPUT_SIZE * BODY_EMBED_INPUT_SIZE * BODY_EMBED_CHANNELS) as usize;

    // Preprocess all crops and group by species.
    // Skip detections whose crop is invalid (e.g. zero-area edge boxes)
    // rather than aborting the whole image.
    let cat_count = body_results
        .iter()
        .filter(|result| result.detection.coco_class == 15)
        .count();
    let dog_count = body_results.len() - cat_count;
    let mut dog_batch = IndexedEmbeddingBatch::new(dog_count, per_body_len);
    let mut cat_batch = IndexedEmbeddingBatch::new(cat_count, per_body_len);
    let mut preprocessor = PetEmbeddingPreprocessor::new();

    for (i, body_result) in body_results.iter().enumerate() {
        let batch = if body_result.detection.coco_class == 15 {
            &mut cat_batch
        } else {
            &mut dog_batch
        };
        let original_len = batch.input.len();
        if preprocessor
            .append(decoded, &body_result.detection.box_xyxy, &mut batch.input)
            .is_ok()
        {
            batch.indices.push(i);
        } else {
            batch.input.truncate(original_len);
        }
    }

    for (is_cat, batch) in [(false, dog_batch), (true, cat_batch)] {
        if batch.is_empty() {
            continue;
        }

        let mut session = if is_cat {
            runtime.pet_body_embedding_cat_session()?
        } else {
            runtime.pet_body_embedding_dog_session()?
        };

        let (shape, output) = onnx::run_f32(
            &mut session,
            batch.input,
            [
                batch.indices.len() as i64,
                BODY_EMBED_CHANNELS,
                BODY_EMBED_INPUT_SIZE,
                BODY_EMBED_INPUT_SIZE,
            ],
        )?;

        if shape.is_empty() {
            return Err(MlError::Postprocess(
                "pet body embedding output shape is empty".to_string(),
            ));
        }
        let output_batch = shape[0] as usize;
        if output_batch != batch.indices.len() {
            return Err(MlError::Postprocess(format!(
                "pet body embedding batch mismatch: output={output_batch}, expected={}",
                batch.indices.len()
            )));
        }
        let embedding_size = output.len() / output_batch;
        if embedding_size == 0 || output.len() != output_batch * embedding_size {
            return Err(MlError::Postprocess(format!(
                "pet body embedding output not evenly divisible: len={}, batch={output_batch}",
                output.len()
            )));
        }

        for (batch_idx, &orig_idx) in batch.indices.iter().enumerate() {
            let start = batch_idx * embedding_size;
            let mut embedding = output[start..(start + embedding_size)].to_vec();
            normalize_embedding(&mut embedding);
            body_results[orig_idx].body_embedding = embedding;
        }
    }

    Ok(())
}

fn normalize_embedding(embedding: &mut [f32]) {
    let mut norm = 0.0f32;
    for value in embedding.iter() {
        norm += value * value;
    }
    let norm = norm.sqrt();
    if norm <= 1e-12 {
        return;
    }
    for value in embedding.iter_mut() {
        *value /= norm;
    }
}
