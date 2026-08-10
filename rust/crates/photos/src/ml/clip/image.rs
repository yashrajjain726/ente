use crate::ml::{
    error::MlResult,
    onnx, preprocess,
    runtime::MlRuntimeView,
    types::{ClipResult, DecodedImage},
};

use super::{CLIP_IMAGE_INPUT_SIZE, finish_embedding};

pub(crate) fn run_clip_image(
    runtime: &MlRuntimeView<'_>,
    decoded: &DecodedImage,
) -> MlResult<ClipResult> {
    let input = onnx::PreparedF32Input::new(preprocess::preprocess_clip(decoded)?);
    let (shape, output) = runtime.with_clip_image_session(|session| {
        onnx::run_f32(
            session,
            &input,
            [
                1,
                3,
                CLIP_IMAGE_INPUT_SIZE as i64,
                CLIP_IMAGE_INPUT_SIZE as i64,
            ],
        )
    })?;

    finish_embedding("CLIP", shape, output)
}
