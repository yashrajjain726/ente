mod client;
mod error;
mod kit;

pub use client::{
    LegacyClient, LegacyContactRecord, LegacyContactState, LegacyInfo, LegacyRecoveryBundle,
    LegacyRecoverySession, LegacyRecoveryStatus, LegacyUser,
};
pub use error::{Error, Result};
pub use kit::{
    LEGACY_KIT_PAYLOAD_VERSION, LegacyKit, LegacyKitCreateResult, LegacyKitMetadata,
    LegacyKitOwnerRecoverySession, LegacyKitPart, LegacyKitRecoveryBundle, LegacyKitRecoveryClient,
    LegacyKitRecoveryHandle, LegacyKitRecoveryInitiator, LegacyKitRecoverySession,
    LegacyKitRecoveryStatus, LegacyKitShare, LegacyKitVariant,
};
