mod client;
mod error;

pub use client::{
    AttachmentType, ContactData, ContactRecord, ContactsClient, OpenContactsInput,
    OpenContactsResult, RootKeySource, WrappedRootContactKey,
};
pub use error::{Error, Result};
