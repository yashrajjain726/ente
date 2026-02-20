use std::{io::Cursor, path::Path};

use exif::{In, Reader as ExifReader, Tag};
use image::{DynamicImage, RgbImage};

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

    let decoded_rgb = if HEIF_EXTENSIONS.contains(&ext.as_str()) {
        decode_heif_from_path(image_path)?
    } else {
        image::load_from_memory(&file_bytes)?.to_rgb8()
    };
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

#[cfg(feature = "heif")]
fn decode_heif_from_path(image_path: &str) -> MlResult<RgbImage> {
    use image::{ImageBuffer, Rgb};
    use libheif_rs::{ColorSpace, HeifContext, LibHeif, RgbChroma};

    let context = HeifContext::read_from_file(image_path)
        .map_err(|e| MlError::Decode(format!("failed to open HEIF file '{image_path}': {e}")))?;
    let handle = context
        .primary_image_handle()
        .map_err(|e| MlError::Decode(format!("failed to read HEIF primary handle: {e}")))?;
    let decoder = LibHeif::new();
    let image = decoder
        .decode(&handle, ColorSpace::Rgb(RgbChroma::Rgb), None)
        .map_err(|e| MlError::Decode(format!("failed to decode HEIF image: {e}")))?;

    let width = image.width();
    let height = image.height();
    let plane = image
        .planes()
        .interleaved
        .ok_or_else(|| MlError::Decode("HEIF image has no interleaved RGB plane".to_string()))?;

    let row_stride = plane.stride;
    let row_width = width as usize * 3;
    let mut rgb = vec![0u8; width as usize * height as usize * 3];
    for y in 0..height as usize {
        let src_start = y * row_stride;
        let src_end = src_start + row_width;
        let dst_start = y * row_width;
        rgb[dst_start..(dst_start + row_width)].copy_from_slice(&plane.data[src_start..src_end]);
    }

    ImageBuffer::<Rgb<u8>, _>::from_raw(width as u32, height as u32, rgb)
        .ok_or_else(|| MlError::Decode("failed to construct RGB image from HEIF plane".to_string()))
}

#[cfg(not(feature = "heif"))]
fn decode_heif_from_path(image_path: &str) -> MlResult<RgbImage> {
    let _ = image_path;
    Err(MlError::Decode(
        "HEIF decoding is unavailable because the `heif` cargo feature is disabled".to_string(),
    ))
}
