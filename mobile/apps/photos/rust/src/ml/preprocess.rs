use fast_image_resize::{
    FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer, images::Image as FirImage,
};

use crate::ml::{
    error::{MlError, MlResult},
    types::DecodedImage,
};

const YOLO_INPUT_WIDTH: usize = 640;
const YOLO_INPUT_HEIGHT: usize = 640;
const CLIP_INPUT_WIDTH: usize = 256;
const CLIP_INPUT_HEIGHT: usize = 256;
const PAD_VALUE: f32 = 114.0;

pub fn preprocess_yolo(decoded: &DecodedImage) -> MlResult<(Vec<f32>, usize, usize)> {
    if decoded.dimensions.width == 0 || decoded.dimensions.height == 0 {
        return Err(MlError::Preprocess(
            "image dimensions cannot be zero".to_string(),
        ));
    }

    let src_w = decoded.dimensions.width as f32;
    let src_h = decoded.dimensions.height as f32;
    let scale = (YOLO_INPUT_WIDTH as f32 / src_w).min(YOLO_INPUT_HEIGHT as f32 / src_h);
    let scaled_width = (src_w * scale).round().clamp(0.0, YOLO_INPUT_WIDTH as f32) as usize;
    let scaled_height = (src_h * scale).round().clamp(0.0, YOLO_INPUT_HEIGHT as f32) as usize;

    let mut output = vec![0f32; 3 * YOLO_INPUT_WIDTH * YOLO_INPUT_HEIGHT];
    let green_offset = YOLO_INPUT_WIDTH * YOLO_INPUT_HEIGHT;
    let blue_offset = 2 * YOLO_INPUT_WIDTH * YOLO_INPUT_HEIGHT;

    for y in 0..YOLO_INPUT_HEIGHT {
        for x in 0..YOLO_INPUT_WIDTH {
            let idx = y * YOLO_INPUT_WIDTH + x;
            let rgb = if x >= scaled_width || y >= scaled_height {
                [PAD_VALUE, PAD_VALUE, PAD_VALUE]
            } else {
                sample_bilinear_rgb(decoded, x as f32 / scale, y as f32 / scale)
            };
            output[idx] = rgb[0] / 255.0;
            output[idx + green_offset] = rgb[1] / 255.0;
            output[idx + blue_offset] = rgb[2] / 255.0;
        }
    }

    Ok((output, scaled_width, scaled_height))
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

    let src_image = FirImage::from_vec_u8(
        decoded.dimensions.width,
        decoded.dimensions.height,
        decoded.rgb.clone(),
        PixelType::U8x3,
    )
    .map_err(|e| MlError::Preprocess(format!("failed to create FIR source image: {e}")))?;

    let mut resized_image = FirImage::new(scaled_width, scaled_height, PixelType::U8x3);
    let mut resizer = Resizer::new();
    let options = ResizeOptions::new().resize_alg(ResizeAlg::Convolution(FilterType::Bilinear));
    resizer
        .resize(&src_image, &mut resized_image, Some(&options))
        .map_err(|e| MlError::Preprocess(format!("failed to resize CLIP image input: {e}")))?;

    let resized = resized_image.buffer();
    let start_x = ((scaled_width as i32 - CLIP_INPUT_WIDTH as i32) / 2).max(0) as usize;
    let start_y = ((scaled_height as i32 - CLIP_INPUT_HEIGHT as i32) / 2).max(0) as usize;
    let scaled_width_usize = scaled_width as usize;

    let mut output = vec![0f32; 3 * CLIP_INPUT_WIDTH * CLIP_INPUT_HEIGHT];
    let green_offset = CLIP_INPUT_WIDTH * CLIP_INPUT_HEIGHT;
    let blue_offset = 2 * CLIP_INPUT_WIDTH * CLIP_INPUT_HEIGHT;

    for y in 0..CLIP_INPUT_HEIGHT {
        for x in 0..CLIP_INPUT_WIDTH {
            let src_x = start_x + x;
            let src_y = start_y + y;
            let src_idx = (src_y * scaled_width_usize + src_x) * 3;
            let dst_idx = y * CLIP_INPUT_WIDTH + x;
            output[dst_idx] = resized[src_idx] as f32 / 255.0;
            output[dst_idx + green_offset] = resized[src_idx + 1] as f32 / 255.0;
            output[dst_idx + blue_offset] = resized[src_idx + 2] as f32 / 255.0;
        }
    }

    Ok(output)
}

pub fn sample_bilinear_rgb(decoded: &DecodedImage, fx: f32, fy: f32) -> [f32; 3] {
    let max_x = (decoded.dimensions.width.saturating_sub(1)) as f32;
    let max_y = (decoded.dimensions.height.saturating_sub(1)) as f32;
    let fx = fx.clamp(0.0, max_x);
    let fy = fy.clamp(0.0, max_y);

    let x0 = fx.floor() as i32;
    let x1 = fx.ceil() as i32;
    let y0 = fy.floor() as i32;
    let y1 = fy.ceil() as i32;
    let dx = fx - x0 as f32;
    let dy = fy - y0 as f32;
    let dx1 = 1.0 - dx;
    let dy1 = 1.0 - dy;

    let p1 = read_rgb(decoded, x0, y0);
    let p2 = read_rgb(decoded, x1, y0);
    let p3 = read_rgb(decoded, x0, y1);
    let p4 = read_rgb(decoded, x1, y1);

    let blend = |v1: f32, v2: f32, v3: f32, v4: f32| -> f32 {
        v1 * dx1 * dy1 + v2 * dx * dy1 + v3 * dx1 * dy + v4 * dx * dy
    };

    [
        blend(p1[0], p2[0], p3[0], p4[0]),
        blend(p1[1], p2[1], p3[1], p4[1]),
        blend(p1[2], p2[2], p3[2], p4[2]),
    ]
}

pub fn read_rgb(decoded: &DecodedImage, x: i32, y: i32) -> [f32; 3] {
    let width = decoded.dimensions.width as i32;
    let height = decoded.dimensions.height as i32;
    if x < 0 || y < 0 || x >= width || y >= height {
        return [PAD_VALUE, PAD_VALUE, PAD_VALUE];
    }

    let idx = ((y as usize * decoded.dimensions.width as usize) + x as usize) * 3;
    [
        decoded.rgb[idx] as f32,
        decoded.rgb[idx + 1] as f32,
        decoded.rgb[idx + 2] as f32,
    ]
}
