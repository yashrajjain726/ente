use crate::{Ifd, Metadata};
use std::fmt;

/// An EXIF date and its matching subsecond/UTC-offset tags.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DateTimeKind {
    Original,
    Digitized,
    Modified,
}

/// The metadata field(s) containing one date/time value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DateTimeSource {
    Exif(DateTimeKind),
    /// Namespace URI and local property name.
    Xmp(&'static str, &'static str),
    /// Date and time dataset IDs in IPTC record 2.
    Iptc(u8, u8),
}

/// Parsed date components and the smallest calendar unit present in the source.
/// Omitted components use the start of that period (month/day 1, clock 0).
/// Precision keeps those defaults distinguishable from explicitly supplied values.
/// No UTC offset is inferred and parsing allocates no strings.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DateTimeValue {
    pub date_time: DateTime,
    pub precision: DateTimePrecision,
}

/// Smallest supplied calendar unit. Fractional digits remain in the raw field;
/// DateTime retains their value up to nanoseconds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DateTimePrecision {
    Year,
    Month,
    Day,
    Minute,
    Second,
}

/// A complete photo-local date/time. A missing UTC offset is unknown, not UTC.
/// Original text and precision remain available through the raw metadata tags.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DateTime {
    pub year: u16,
    pub month: u8,
    pub day: u8,
    pub hour: u8,
    pub minute: u8,
    pub second: u8,
    /// Fractional seconds, truncated to nine digits.
    pub nanosecond: u32,
    /// Signed minutes east of UTC, including negative sub-hour offsets.
    pub offset_minutes: Option<i16>,
}

impl Metadata {
    /// Parse a specific EXIF, XMP or IPTC date without fallback or timezone policy.
    /// Returns None when that field is absent or malformed. XMP fields must be
    /// retained by the chosen read mode; arbitrary properties require Details.
    #[inline]
    pub fn date_time(&self, source: DateTimeSource) -> Option<DateTimeValue> {
        match source {
            DateTimeSource::Exif(kind) => Some(DateTimeValue {
                date_time: self.exif_date_time(kind)?,
                precision: DateTimePrecision::Second,
            }),
            DateTimeSource::Xmp(ns, name) => xmp_date(self.property(ns, name)?),
            DateTimeSource::Iptc(date, time) => {
                iptc_date(self.iptc_value(date)?, self.iptc_value(time))
            }
        }
    }

    /// Parse one EXIF date family without selecting a creation-time fallback.
    /// Inline fractions/offsets take precedence over matching auxiliary tags.
    /// Blank auxiliary fields mean unknown; malformed fields used for conversion are rejected.
    ///
    /// ```rust,no_run
    /// # use ente_exif::{DateTime, DateTimeKind, DateTimeSource, Limits, Mode, namespace};
    /// # let mut file = std::fs::File::open("photo.jpg")?;
    /// # let metadata = ente_exif::read(&mut file, Mode::Summary, Limits::default())?;
    /// let original = metadata.exif_date_time(DateTimeKind::Original);
    /// let digitized = metadata.exif_date_time(DateTimeKind::Digitized);
    /// let modified = metadata.exif_date_time(DateTimeKind::Modified);
    /// // Choose the fallback order appropriate to the application.
    /// let capture = original.or(modified);
    /// if let Some(date) = capture {
    ///     println!("local: {}-{}-{} {}:{}:{}", date.year, date.month, date.day,
    ///              date.hour, date.minute, date.second);
    ///     println!("offset minutes: {:?}; epoch µs: {:?}", date.offset_minutes, date.unix_micros());
    /// }
    /// let xmp_created = metadata.date_time(DateTimeSource::Xmp(namespace::XMP, "CreateDate"));
    /// let iptc_created = metadata.date_time(DateTimeSource::Iptc(55, 60));
    /// let strict = DateTime::parse("2024-02-29T12:34:56+05:30");
    /// # Ok::<(), Box<dyn std::error::Error>>(())
    /// ```
    pub fn exif_date_time(&self, kind: DateTimeKind) -> Option<DateTime> {
        let (ifd, date, subsecond, offset) = match kind {
            DateTimeKind::Original => (Ifd::Exif(0), 0x9003, 0x9291, 0x9011),
            DateTimeKind::Digitized => (Ifd::Exif(0), 0x9004, 0x9292, 0x9012),
            DateTimeKind::Modified => (Ifd::Image(0), 0x132, 0x9290, 0x9010),
        };
        let auxiliary = |id| match self.tag(Ifd::Exif(0), id) {
            Some(tag) => Some(tag.value.text()?.trim()),
            None => Some(""),
        };
        parse(
            self.text(ifd, date)?,
            auxiliary(subsecond),
            auxiliary(offset),
        )
    }

