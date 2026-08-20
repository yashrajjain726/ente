pub mod client;
pub mod error;
pub mod kit;
pub mod kit_models;
pub mod kit_transport;
pub mod models;
pub mod transport;

pub use client::LegacyClient;
pub use error::{Error, ErrorKind, Result};
pub use kit::{LegacyKitRecoveryClient, LegacyKitRecoveryHandle};
pub use kit_models::{
    LEGACY_KIT_PAYLOAD_VERSION, LegacyKit, LegacyKitCreateResult, LegacyKitMetadata,
    LegacyKitOwnerRecoverySession, LegacyKitPart, LegacyKitRecoveryBundle,
    LegacyKitRecoveryInitiator, LegacyKitRecoverySession, LegacyKitRecoveryStatus, LegacyKitShare,
    LegacyKitVariant,
};
pub use models::{
    LegacyContactRecord, LegacyContactState, LegacyInfo, LegacyRecoveryBundle,
    LegacyRecoverySession, LegacyRecoveryStatus, LegacyUser,
};
