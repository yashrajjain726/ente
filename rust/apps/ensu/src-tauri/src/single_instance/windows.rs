use std::io;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::sync::Arc;

use windows_sys::Win32::Foundation::{ERROR_ALREADY_EXISTS, GetLastError, WAIT_OBJECT_0};
use windows_sys::Win32::System::Threading::{
    CreateEventW, INFINITE, SetEvent, WaitForSingleObject,
};

pub(super) struct Instance {
    activation: Arc<OwnedHandle>,
}

impl Instance {
    #[expect(unsafe_code, reason = "Create, own, and signal a named Win32 event")]
    pub(super) fn acquire(identifier: &str) -> io::Result<Option<Self>> {
        let event_name = format!("Local\\{identifier}.activation")
            .encode_utf16()
            .chain(Some(0))
            .collect::<Vec<_>>();
        let raw_event = unsafe { CreateEventW(std::ptr::null(), 0, 0, event_name.as_ptr()) };
        let already_running = unsafe { GetLastError() } == ERROR_ALREADY_EXISTS;
        if raw_event.is_null() {
            return Err(io::Error::last_os_error());
        }
        let activation = unsafe { OwnedHandle::from_raw_handle(raw_event) };
        if already_running {
            if unsafe { SetEvent(activation.as_raw_handle()) } == 0 {
                return Err(io::Error::last_os_error());
            }
            return Ok(None);
        }
        Ok(Some(Self {
            activation: Arc::new(activation),
        }))
    }

    pub(super) fn listen(&self, on_activation: impl Fn() + Send + 'static) -> io::Result<()> {
        let activation = Arc::clone(&self.activation);
        std::thread::Builder::new()
            .name("ensu-activation".into())
            .spawn(move || {
                loop {
                    match wait_for_activation(&activation) {
                        Ok(()) => on_activation(),
                        Err(error) => {
                            crate::logging::log(
                                "App",
                                format!("activation listener failed error={error}"),
                            );
                            break;
                        }
                    }
                }
            })?;
        Ok(())
    }
}

#[expect(
    unsafe_code,
    reason = "Wait on the activation event while its handle remains owned"
)]
fn wait_for_activation(activation: &OwnedHandle) -> io::Result<()> {
    match unsafe { WaitForSingleObject(activation.as_raw_handle(), INFINITE) } {
        WAIT_OBJECT_0 => Ok(()),
        _ => Err(io::Error::last_os_error()),
    }
}
