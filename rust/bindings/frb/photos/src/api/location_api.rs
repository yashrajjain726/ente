use ente_location as core;
use flutter_rust_bridge::frb;

#[frb]
pub enum LocationError {
    Other { message: String },
}

impl From<core::Error> for LocationError {
    fn from(error: core::Error) -> Self {
        Self::Other {
            message: ente_core::error::chain(&error),
        }
    }
}
