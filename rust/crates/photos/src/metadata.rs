use std::{fs::File, path::Path};

use ente_exif::{CaptureDateTime, Dimensions, Error, Limits, Location, Mode};

#[derive(Debug)]
pub struct PhotoMetadata {
    pub dimensions: Option<Dimensions>,
    pub capture_date_time: Option<CaptureDateTime>,
    pub location: Option<Location>,
}

pub fn read_photo_metadata(path: impl AsRef<Path>) -> Result<PhotoMetadata, Error> {
    let metadata = ente_exif::read(&mut File::open(path)?, Mode::Summary, Limits::default())?;
    Ok(PhotoMetadata {
        dimensions: metadata.display_dimensions(),
        capture_date_time: metadata.capture_date_time(),
        location: metadata.exif_location().or_else(|| metadata.xmp_location()),
    })
}
