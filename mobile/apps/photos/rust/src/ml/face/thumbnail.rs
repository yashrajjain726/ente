use image::{ColorType, ImageBuffer, ImageEncoder, Rgb, RgbImage, codecs::png::PngEncoder};

use crate::ml::{
    error::{MlError, MlResult},
    types::DecodedImage,
};

const REGULAR_PADDING: f64 = 0.4;
const MINIMUM_PADDING: f64 = 0.1;

#[derive(Clone, Debug)]
pub struct FaceBox {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Clone, Debug)]
struct CropRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    output_width: u32,
    output_height: u32,
}

pub fn generate_face_thumbnails(
    decoded: &DecodedImage,
    face_boxes: &[FaceBox],
) -> MlResult<Vec<Vec<u8>>> {
    if face_boxes.is_empty() {
        return Ok(Vec::new());
    }
    if decoded.dimensions.width == 0 || decoded.dimensions.height == 0 {
        return Err(MlError::Decode(
            "decoded image dimensions cannot be empty".to_string(),
        ));
    }

    let source = rgb_image_from_decoded(decoded)?;
    let image_width = decoded.dimensions.width as f64;
    let image_height = decoded.dimensions.height as f64;
    let mut results = Vec::with_capacity(face_boxes.len());

    for (index, face_box) in face_boxes.iter().enumerate() {
        let crop = compute_crop_rect(face_box, image_width, image_height).map_err(|e| {
            MlError::InvalidRequest(format!("invalid face box at index {index}: {e}",))
        })?;
        let png_bytes = crop_and_encode_png(&source, &crop)?;
        results.push(png_bytes);
    }

    Ok(results)
}

fn rgb_image_from_decoded(decoded: &DecodedImage) -> MlResult<RgbImage> {
    ImageBuffer::<Rgb<u8>, _>::from_raw(
        decoded.dimensions.width,
        decoded.dimensions.height,
        decoded.rgb.clone(),
    )
    .ok_or_else(|| MlError::Decode("invalid decoded RGB buffer".to_string()))
}

fn compute_crop_rect(
    face_box: &FaceBox,
    image_width: f64,
    image_height: f64,
) -> Result<CropRect, String> {
    if image_width <= 0.0 || image_height <= 0.0 {
        return Err("image dimensions must be positive".to_string());
    }

    let x_min_abs = face_box.x as f64 * image_width;
    let y_min_abs = face_box.y as f64 * image_height;
    let width_abs = face_box.width as f64 * image_width;
    let height_abs = face_box.height as f64 * image_height;

    if width_abs <= 0.0 || height_abs <= 0.0 {
        return Err("face box width/height must map to positive absolute dimensions".to_string());
    }

    let x_crop = x_min_abs - width_abs * REGULAR_PADDING;
    let x_overshoot = x_crop.min(0.0).abs() / width_abs;
    let width_crop = width_abs * (1.0 + 2.0 * REGULAR_PADDING)
        - 2.0 * x_overshoot.min(REGULAR_PADDING - MINIMUM_PADDING) * width_abs;

    let y_crop = y_min_abs - height_abs * REGULAR_PADDING;
    let y_overshoot = y_crop.min(0.0).abs() / height_abs;
    let height_crop = height_abs * (1.0 + 2.0 * REGULAR_PADDING)
        - 2.0 * y_overshoot.min(REGULAR_PADDING - MINIMUM_PADDING) * height_abs;

    let x_crop_safe = x_crop.clamp(0.0, image_width);
    let y_crop_safe = y_crop.clamp(0.0, image_height);
    let width_crop_safe = width_crop.clamp(0.0, (image_width - x_crop_safe).max(0.0));
    let height_crop_safe = height_crop.clamp(0.0, (image_height - y_crop_safe).max(0.0));

    let output_width = float_to_output_dimension(width_crop_safe)
        .ok_or_else(|| format!("invalid output width from crop value {width_crop_safe}"))?;
    let output_height = float_to_output_dimension(height_crop_safe)
        .ok_or_else(|| format!("invalid output height from crop value {height_crop_safe}"))?;

    if output_width == 0 || output_height == 0 {
        return Err(format!(
            "crop dimensions resolve to zero-sized output ({output_width}x{output_height})",
        ));
    }

    Ok(CropRect {
        x: x_crop_safe,
        y: y_crop_safe,
        width: width_crop_safe,
        height: height_crop_safe,
        output_width,
        output_height,
    })
}

fn float_to_output_dimension(value: f64) -> Option<u32> {
    if !value.is_finite() || value < 0.0 {
        return None;
    }
    let truncated = value.trunc();
    if truncated > u32::MAX as f64 {
        return None;
    }
    Some(truncated as u32)
}

