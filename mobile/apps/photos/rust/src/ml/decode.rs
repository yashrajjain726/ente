use std::{io::Cursor, path::Path};

use exif::{In, Reader as ExifReader, Tag};
use image::{DynamicImage, ImageReader, RgbImage};

use crate::ml::{
    error::{MlError, MlResult},
    types::{DecodedImage, Dimensions},
};

const HEIF_EXTENSIONS: [&str; 2] = ["heic", "heif"];

pub fn decode_image_from_path(image_path: &str) -> MlResult<DecodedImage> {
    let image_path_obj = Path::new(image_path);
    let ext = image_path_obj
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let file_bytes = std::fs::read(image_path)
        .map_err(|e| MlError::Decode(format!("failed to read image file '{image_path}': {e}")))?;
    let exif_orientation = read_exif_orientation(&file_bytes);

    if HEIF_EXTENSIONS.contains(&ext.as_str()) {
        return Err(MlError::Decode(
            "HEIC/HEIF decoding is currently unsupported in Rust indexing".to_string(),
        ));
    }

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
    let reader = ImageReader::new(Cursor::new(file_bytes))
        .with_guessed_format()
        .map_err(|e| MlError::Decode(format!("failed to guess image format: {e}")))?;
    let dynamic = reader.decode()?;
    Ok(dynamic.to_rgb8())
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
