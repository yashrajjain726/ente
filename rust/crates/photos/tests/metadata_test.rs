use std::io::Write;

use ente_exif::{Dimensions, Location};
use ente_photos::metadata::read_photo_metadata;

#[test]
fn reads_display_dimensions_capture_time_and_xmp_location() {
    let properties = r#"tiff:Orientation="6" exif:DateTimeOriginal="2024-01-01T12:00:00.123456-00:30"
        exif:GPSLatitude="40,30N" exif:GPSLongitude="74,15W""#;
    let xmp = format!(
        "http://ns.adobe.com/xap/1.0/\0<rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\"><rdf:Description xmlns:exif=\"http://ns.adobe.com/exif/1.0/\" xmlns:tiff=\"http://ns.adobe.com/tiff/1.0/\" {properties}/></rdf:RDF>"
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
    let metadata = read_photo_metadata(file.path()).unwrap();
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