fn crop_and_encode_png(source: &RgbImage, crop: &CropRect) -> MlResult<Vec<u8>> {
    let mut cropped = ImageBuffer::<Rgb<u8>, Vec<u8>>::new(crop.output_width, crop.output_height);

    let scale_x = crop.width / f64::from(crop.output_width);
    let scale_y = crop.height / f64::from(crop.output_height);

    for y in 0..crop.output_height {
        for x in 0..crop.output_width {
            let source_x = crop.x + (f64::from(x) + 0.5) * scale_x - 0.5;
            let source_y = crop.y + (f64::from(y) + 0.5) * scale_y - 0.5;
            let rgb = sample_bilinear(source, source_x, source_y);
            cropped.put_pixel(x, y, Rgb(rgb));
        }
    }

    let mut png_bytes = Vec::new();
    PngEncoder::new(&mut png_bytes)
        .write_image(
            cropped.as_raw(),
            crop.output_width,
            crop.output_height,
            ColorType::Rgb8.into(),
        )
        .map_err(|e| MlError::Postprocess(format!("failed to encode PNG thumbnail: {e}")))?;
    Ok(png_bytes)
}

fn sample_bilinear(image: &RgbImage, x: f64, y: f64) -> [u8; 3] {
    let max_x = image.width().saturating_sub(1) as f64;
    let max_y = image.height().saturating_sub(1) as f64;
    let fx = x.clamp(0.0, max_x);
    let fy = y.clamp(0.0, max_y);

    let x0 = fx.floor() as u32;
    let x1 = fx.ceil() as u32;
    let y0 = fy.floor() as u32;
    let y1 = fy.ceil() as u32;

    let dx = fx - f64::from(x0);
    let dy = fy - f64::from(y0);
    let dx1 = 1.0 - dx;
    let dy1 = 1.0 - dy;

    let p1 = image.get_pixel(x0, y0).0;
    let p2 = image.get_pixel(x1, y0).0;
    let p3 = image.get_pixel(x0, y1).0;
    let p4 = image.get_pixel(x1, y1).0;

    let bilinear = |c1: u8, c2: u8, c3: u8, c4: u8| -> u8 {
        let value = f64::from(c1) * dx1 * dy1
            + f64::from(c2) * dx * dy1
            + f64::from(c3) * dx1 * dy
            + f64::from(c4) * dx * dy;
        value.round().clamp(0.0, 255.0) as u8
    };

    [
        bilinear(p1[0], p2[0], p3[0], p4[0]),
        bilinear(p1[1], p2[1], p3[1], p4[1]),
        bilinear(p1[2], p2[2], p3[2], p4[2]),
    ]
}

#[cfg(test)]
mod tests {
    use image::ImageFormat;

    use super::{FaceBox, compute_crop_rect, generate_face_thumbnails};
    use crate::ml::types::{DecodedImage, Dimensions};

    #[test]
    fn compute_crop_rect_matches_canvas_math_for_center_box() {
        let face_box = FaceBox {
            x: 0.25,
            y: 0.25,
            width: 0.5,
            height: 0.5,
        };

        let crop = compute_crop_rect(&face_box, 100.0, 80.0).expect("crop should be valid");

        assert!((crop.x - 5.0).abs() < f64::EPSILON);
        assert!((crop.y - 4.0).abs() < f64::EPSILON);
        assert!((crop.width - 90.0).abs() < f64::EPSILON);
        assert!((crop.height - 72.0).abs() < f64::EPSILON);
        assert_eq!(crop.output_width, 90);
        assert_eq!(crop.output_height, 72);
    }

    #[test]
    fn compute_crop_rect_handles_left_edge_overshoot_like_canvas() {
        let face_box = FaceBox {
            x: 0.0,
            y: 0.2,
            width: 0.2,
            height: 0.2,
        };

        let crop = compute_crop_rect(&face_box, 100.0, 100.0).expect("crop should be valid");

        assert!(crop.x.abs() < 1e-6);
        assert!((crop.width - 24.0).abs() < 1e-5);
        assert_eq!(crop.output_width, 24);
    }

    #[test]
    fn generate_face_thumbnails_returns_png_per_input_face() {
        let decoded = synthetic_decoded_image(16, 16);
        let face_boxes = vec![
            FaceBox {
                x: 0.1,
                y: 0.1,
                width: 0.4,
                height: 0.4,
            },
            FaceBox {
                x: 0.4,
                y: 0.2,
                width: 0.3,
                height: 0.5,
            },
        ];

        let thumbnails =
            generate_face_thumbnails(&decoded, &face_boxes).expect("thumbnails should generate");

        assert_eq!(thumbnails.len(), 2);
        for bytes in thumbnails {
            assert!(!bytes.is_empty());
            let decoded_png = image::load_from_memory_with_format(&bytes, ImageFormat::Png)
                .expect("thumbnail bytes should decode as PNG");
            assert!(decoded_png.width() > 0);
            assert!(decoded_png.height() > 0);
        }
    }

    #[test]
    fn generate_face_thumbnails_fails_for_zero_sized_face_box() {
        let decoded = synthetic_decoded_image(16, 16);
        let face_boxes = vec![FaceBox {
            x: 0.1,
            y: 0.2,
            width: 0.0,
            height: 0.3,
        }];

        let result = generate_face_thumbnails(&decoded, &face_boxes);

        assert!(result.is_err());
    }

    fn synthetic_decoded_image(width: u32, height: u32) -> DecodedImage {
        let mut rgb = Vec::with_capacity((width * height * 3) as usize);
        for y in 0..height {
            for x in 0..width {
                rgb.push((x % 256) as u8);
                rgb.push((y % 256) as u8);
                rgb.push(((x + y) % 256) as u8);
            }
        }
        DecodedImage {
            dimensions: Dimensions { width, height },
            rgb,
        }
    }
}
