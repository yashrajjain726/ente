use std::io::Write;

use ente_exif::{DateTimeSource, Dimensions, Location, namespace};
use ente_photos::metadata::{PhotoMetadata, read_photo_metadata};

#[test]
fn reads_display_dimensions_capture_time_and_xmp_location() {
    let properties = r#"tiff:Orientation="6" exif:DateTimeOriginal="2024-01-01T12:00:00.123456-00:30"
        exif:GPSLatitude="40,30N" exif:GPSLongitude="74,15W""#;
    let metadata = read(properties);
    assert_eq!(
        metadata.dimensions,
        Some(Dimensions {
            width: 48,
            height: 64
        })
    );
    let date = metadata.capture_date_time.unwrap();
    assert_eq!(date.date_time, "2024-01-01T12:00:00.123456000");
    assert_eq!(date.offset_time.as_deref(), Some("-00:30"));
    assert_eq!(date.timestamp_micros, Some(1_704_112_200_123_456));
    assert_eq!(
        metadata.location,
        Some(Location {
            latitude: 40.5,
            longitude: -74.25
        })
    );
}

#[test]
fn skips_partial_and_sentinel_capture_dates_and_continues_to_fallbacks() {
    for (original, rejected) in [
        ("2004", true),
        ("2004-06", true),
        ("2004-06-15", true),
        ("2004-06-15T12:30Z", true),
        ("1970-01-01T00:00:00Z", true),
        ("1970-01-01T05:30:00+05:30", true),
        ("4501-01-01T00:00:00.000Z", true),
        ("4501-01-01T00:00:00+05:30", true),
        ("1970-01-01T00:00:00+05:30", false),
        ("1969-12-31T23:59:59Z", false),
        ("2024-01-01T12:00:00", false),
        ("2024-01-01T00:00:00Z", false),
        ("4501-01-02T00:00:00Z", false),
    ] {
        let metadata = read(&format!(
            r#"exif:DateTimeOriginal="{original}" xmp:CreateDate="2024-01-02T12:00:00Z""#
        ));
        let expected = if rejected {
            DateTimeSource::Xmp(namespace::XMP, "CreateDate")
        } else {
            DateTimeSource::Xmp(namespace::EXIF, "DateTimeOriginal")
        };
        assert_eq!(
            metadata.capture_date_time.unwrap().source,
            expected,
            "{original}"
        );
    }
    assert!(
        read(r#"exif:DateTimeOriginal="2004" xmp:CreateDate="2004-06-15""#)
            .capture_date_time
            .is_none()
    );
    assert!(
        read(
            r#"exif:DateTimeOriginal="4501-01-01T00:00:00Z" xmp:CreateDate="1970-01-01T00:00:00Z""#
        )
        .capture_date_time
        .is_none()
    );
}

fn read(properties: &str) -> PhotoMetadata {
    let xmp = format!(
        "http://ns.adobe.com/xap/1.0/\0<rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\"><rdf:Description xmlns:exif=\"http://ns.adobe.com/exif/1.0/\" xmlns:tiff=\"http://ns.adobe.com/tiff/1.0/\" xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\" {properties}/></rdf:RDF>"
    );
    let mut file = tempfile::NamedTempFile::new().unwrap();
    file.write_all(&[0xff, 0xd8, 0xff, 0xe1]).unwrap();
    file.write_all(&u16::try_from(xmp.len() + 2).unwrap().to_be_bytes())
        .unwrap();
    file.write_all(xmp.as_bytes()).unwrap();
    file.write_all(&[
        0xff, 0xc0, 0, 11, 8, 0, 48, 0, 64, 1, 1, 0x11, 0, 0xff, 0xd9,
    ])
    .unwrap();
    read_photo_metadata(file.path()).unwrap()
}