    fn iptc_value(&self, dataset: u8) -> Option<&[u8]> {
        self.iptc
            .iter()
            .find(|v| v.record == 2 && v.dataset == dataset)
            .map(|v| v.value.as_slice())
    }
}

impl DateTime {
    /// Parse a complete EXIF or ISO-style timestamp with optional fraction and offset.
    /// Accepts YYYY:MM:DD HH:MM:SS and YYYY-MM-DD[T or space]HH:MM:SS,
    /// dot/colon fractions, and Z or `±HH[:]?MM` offsets. Partial dates, leap seconds,
    /// impossible calendar dates and named timezones return None.
    pub fn parse(value: &str) -> Option<Self> {
        parse(value.trim(), Some(""), Some(""))
    }

    /// Epoch microseconds only when the offset and calendar components are valid.
    /// No device timezone, DST rule, sentinel-date policy or fallback is applied.
    pub fn unix_micros(self) -> Option<i64> {
        if !self.valid() {
            return None;
        }
        let offset = i64::from(self.offset_minutes?);
        let year = i64::from(self.year) - 1;
        let before_year = 365 * year + year / 4 - year / 100 + year / 400;
        let before_month: i64 = (1..self.month)
            .map(|m| i64::from(days_in_month(self.year, m)))
            .sum();
        let days = before_year + before_month + i64::from(self.day) - 1 - 719_162;
        let seconds = days * 86_400
            + i64::from(self.hour) * 3600
            + i64::from(self.minute) * 60
            + i64::from(self.second)
            - offset * 60;
        Some(seconds * 1_000_000 + i64::from(self.nanosecond / 1000))
    }

    fn valid(self) -> bool {
        (1..=9999).contains(&self.year)
            && self.day != 0
            && self.day <= days_in_month(self.year, self.month)
            && self.hour < 24
            && self.minute < 60
            && self.second < 60
            && self.nanosecond < 1_000_000_000
            && self
                .offset_minutes
                .is_none_or(|v| (-1439..=1439).contains(&v))
    }
}

impl fmt::Display for DateTime {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
            self.year, self.month, self.day, self.hour, self.minute, self.second
        )?;
        if self.nanosecond != 0 {
            write!(f, ".{:09}", self.nanosecond)?;
        }
        if let Some(offset) = self.offset_minutes {
            let minutes = offset.unsigned_abs();
            write!(
                f,
                "{}{:02}:{:02}",
                if offset < 0 { '-' } else { '+' },
                minutes / 60,
                minutes % 60
            )?;
        }
        Ok(())
    }
}

fn xmp_date(value: &str) -> Option<DateTimeValue> {
    let bytes = value.trim().as_bytes();
    let precision = match bytes.len() {
        4 => DateTimePrecision::Year,
        7 => DateTimePrecision::Month,
        10 => DateTimePrecision::Day,
        _ => DateTimePrecision::Second,
    };
    if precision != DateTimePrecision::Second {
        let mut complete = *b"0000-01-01T00:00:00";
        complete[..bytes.len()].copy_from_slice(bytes);
        return DateTime::parse(std::str::from_utf8(&complete).ok()?).map(|date_time| {
            DateTimeValue {
                date_time,
                precision,
            }
        });
    }
    if bytes.len() >= 16 && matches!(bytes.get(16), None | Some(b'Z' | b'z' | b'+' | b'-')) {
        let suffix = &bytes[16..];
        let mut complete = *b"0000-00-00T00:00:00      ";
        complete[..16].copy_from_slice(&bytes[..16]);
        complete
            .get_mut(19..19 + suffix.len())?
            .copy_from_slice(suffix);
        return DateTime::parse(std::str::from_utf8(&complete[..19 + suffix.len()]).ok()?).map(
            |date_time| DateTimeValue {
                date_time,
                precision: DateTimePrecision::Minute,
            },
        );
    }
    DateTime::parse(value).map(|date_time| DateTimeValue {
        date_time,
        precision: DateTimePrecision::Second,
    })
}

