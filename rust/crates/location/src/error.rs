use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Error)]
pub enum Error {
    #[error("map point {0} has an invalid coordinate")]
    InvalidMapPoint(usize),
    #[error("minimum marker distance must be finite and positive")]
    InvalidMarkerDistance,
    #[error("map viewport is invalid")]
    InvalidViewport,
}
