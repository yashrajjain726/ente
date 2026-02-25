use std::{ffi::OsStr, io::Cursor, sync::Once};

use exif::{In, Reader as ExifReader, Tag};
use image::{DynamicImage, ImageReader, RgbImage, hooks::decoding_hook_registered};
use libheic_rs::{
    DecodeGuardrails,
    image_integration::register_image_decoder_hooks_with_guardrails,
    isobmff::{PrimaryItemTransformProperty, parse_primary_item_transform_properties},
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
    let should_apply_exif_orientation =
        should_apply_exif_orientation(&file_bytes, exif_orientation);

    let decoded_rgb = decode_with_image_crate(&file_bytes)?;
    let decoded_dynamic = DynamicImage::ImageRgb8(decoded_rgb);
    let oriented = if should_apply_exif_orientation {
        apply_exif_orientation(decoded_dynamic, exif_orientation)
    } else {
        decoded_dynamic
    }
    .to_rgb8();

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

        let heic_hook_active = decoding_hook_registered(OsStr::new("heic"));
        let heif_hook_active = decoding_hook_registered(OsStr::new("heif"));
        let avif_hook_active = decoding_hook_registered(OsStr::new("avif"));
        let has_heif_family_support = heic_hook_active || heif_hook_active;

        if !has_heif_family_support {
            eprintln!(
                "[ml][decode] failed to activate HEIF/HEIC decoder hooks; registration_result=(heic:{}, heif:{}, avif:{}), active_hooks=(heic:{}, heif:{}, avif:{})",
                registration.heic_decoder_hook_registered,
                registration.heif_decoder_hook_registered,
                registration.avif_decoder_hook_registered,
                heic_hook_active,
                heif_hook_active,
                avif_hook_active,
            );
        } else if !registration.all_decoder_hooks_registered() {
            eprintln!(
                "[ml][decode] libheic-rs decoder hooks only partially registered (usually because another initializer registered first); registration_result=(heic:{}, heif:{}, avif:{}), active_hooks=(heic:{}, heif:{}, avif:{})",
                registration.heic_decoder_hook_registered,
                registration.heif_decoder_hook_registered,
                registration.avif_decoder_hook_registered,
                heic_hook_active,
                heif_hook_active,
                avif_hook_active,
            );
        }

        debug_assert!(
            heic_hook_active || heif_hook_active || avif_hook_active,
            "no libheic-rs image decoder hooks are active"
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

fn should_apply_exif_orientation(image_data: &[u8], exif_orientation: u32) -> bool {
    if exif_orientation == 1 {
        return false;
    }

    // HEIF decode already applies primary transforms (irot/imir). Applying Exif orientation again
    // can double-rotate mirrored/rotated files.
    !heif_primary_transforms_include_orientation(image_data)
}

fn heif_primary_transforms_include_orientation(image_data: &[u8]) -> bool {
    let Ok(primary_transforms) = parse_primary_item_transform_properties(image_data) else {
        return false;
    };

    primary_transforms.transforms.iter().any(|transform| {
        matches!(
            transform,
            PrimaryItemTransformProperty::Rotation(rotation)
                if rotation.rotation_ccw_degrees % 360 != 0
        ) || matches!(transform, PrimaryItemTransformProperty::Mirror(_))
    })
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