fn iptc_date(date: &[u8], time: Option<&[u8]>) -> Option<DateTimeValue> {
    if date.len() != 8 {
        return None;
    }
    let mut complete = *b"0000-00-00T00:00:00+0000";
    complete[..4].copy_from_slice(&date[..4]);
    complete[5..7].copy_from_slice(&date[4..6]);
    complete[8..10].copy_from_slice(&date[6..]);
    let mut len = 19;
    if let Some(time) = time {
        if !matches!(time.len(), 6 | 11) {
            return None;
        }
        complete[11..13].copy_from_slice(&time[..2]);
        complete[14..16].copy_from_slice(&time[2..4]);
        complete[17..19].copy_from_slice(&time[4..6]);
        if time.len() == 11 {
            complete[19..].copy_from_slice(&time[6..]);
            len = 24;
        }
    }
    DateTime::parse(std::str::from_utf8(&complete[..len]).ok()?).map(|date_time| DateTimeValue {
        date_time,
        precision: if time.is_none() {
            DateTimePrecision::Day
        } else {
            DateTimePrecision::Second
        },
    })
}

fn parse(value: &str, subsecond: Option<&str>, offset: Option<&str>) -> Option<DateTime> {
    let b = value.as_bytes();
    if b.len() < 19
        || !matches!(b[4], b':' | b'-')
        || b[7] != b[4]
        || !matches!(b[10], b' ' | b'T' | b't')
        || b[13] != b':'
        || b[16] != b':'
    {
        return None;
    }
    let mut date = DateTime {
        year: number(&b[..4])? as u16,
        month: number(&b[5..7])? as u8,
        day: number(&b[8..10])? as u8,
        hour: number(&b[11..13])? as u8,
        minute: number(&b[14..16])? as u8,
        second: number(&b[17..19])? as u8,
        nanosecond: 0,
        offset_minutes: None,
    };
    let mut suffix = value.get(19..)?;
    if suffix.starts_with(['.', ':']) {
        let digits = &suffix[1..];
        let end = digits.bytes().take_while(u8::is_ascii_digit).count();
        date.nanosecond = fraction(&digits[..end])?;
        suffix = &digits[end..];
    } else {
        let subsecond = subsecond?;
        if !subsecond.is_empty() {
            date.nanosecond = fraction(subsecond)?;
        }
    }
    if !suffix.is_empty() {
        date.offset_minutes = Some(utc_offset(suffix)?);
    } else {
        let offset = offset?;
        if !offset.bytes().all(|b| matches!(b, b' ' | b':')) {
            date.offset_minutes = Some(utc_offset(offset)?);
        }
    }
    date.valid().then_some(date)
}

fn number(bytes: &[u8]) -> Option<u32> {
    bytes.iter().try_fold(0, |n, b| {
        b.is_ascii_digit().then(|| n * 10 + u32::from(b - b'0'))
    })
}

fn fraction(value: &str) -> Option<u32> {
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let digits = value.len().min(9);
    Some(number(&value.as_bytes()[..digits])? * 10u32.pow(9 - digits as u32))
}

fn utc_offset(value: &str) -> Option<i16> {
    if matches!(value, "Z" | "z") {
        return Some(0);
    }
    let b = value.as_bytes();
    let minutes = match b {
        [b'+' | b'-', _, _, b':', _, _] => number(&b[4..])?,
        [b'+' | b'-', _, _, _, _] => number(&b[3..])?,
        _ => return None,
    };
    let hours = number(&b[1..3])?;
    if hours > 23 || minutes > 59 {
        return None;
    }
    Some((hours * 60 + minutes) as i16 * if b[0] == b'-' { -1 } else { 1 })
}

fn days_in_month(year: u16, month: u8) -> u8 {
    match month {
        2 => {
            if year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400)) {
                29
            } else {
                28
            }
        }
        4 | 6 | 9 | 11 => 30,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    }
}
