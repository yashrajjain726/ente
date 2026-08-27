use std::fmt;
use std::str::FromStr;

mod binary;
mod city;
pub mod cluster;
mod error;

pub use city::{City, CityIndex, CityMatch};
pub use error::{Error, Result};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Coordinate {
    pub latitude: f64,
    pub longitude: f64,
}

impl Coordinate {
    pub const fn new(latitude: f64, longitude: f64) -> Self {
        Self {
            latitude,
            longitude,
        }
    }

    pub fn is_valid(self) -> bool {
        self.latitude.is_finite()
            && (-90.0..=90.0).contains(&self.latitude)
            && self.longitude.is_finite()
            && (-180.0..=180.0).contains(&self.longitude)
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct CountryCode([u8; 2]);

impl CountryCode {
    pub fn from_bytes(bytes: [u8; 2]) -> std::result::Result<Self, InvalidCountryCode> {
        if bytes.iter().all(u8::is_ascii_uppercase) {
            Ok(Self(bytes))
        } else {
            Err(InvalidCountryCode)
        }
    }

    pub const fn as_bytes(self) -> [u8; 2] {
        self.0
    }

    pub fn as_str(&self) -> &str {
        std::str::from_utf8(&self.0).expect("country code is ASCII")
    }

    pub(crate) const fn from_validated(bytes: [u8; 2]) -> Self {
        Self(bytes)
    }
}

impl fmt::Display for CountryCode {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for CountryCode {
    type Err = InvalidCountryCode;

    fn from_str(value: &str) -> std::result::Result<Self, Self::Err> {
        let bytes = value
            .as_bytes()
            .try_into()
            .map_err(|_| InvalidCountryCode)?;
        Self::from_bytes(bytes)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
#[error("country codes must contain two uppercase ASCII letters")]
pub struct InvalidCountryCode;
