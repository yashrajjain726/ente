use fast_image_resize::{
    FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer,
    images::{Image as FirImage, ImageRef as FirImageRef},
};

use crate::ml::{
    error::{MlError, MlResult},
    onnx::PreparedF32Input,
    types::DecodedImage,
};

const YOLO_INPUT_WIDTH: usize = 640;
const YOLO_INPUT_HEIGHT: usize = 640;
const CLIP_INPUT_WIDTH: usize = 256;
const CLIP_INPUT_HEIGHT: usize = 256;
const PAD_VALUE: f32 = 114.0;

pub(crate) struct YoloInput {
    pub(crate) tensor: PreparedF32Input,
    pub(crate) scaled_width: usize,
    pub(crate) scaled_height: usize,
    pub(crate) pad_left: usize,
    pub(crate) pad_top: usize,
}

pub(crate) fn preprocess_yolo(decoded: &DecodedImage) -> MlResult<YoloInput> {
    if decoded.dimensions.width == 0 || decoded.dimensions.height == 0 {
        return Err(MlError::Preprocess(
            "image dimensions cannot be zero".to_string(),
        ));
    }

    let src_w = decoded.dimensions.width as f32;
    let src_h = decoded.dimensions.height as f32;
    let scale = (YOLO_INPUT_WIDTH as f32 / src_w).min(YOLO_INPUT_HEIGHT as f32 / src_h);
    let scaled_width = (src_w * scale).round().clamp(1.0, YOLO_INPUT_WIDTH as f32) as u32;
    let scaled_height = (src_h * scale).round().clamp(1.0, YOLO_INPUT_HEIGHT as f32) as u32;

    let src_image = FirImageRef::new(
        decoded.dimensions.width,
        decoded.dimensions.height,
        decoded.rgb.as_slice(),
        PixelType::U8x3,
    )
    .map_err(|e| MlError::Preprocess(format!("failed to create FIR source image: {e}")))?;

    let mut resized_image = FirImage::new(scaled_width, scaled_height, PixelType::U8x3);
    let mut resizer = Resizer::new();
    let options = ResizeOptions::new().resize_alg(ResizeAlg::Interpolation(FilterType::Bilinear));
    resizer
        .resize(&src_image, &mut resized_image, Some(&options))
        .map_err(|e| MlError::Preprocess(format!("failed to resize YOLO image input: {e}")))?;

    let scaled_width_usize = scaled_width as usize;
    let scaled_height_usize = scaled_height as usize;
    let pad_left = (YOLO_INPUT_WIDTH.saturating_sub(scaled_width_usize)) / 2;
    let pad_top = (YOLO_INPUT_HEIGHT.saturating_sub(scaled_height_usize)) / 2;

    let pad_norm = PAD_VALUE / 255.0;
    let mut output = vec![pad_norm; 3 * YOLO_INPUT_WIDTH * YOLO_INPUT_HEIGHT];
    let green_offset = YOLO_INPUT_WIDTH * YOLO_INPUT_HEIGHT;
    let blue_offset = 2 * YOLO_INPUT_WIDTH * YOLO_INPUT_HEIGHT;
    let resized = resized_image.buffer();

    for y in 0..scaled_height_usize {
        for x in 0..scaled_width_usize {
            let src_idx = (y * scaled_width_usize + x) * 3;
            let dst_x = x + pad_left;
            let dst_y = y + pad_top;
            let dst_idx = dst_y * YOLO_INPUT_WIDTH + dst_x;

            output[dst_idx] = resized[src_idx] as f32 / 255.0;
            output[dst_idx + green_offset] = resized[src_idx + 1] as f32 / 255.0;
            output[dst_idx + blue_offset] = resized[src_idx + 2] as f32 / 255.0;
        }
    }

    Ok(YoloInput {
        tensor: PreparedF32Input::new(output),
        scaled_width: scaled_width_usize,
        scaled_height: scaled_height_usize,
        pad_left,
        pad_top,
    })
}

