use crate::ml::{
    error::{MlError, MlResult},
    onnx,
    runtime::MlRuntimeView,
    types::FaceResult,
};

const FACE_INPUT_WIDTH: i64 = 112;
const FACE_INPUT_HEIGHT: i64 = 112;
const FACE_INPUT_CHANNELS: i64 = 3;

pub fn run_face_embedding(
    runtime: &MlRuntimeView<'_>,
    aligned_faces: Vec<Vec<f32>>,
    face_results: &mut [FaceResult],
) -> MlResult<()> {
    if aligned_faces.is_empty() {
        return Ok(());
    }
    if aligned_faces.len() != face_results.len() {
        return Err(MlError::Postprocess(format!(
            "aligned faces count ({}) does not match face result count ({})",
            aligned_faces.len(),
            face_results.len()
        )));
    }

    let expected_input_len = (FACE_INPUT_WIDTH * FACE_INPUT_HEIGHT * FACE_INPUT_CHANNELS) as usize;
    let mut face_embedding = runtime.face_embedding_session()?;
    for (aligned, face_result) in aligned_faces.into_iter().zip(face_results.iter_mut()) {
        if aligned.len() != expected_input_len {
            return Err(MlError::Preprocess(format!(
                "aligned face tensor length {} does not match expected {}",
                aligned.len(),
                expected_input_len
            )));
        }

        let (shape, mut embedding) = onnx::run_f32(
            &mut face_embedding,
            aligned,
            [1, FACE_INPUT_HEIGHT, FACE_INPUT_WIDTH, FACE_INPUT_CHANNELS],
        )?;
        if shape.first() != Some(&1) || embedding.is_empty() {
            return Err(MlError::Postprocess(format!(
                "invalid single-face embedding tensor shape {:?} for data length {}",
                shape,
                embedding.len()
            )));
        }
        normalize_embedding(&mut embedding);
        face_result.embedding = embedding;
    }

    Ok(())
}

fn normalize_embedding(embedding: &mut [f32]) {
    let mut norm = 0.0f32;
    for value in embedding.iter() {
        norm += value * value;
    }
    let norm = norm.sqrt();
    if norm <= f32::EPSILON {
        return;
    }
    for value in embedding.iter_mut() {
        *value /= norm;
    }
}
