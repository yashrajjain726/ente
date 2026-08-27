use std::path::PathBuf;

use reqwest::blocking::Client;

use crate::Result;
use crate::download::{download, extract};

const CITIES_URL: &str = "https://download.geonames.org/export/dump/cities5000.zip";
const COUNTRY_INFO_URL: &str = "https://download.geonames.org/export/dump/countryInfo.txt";

#[derive(Clone, Debug)]
pub struct SourcePaths {
    pub cities: PathBuf,
    pub country_info: PathBuf,
}

#[derive(Clone, Debug)]
pub struct RemoteSources {
    cache: PathBuf,
}

impl RemoteSources {
    pub fn new(cache: impl Into<PathBuf>) -> Self {
        Self {
            cache: cache.into(),
        }
    }

    pub fn fetch(&self) -> Result<SourcePaths> {
        std::fs::create_dir_all(&self.cache)?;
        let client = Client::builder()
            .user_agent("ente-location-dataset")
            .build()?;
        let cities_archive = self.cache.join("cities5000.zip");
        let cities = self.cache.join("cities5000.txt");
        let country_info = self.cache.join("countryInfo.txt");
        download(&client, CITIES_URL, &cities_archive)?;
        download(&client, COUNTRY_INFO_URL, &country_info)?;
        extract(&cities_archive, &cities, "cities5000.txt")?;
        Ok(SourcePaths {
            cities,
            country_info,
        })
    }
}
