use std::{
    fs::File,
    io::{BufRead, BufReader, Cursor},
};

use image::{DynamicImage, imageops::FilterType};

use crate::{
    DecodedImage, Dimensions, ImageError, ImageResult,
    decode::{decode_image_from_bytes, decode_image_from_path},
};

pub enum ImageInput<'a> {
    Path(&'a str),
    Bytes(&'a [u8]),
}

#[derive(Clone, Debug)]
pub struct BoundedDecodedImage {
    pub image: DecodedImage,
    pub original_dimensions: Dimensions,
}

pub fn decode_bounded(input: ImageInput<'_>, max_side: u32) -> ImageResult<BoundedDecodedImage> {
    if max_side == 0 {
        return Err(ImageError::Postprocess(
            "maximum side must be greater than zero".into(),
        ));
    }
    let decoded = match input {
        ImageInput::Path(path) => {
            let file = File::open(path).map_err(|error| {
                ImageError::Decode(format!("failed to open image file '{path}': {error}"))
            })?;
            let mut reader = BufReader::new(file);
            let header = reader
                .fill_buf()
                .map_err(|error| ImageError::Decode(error.to_string()))?;
            if header.starts_with(crate::png::SIGNATURE) {
                return crate::png::decode(reader, max_side);
            }
            decode_image_from_path(path)?
        }
        ImageInput::Bytes(bytes) => {
            if bytes.starts_with(crate::png::SIGNATURE) {
                return crate::png::decode(Cursor::new(bytes), max_side);
            }
            decode_image_from_bytes(bytes)?
        }
    };
    let original_dimensions = decoded.dimensions.clone();
    let dimensions = target_dimensions(&original_dimensions, max_side);
    if dimensions == original_dimensions {
        return Ok(BoundedDecodedImage {
            image: decoded,
            original_dimensions,
        });
    }
    let source = image::RgbImage::from_raw(
        original_dimensions.width,
        original_dimensions.height,
        decoded.rgb,
    )
    .ok_or_else(|| ImageError::Postprocess("invalid decoded RGB buffer".into()))?;
    let resized = DynamicImage::ImageRgb8(source)
        .resize_exact(dimensions.width, dimensions.height, FilterType::Triangle)
        .into_rgb8();
    Ok(BoundedDecodedImage {
        image: DecodedImage {
            dimensions,
            rgb: resized.into_raw(),
        },
        original_dimensions,
    })
}

pub(crate) fn target_dimensions(source: &Dimensions, max_side: u32) -> Dimensions {
    let longest = source.width.max(source.height);
    if longest <= max_side {
        return source.clone();
    }
    let scale = |side| ((u64::from(side) * u64::from(max_side)) / u64::from(longest)).max(1) as u32;
    Dimensions {
        width: scale(source.width),
        height: scale(source.height),
    }
}
