//! Default capture-date and display-size policies, built on the public parser API.
//! Applications can replace these functions with their own source selection,
//! normalization and decoder rules. Reading metadata does not call this module.

use crate::{
    DateTime, DateTimeKind, DateTimePrecision, DateTimeSource, Dimensions, Metadata, Transform,
    namespace,
};

/// Resolved capture metadata. Local time and the embedded offset remain separate.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaptureDateTime {
    /// ISO local date/time without a timezone suffix; retains nanosecond precision.
    pub date_time: String,
    /// Embedded UTC offset, normalized to ±HH:MM. None means absent, not UTC.
    pub offset_time: Option<String>,
    /// Epoch microseconds. None when a full timestamp has no embedded offset.
    /// Date-only inputs use midnight UTC without inventing an embedded offset.
    pub timestamp_micros: Option<i64>,
    pub source: DateTimeSource,
}

/// First parseable capture date, in this order:
///
/// | Family | Sources |
/// | --- | --- |
/// | Original | XMP `exif:DateTimeOriginal`, IPTC 2:55/60, EXIF Original, XMP `photoshop:DateCreated` |
/// | Digitized | XMP `exif:DateTimeDigitized`, IPTC 2:62/63, EXIF Digitized, XMP `xmp:CreateDate` |
/// | Metadata change | XMP `xmp:MetadataDate` |
/// | Modified | XMP `tiff:DateTime`, EXIF Modified, XMP `xmp:ModifyDate` |
///
/// Year/month/date-only values use the start of that period at midnight UTC,
/// without inventing an embedded offset. Omitted seconds become zero. Full times
/// without offsets remain unresolved; no host timezone or sentinel filtering is
/// assumed. Valid epoch zero and unusual years are preserved.
///
/// Local text retains nanoseconds, epoch values retain microseconds, and `Z`
/// normalizes to `+00:00`. Only the selected candidate's strings are allocated.
/// Use [`Metadata::date_time`] for source precision without normalization.
pub fn capture_date_time(metadata: &Metadata) -> Option<CaptureDateTime> {
    capture_date_time_with(metadata, |_| true)
}

/// Resolve or reject each candidate before choosing the first accepted one.
/// The callback can fill `timestamp_micros` from a host timezone and reject
/// application-specific sentinel dates by returning false. An assumed device
/// offset should not be stored in `offset_time`, which describes the source.
/// Does not inspect filenames, filesystem timestamps or external sidecars.
///
/// ```rust,no_run
/// # use ente_exif::{Limits, Mode};
/// # let mut file = std::fs::File::open("photo.jpg")?;
/// # let metadata = ente_exif::read(&mut file, Mode::Summary, Limits::default())?;
/// # fn local_timestamp_in_host_timezone(_: &str) -> Option<i64> { None }
/// let capture = metadata.capture_date_time_with(|candidate| {
///     if candidate.timestamp_micros.is_none() {
///         // Supplied by the application: resolve this date in the host's timezone,
///         // including its daylight-saving rules, rather than using today's offset.
///         candidate.timestamp_micros = local_timestamp_in_host_timezone(&candidate.date_time);
///     }
///     // Returning false skips this candidate and continues through the table.
///     candidate.timestamp_micros.is_some()
/// });
/// # Ok::<(), Box<dyn std::error::Error>>(())
/// ```
pub fn capture_date_time_with(
    metadata: &Metadata,
    mut accept: impl FnMut(&mut CaptureDateTime) -> bool,
) -> Option<CaptureDateTime> {
    use DateTimeKind::{Digitized, Modified, Original};
    use DateTimeSource::{Exif, Iptc, Xmp};
    [
        Xmp(namespace::EXIF, "DateTimeOriginal"),
        Iptc(55, 60),
        Exif(Original),
        Xmp(namespace::PHOTOSHOP, "DateCreated"),
        Xmp(namespace::EXIF, "DateTimeDigitized"),
        Iptc(62, 63),
        Exif(Digitized),
        Xmp(namespace::XMP, "CreateDate"),
        Xmp(namespace::XMP, "MetadataDate"),
        Xmp(namespace::TIFF, "DateTime"),
        Exif(Modified),
        Xmp(namespace::XMP, "ModifyDate"),
    ]
    .into_iter()
    .find_map(|source| {
        let value = metadata.date_time(source)?;
        let date = value.date_time;
        let local = DateTime {
            offset_minutes: None,
            ..date
        };
        let absolute = if matches!(
            value.precision,
            DateTimePrecision::Year | DateTimePrecision::Month | DateTimePrecision::Day
        ) {
            DateTime {
                offset_minutes: Some(0),
                ..date
            }
        } else {
            date
        };
        let mut result = CaptureDateTime {
            date_time: local.to_string(),
            offset_time: date.offset_minutes.map(|offset| {
                let minutes = offset.unsigned_abs();
                format!(
                    "{}{:02}:{:02}",
                    if offset < 0 { '-' } else { '+' },
                    minutes / 60,
                    minutes % 60
                )
            }),
            timestamp_micros: absolute.unix_micros(),
            source,
        };
        accept(&mut result).then_some(result)
    })
}

/// Final pixel dimensions: container/EXIF size, then a complete XMP pair.
/// Applies HEIF transforms in order. A nonzero HEIF rotation or any mirror
/// suppresses EXIF/XMP orientation; otherwise valid EXIF wins over XMP.
/// Zero HEIF rotation allows EXIF/XMP fallback; mirrors do not swap axes.
/// JPEG XL's codestream orientation always overrides EXIF/XMP, including normal
/// orientation. Its dimensions exclude optional intrinsic display resampling.
/// XMP-only dimensions use XMP orientation only. Missing/invalid orientation
/// leaves dimensions unchanged. Does not apply transforms to decoded pixels.
///
/// Returns `None` for missing dimensions or a crop that is not a positive,
/// integer, pixel-aligned rectangle within its input image. Pixel aspect
/// ratio, scaling and decoder-specific rendering policies are not applied.
pub fn display_dimensions(metadata: &Metadata) -> Option<Dimensions> {
    let mut dimensions = metadata.dimensions.or_else(|| metadata.xmp_dimensions())?;
    let mut oriented = false;
    for transform in &metadata.transforms {
        match *transform {
            Transform::Orientation(value @ 1..=8) => {
                dimensions = dimensions.with_exif_orientation(u32::from(value));
                oriented = true;
            }
            Transform::Rotate(turns @ 0..=3) => {
                if turns % 2 != 0 {
                    std::mem::swap(&mut dimensions.width, &mut dimensions.height);
                }
                oriented |= turns != 0;
            }
            Transform::Mirror(0..=1) => oriented = true,
            Transform::Crop(crop) => dimensions = crop.cropped_dimensions(dimensions)?,
            _ => return None,
        }
    }
    if !oriented {
        let exif = metadata.dimensions.and(metadata.orientation());
        let orientation = exif.filter(|v| (1..=8).contains(v)).or_else(|| {
            metadata
                .property(namespace::TIFF, "Orientation")?
                .trim()
                .parse::<u32>()
                .ok()
                .filter(|v| (1..=8).contains(v))
        });
        dimensions = dimensions.with_exif_orientation(orientation.unwrap_or(1));
    }
    (dimensions.width != 0 && dimensions.height != 0).then_some(dimensions)
}
