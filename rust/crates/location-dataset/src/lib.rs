use std::fmt::Write as _;
use std::path::PathBuf;

use ente_location::CityIndex;
use sha2::{Digest, Sha256};
use thiserror::Error;

mod city;
mod download;
mod sources;

pub use sources::{RemoteSources, SourcePaths};

pub const CITY_FILE: &str = "cities.bin";

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Error)]
pub enum Error {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("download failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("ZIP archive is invalid: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("invalid location data: {0}")]
    InvalidData(String),
    #[error(transparent)]
    Location(#[from] ente_location::Error),
}

pub struct BuildOptions {
    pub sources: SourcePaths,
    pub output: PathBuf,
}

pub struct BuildOutput {
    pub city_count: usize,
    pub byte_length: usize,
    pub sha256: String,
}

pub fn build(options: &BuildOptions) -> Result<BuildOutput> {
    let bytes = city::build(&options.sources.cities, &options.sources.country_info)?;
    let city_count = CityIndex::from_bytes(bytes.as_slice())?.len();
    let output = BuildOutput {
        city_count,
        byte_length: bytes.len(),
        sha256: hex(Sha256::digest(&bytes)),
    };
    std::fs::create_dir_all(&options.output)?;
    std::fs::write(options.output.join(CITY_FILE), bytes)?;
    Ok(output)
}

fn invalid(message: impl Into<String>) -> Error {
    Error::InvalidData(message.into())
}

fn hex(bytes: impl AsRef<[u8]>) -> String {
    let mut output = String::with_capacity(bytes.as_ref().len() * 2);
    for byte in bytes.as_ref() {
        write!(output, "{byte:02x}").expect("writing to a string is infallible");
    }
    output
}
