use std::{io::Cursor, sync::Once};

use exif::{In, Reader as ExifReader, Tag};
use image::{DynamicImage, ImageReader, RgbImage};
use libheic_rs::{
    DecodeGuardrails, image_integration::register_image_decoder_hooks_with_guardrails,
};

use crate::ml::{
    error::{MlError, MlResult},
    types::{DecodedImage, Dimensions},
};

static IMAGE_DECODER_HOOKS_INIT: Once = Once::new();

pub fn decode_image_from_path(image_path: &str) -> MlResult<DecodedImage> {
    let file_bytes = std::fs::read(image_path)
        .map_err(|e| MlError::Decode(format!("failed to read image file '{image_path}': {e}")))?;
    let exif_orientation = read_exif_orientation(&file_bytes);

    let decoded_rgb = decode_with_image_crate(&file_bytes)?;
    let oriented =
        apply_exif_orientation(DynamicImage::ImageRgb8(decoded_rgb), exif_orientation).to_rgb8();

    Ok(DecodedImage {
        dimensions: Dimensions {
            width: oriented.width(),
            height: oriented.height(),
        },
        rgb: oriented.into_raw(),
    })
}

fn decode_with_image_crate(file_bytes: &[u8]) -> MlResult<RgbImage> {
    init_image_decoders();

    let reader = ImageReader::new(Cursor::new(file_bytes))
        .with_guessed_format()
        .map_err(|e| MlError::Decode(format!("failed to guess image format: {e}")))?;
    let dynamic = reader.decode()?;
    Ok(dynamic.to_rgb8())
}

fn init_image_decoders() {
    IMAGE_DECODER_HOOKS_INIT.call_once(|| {
        let registration = register_image_decoder_hooks_with_guardrails(DecodeGuardrails {
            max_input_bytes: Some(128 * 1024 * 1024),
            max_pixels: Some(256_000_000),
            max_temp_spool_bytes: Some(256 * 1024 * 1024),
            temp_spool_directory: None,
        });

        debug_assert!(
            registration.any_decoder_hook_registered(),
            "failed to register any libheic-rs image decoder hooks"
        );
    });
}

fn read_exif_orientation(image_data: &[u8]) -> u32 {
    let mut reader = Cursor::new(image_data);
    let exif_reader = ExifReader::new();
    let exif = exif_reader.read_from_container(&mut reader);
    exif.ok()
        .and_then(|data| {
            data.get_field(Tag::Orientation, In::PRIMARY)
                .and_then(|field| field.value.get_uint(0))
        })
        .unwrap_or(1)
}

fn apply_exif_orientation(image: DynamicImage, orientation: u32) -> DynamicImage {
    match orientation {
        2 => image.fliph(),
        3 => image.rotate180(),
        4 => image.flipv(),
        5 => image.fliph().rotate270(),
        6 => image.rotate90(),
        7 => image.fliph().rotate90(),
        8 => image.rotate270(),
        _ => image,
    }
}
