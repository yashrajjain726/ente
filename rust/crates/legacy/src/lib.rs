mod client;
mod error;
mod kit;
mod kit_models;
mod kit_transport;
mod models;
mod transport;

pub use client::LegacyClient;
pub use error::{Error, Result};
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
