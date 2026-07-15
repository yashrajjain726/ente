use fast_image_resize::{
    FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer,
    images::{CroppedImage, Image as FirImage, ImageRef as FirImageRef},
};

use crate::ml::{
    error::{MlError, MlResult},
    types::DecodedImage,
};

const PET_EMBED_INPUT_SIZE: usize = 224;

// ImageNet normalization constants
const IMAGENET_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const IMAGENET_STD: [f32; 3] = [0.229, 0.224, 0.225];

#[derive(Clone, Copy)]
pub(super) struct PixelCrop {
    pub(super) x: u32,
    pub(super) y: u32,
    pub(super) width: u32,
    pub(super) height: u32,
}

/// Preprocess a cropped pet face/body image for embedding extraction.
///
/// Steps:
///   1. Resize to 224x224 using bilinear interpolation
///   2. Normalize using ImageNet mean/std
///   3. Output CHW layout as float32
///
/// This mirrors the Python pipeline's preprocessing:
/// ```python
/// img = cv2.resize(crop, (224, 224))
/// img = img / 255.0
/// img = (img - IMAGENET_MEAN) / IMAGENET_STD
/// img = img.transpose(2, 0, 1)  # HWC -> CHW
/// ```
pub fn preprocess_pet_embedding(decoded: &DecodedImage, box_xyxy: &[f32; 4]) -> MlResult<Vec<f32>> {
    let crop = relative_crop(decoded, box_xyxy)?;
    let resized = resize_rgb_crop(
        &decoded.rgb,
        decoded.dimensions.width,
        decoded.dimensions.height,
        crop,
        PET_EMBED_INPUT_SIZE as u32,
    )?;
    let pixel_count = PET_EMBED_INPUT_SIZE * PET_EMBED_INPUT_SIZE;
    let mut output = vec![0.0f32; 3 * pixel_count];

    // CHW layout with ImageNet normalization
    let r_offset = 0;
    let g_offset = pixel_count;
    let b_offset = 2 * pixel_count;

    for y in 0..PET_EMBED_INPUT_SIZE {
        for x in 0..PET_EMBED_INPUT_SIZE {
            let src_idx = (y * PET_EMBED_INPUT_SIZE + x) * 3;
            let dst_idx = y * PET_EMBED_INPUT_SIZE + x;

            let r = resized[src_idx] as f32 / 255.0;
            let g = resized[src_idx + 1] as f32 / 255.0;
            let b = resized[src_idx + 2] as f32 / 255.0;

            output[r_offset + dst_idx] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
            output[g_offset + dst_idx] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
            output[b_offset + dst_idx] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
        }
    }

    Ok(output)
}

fn relative_crop(decoded: &DecodedImage, box_xyxy: &[f32; 4]) -> MlResult<PixelCrop> {
    let img_w = decoded.dimensions.width;
    let img_h = decoded.dimensions.height;

    let max_x = if img_w > 0 { img_w - 1 } else { 0 };
    let max_y = if img_h > 0 { img_h - 1 } else { 0 };
    let x1 = (box_xyxy[0] * img_w as f32)
        .round()
        .clamp(0.0, max_x as f32) as u32;
    let y1 = (box_xyxy[1] * img_h as f32)
        .round()
        .clamp(0.0, max_y as f32) as u32;
    let x2 = (box_xyxy[2] * img_w as f32)
        .round()
        .clamp(0.0, img_w as f32) as u32;
    let y2 = (box_xyxy[3] * img_h as f32)
        .round()
        .clamp(0.0, img_h as f32) as u32;

    let width = x2.saturating_sub(x1);
    let height = y2.saturating_sub(y1);

    if width == 0 || height == 0 {
        return Err(MlError::Preprocess("crop region has zero area".to_string()));
    }

    Ok(PixelCrop {
        x: x1,
        y: y1,
        width,
        height,
    })
}

/// Resize a rectangular view of an RGB buffer without materializing the crop.
pub(super) fn resize_rgb_crop(
    rgb: &[u8],
    source_width: u32,
    source_height: u32,
    crop: PixelCrop,
    output_size: u32,
) -> MlResult<Vec<u8>> {
    if crop.width == 0 || crop.height == 0 {
        return Err(MlError::Preprocess(
            "crop dimensions cannot be zero".to_string(),
        ));
    }
    if crop.x > source_width.saturating_sub(crop.width)
        || crop.y > source_height.saturating_sub(crop.height)
    {
        return Err(MlError::Preprocess(
            "crop region extends beyond source image".to_string(),
        ));
    }

    let source = FirImageRef::new(source_width, source_height, rgb, PixelType::U8x3)
        .map_err(|e| MlError::Preprocess(format!("failed to create FIR source image: {e}")))?;
    let source = CroppedImage::new(&source, crop.x, crop.y, crop.width, crop.height)
        .map_err(|e| MlError::Preprocess(format!("failed to create FIR crop view: {e}")))?;
    let mut resized = FirImage::new(output_size, output_size, PixelType::U8x3);
    let options = ResizeOptions::new().resize_alg(ResizeAlg::Interpolation(FilterType::Bilinear));
    Resizer::new()
        .resize(&source, &mut resized, Some(&options))
        .map_err(|e| MlError::Preprocess(format!("failed to resize RGB crop: {e}")))?;

    Ok(resized.into_vec())
}

#[cfg(test)]
mod tests {
    use super::{PixelCrop, resize_rgb_crop};

    #[test]
    fn cropped_view_resize_matches_a_materialized_crop() {
        let width = 6u32;
        let height = 5u32;
        let rgb = (0..(width * height * 3))
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        let crop = PixelCrop {
            x: 1,
            y: 1,
            width: 4,
            height: 3,
        };

        let direct = resize_rgb_crop(&rgb, width, height, crop, 7).unwrap();

        let mut materialized = Vec::new();
        for row in crop.y..crop.y + crop.height {
            let start = ((row * width + crop.x) * 3) as usize;
            let end = start + (crop.width * 3) as usize;
            materialized.extend_from_slice(&rgb[start..end]);
        }
        let baseline = resize_rgb_crop(
            &materialized,
            crop.width,
            crop.height,
            PixelCrop {
                x: 0,
                y: 0,
                width: crop.width,
                height: crop.height,
            },
            7,
        )
        .unwrap();

        assert_eq!(direct, baseline);
    }
}
