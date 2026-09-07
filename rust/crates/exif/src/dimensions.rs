use crate::Rational;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Dimensions {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CleanAperture {
    pub width: Rational,
    pub height: Rational,
    pub horizontal_offset: Rational,
    pub vertical_offset: Rational,
}

/// A primary-image transform. Crops use coordinates after preceding transforms.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transform {
    /// Authoritative orientation using EXIF's 1–8 convention (JPEG XL).
    /// Even 1 (normal) overrides EXIF/XMP orientation.
    Orientation(u8),
    /// Quarter turns counterclockwise (0–3).
    Rotate(u8),
    /// Mirror axis: 0 = vertical axis, 1 = horizontal axis.
    Mirror(u8),
    Crop(CleanAperture),
}

impl Dimensions {
    pub(crate) fn new(width: u32, height: u32) -> Option<Self> {
        (width != 0 && height != 0).then_some(Self { width, height })
    }

    /// Apply EXIF's width/height swap to stored dimensions, including OS-provided ones.
    /// Orientations 5–8 swap axes. Unknown values leave the pair unchanged.
    /// Do not apply this again to dimensions already oriented by a decoder.
    pub fn with_exif_orientation(mut self, orientation: u32) -> Self {
        if (5..=8).contains(&orientation) {
            std::mem::swap(&mut self.width, &mut self.height);
        }
        self
    }
}

impl CleanAperture {
    /// Apply an exact pixel crop to dimensions after any preceding transforms.
    /// Returns None unless the crop is positive, integral, aligned and in bounds.
    pub fn cropped_dimensions(self, input: Dimensions) -> Option<Dimensions> {
        Some(Dimensions {
            width: crop_axis(input.width, self.width, self.horizontal_offset)?,
            height: crop_axis(input.height, self.height, self.vertical_offset)?,
        })
    }
}

fn crop_axis(input: u32, size: Rational, offset: Rational) -> Option<u32> {
    if size.numerator <= 0 || size.denominator <= 0 || offset.denominator <= 0 {
        return None;
    }
    if size.numerator % size.denominator != 0 {
        return None;
    }
    let size = u32::try_from(size.numerator / size.denominator).ok()?;
    let spare = i128::from(input.checked_sub(size)?);
    // https://developer.apple.com/documentation/quicktime-file-format/clean_aperture
    let denominator = 2 * i128::from(offset.denominator);
    let origin = spare * i128::from(offset.denominator) + 2 * i128::from(offset.numerator);
    (origin >= 0 && origin <= spare * denominator && origin % denominator == 0).then_some(size)
}