pub fn preprocess_clip(decoded: &DecodedImage) -> MlResult<Vec<f32>> {
    if decoded.dimensions.width == 0 || decoded.dimensions.height == 0 {
        return Err(MlError::Preprocess(
            "image dimensions cannot be zero".to_string(),
        ));
    }

    let src_w = decoded.dimensions.width as f32;
    let src_h = decoded.dimensions.height as f32;
    let scale = (CLIP_INPUT_WIDTH as f32 / src_w).max(CLIP_INPUT_HEIGHT as f32 / src_h);
    let scaled_width = (src_w * scale).round().max(CLIP_INPUT_WIDTH as f32) as u32;
    let scaled_height = (src_h * scale).round().max(CLIP_INPUT_HEIGHT as f32) as u32;

    let src_image = FirImageRef::new(
        decoded.dimensions.width,
        decoded.dimensions.height,
        decoded.rgb.as_slice(),
        PixelType::U8x3,
    )
    .map_err(|e| MlError::Preprocess(format!("failed to create FIR source image: {e}")))?;

    let start_x = (scaled_width.saturating_sub(CLIP_INPUT_WIDTH as u32) / 2) as f64;
    let start_y = (scaled_height.saturating_sub(CLIP_INPUT_HEIGHT as u32) / 2) as f64;
    let horizontal_scale = decoded.dimensions.width as f64 / scaled_width as f64;
    let vertical_scale = decoded.dimensions.height as f64 / scaled_height as f64;
    let crop_left = start_x * horizontal_scale;
    let crop_top = start_y * vertical_scale;
    let crop_width = CLIP_INPUT_WIDTH as f64 * horizontal_scale;
    let crop_height = CLIP_INPUT_HEIGHT as f64 * vertical_scale;

    let mut resized_image = FirImage::new(
        CLIP_INPUT_WIDTH as u32,
        CLIP_INPUT_HEIGHT as u32,
        PixelType::U8x3,
    );
    let mut resizer = Resizer::new();
    let options = ResizeOptions::new()
        .resize_alg(ResizeAlg::Convolution(FilterType::Bilinear))
        .crop(crop_left, crop_top, crop_width, crop_height);
    resizer
        .resize(&src_image, &mut resized_image, Some(&options))
        .map_err(|e| MlError::Preprocess(format!("failed to resize CLIP image input: {e}")))?;

    let resized = resized_image.buffer();

    let mut output = vec![0f32; 3 * CLIP_INPUT_WIDTH * CLIP_INPUT_HEIGHT];
    let green_offset = CLIP_INPUT_WIDTH * CLIP_INPUT_HEIGHT;
    let blue_offset = 2 * CLIP_INPUT_WIDTH * CLIP_INPUT_HEIGHT;

    for y in 0..CLIP_INPUT_HEIGHT {
        for x in 0..CLIP_INPUT_WIDTH {
            let src_idx = (y * CLIP_INPUT_WIDTH + x) * 3;
            let dst_idx = y * CLIP_INPUT_WIDTH + x;
            output[dst_idx] = resized[src_idx] as f32 / 255.0;
            output[dst_idx + green_offset] = resized[src_idx + 1] as f32 / 255.0;
            output[dst_idx + blue_offset] = resized[src_idx + 2] as f32 / 255.0;
        }
    }

    Ok(output)
}

#[cfg(test)]
mod tests {
    use fast_image_resize::{
        FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer,
        images::{Image as FirImage, ImageRef as FirImageRef},
    };

    use super::{CLIP_INPUT_HEIGHT, CLIP_INPUT_WIDTH, preprocess_clip};
    use crate::ml::{
        error::{MlError, MlResult},
        types::{DecodedImage, Dimensions},
    };

    #[test]
    fn direct_clip_crop_matches_resize_then_crop() {
        for (width, height) in [
            (256, 256),
            (257, 257),
            (101, 17),
            (17, 101),
            (513, 257),
            (257, 513),
            (403, 301),
            (301, 403),
        ] {
            let decoded = test_image(width, height);
            assert_eq!(
                preprocess_clip(&decoded).unwrap(),
                legacy_preprocess_clip(&decoded).unwrap(),
                "CLIP preprocessing changed for {width}x{height}"
            );
        }
    }

    fn test_image(width: u32, height: u32) -> DecodedImage {
        let mut rgb = Vec::with_capacity(width as usize * height as usize * 3);
        for y in 0..height {
            for x in 0..width {
                rgb.push(((x * 17 + y * 29) % 256) as u8);
                rgb.push(((x * 47 + y * 11 + 31) % 256) as u8);
                rgb.push(((x * 7 + y * 53 + 97) % 256) as u8);
            }
        }
        DecodedImage {
            dimensions: Dimensions { width, height },
            rgb,
        }
    }

    fn legacy_preprocess_clip(decoded: &DecodedImage) -> MlResult<Vec<f32>> {
        let src_w = decoded.dimensions.width as f32;
        let src_h = decoded.dimensions.height as f32;
        let scale = (CLIP_INPUT_WIDTH as f32 / src_w).max(CLIP_INPUT_HEIGHT as f32 / src_h);
        let scaled_width = (src_w * scale).round().max(CLIP_INPUT_WIDTH as f32) as u32;
        let scaled_height = (src_h * scale).round().max(CLIP_INPUT_HEIGHT as f32) as u32;
        let source = FirImageRef::new(
            decoded.dimensions.width,
            decoded.dimensions.height,
            &decoded.rgb,
            PixelType::U8x3,
        )
        .map_err(|error| MlError::Preprocess(error.to_string()))?;
        let mut resized = FirImage::new(scaled_width, scaled_height, PixelType::U8x3);
        let options = ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Bilinear));
        Resizer::new()
            .resize(&source, &mut resized, Some(&options))
            .map_err(|error| MlError::Preprocess(error.to_string()))?;

        let start_x = (scaled_width as usize - CLIP_INPUT_WIDTH) / 2;
        let start_y = (scaled_height as usize - CLIP_INPUT_HEIGHT) / 2;
        let pixel_count = CLIP_INPUT_WIDTH * CLIP_INPUT_HEIGHT;
        let mut output = vec![0.0; 3 * pixel_count];
        for y in 0..CLIP_INPUT_HEIGHT {
            for x in 0..CLIP_INPUT_WIDTH {
                let source = ((start_y + y) * scaled_width as usize + start_x + x) * 3;
                let destination = y * CLIP_INPUT_WIDTH + x;
                output[destination] = resized.buffer()[source] as f32 / 255.0;
                output[pixel_count + destination] = resized.buffer()[source + 1] as f32 / 255.0;
                output[2 * pixel_count + destination] = resized.buffer()[source + 2] as f32 / 255.0;
            }
        }
        Ok(output)
    }
}
