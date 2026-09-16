use std::io;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use windows_sys::Win32::Foundation::{
    HANDLE, LocalFree, WAIT_ABANDONED_0, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Security::Authorization::{
    ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::System::Threading::{
    CREATE_EVENT_MANUAL_RESET, CreateEventExW, CreateMutexExW, EVENT_MODIFY_STATE, INFINITE,
    MUTEX_MODIFY_STATE, ResetEvent, SYNCHRONIZATION_SYNCHRONIZE, SetEvent, WaitForMultipleObjects,
    WaitForSingleObject,
};

pub(super) struct Instance {
    _ownership: OwnedHandle,
    activation: Arc<OwnedHandle>,
    acknowledged: OwnedHandle,
    exiting: AtomicBool,
}

impl Instance {
    #[expect(
        unsafe_code,
        reason = "Acquire Win32 instance ownership or await activation"
    )]
    pub(super) fn acquire(identifier: &str) -> io::Result<Option<Self>> {
        let ownership = named_handle(
            &format!("Local\\{identifier}.instance"),
            |attrs, name| unsafe {
                CreateMutexExW(
                    attrs,
                    name,
                    0,
                    SYNCHRONIZATION_SYNCHRONIZE | MUTEX_MODIFY_STATE,
                )
            },
        )?;
        let activation = named_handle(
            &format!("Local\\{identifier}.activation"),
            |attrs, name| unsafe {
                CreateEventExW(
                    attrs,
                    name,
                    0,
                    SYNCHRONIZATION_SYNCHRONIZE | EVENT_MODIFY_STATE,
                )
            },
        )?;
        let acknowledged = named_handle(
            &format!("Local\\{identifier}.activated"),
            |attrs, name| unsafe {
                CreateEventExW(
                    attrs,
                    name,
                    CREATE_EVENT_MANUAL_RESET,
                    SYNCHRONIZATION_SYNCHRONIZE | EVENT_MODIFY_STATE,
                )
            },
        )?;
        match unsafe { WaitForSingleObject(ownership.as_raw_handle(), 0) } {
            WAIT_OBJECT_0 | WAIT_ABANDONED_0 => {}
            WAIT_TIMEOUT => {
                if unsafe { ResetEvent(acknowledged.as_raw_handle()) } == 0
                    || unsafe { SetEvent(activation.as_raw_handle()) } == 0
                {
                    return Err(io::Error::last_os_error());
                }
                let handles = [ownership.as_raw_handle(), acknowledged.as_raw_handle()];
                match unsafe { WaitForMultipleObjects(2, handles.as_ptr(), 0, INFINITE) } {
                    WAIT_OBJECT_0 | WAIT_ABANDONED_0 => {}
                    result if result == WAIT_OBJECT_0 + 1 => return Ok(None),
                    _ => return Err(io::Error::last_os_error()),
                }
            }
            _ => return Err(io::Error::last_os_error()),
        }
        if unsafe { ResetEvent(acknowledged.as_raw_handle()) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Some(Self {
            _ownership: ownership,
            activation: Arc::new(activation),
            acknowledged,
            exiting: AtomicBool::new(false),
        }))
    }

    pub(super) fn mark_exiting(&self) {
        self.exiting.store(true, Ordering::Relaxed);
    }

    #[expect(
        unsafe_code,
        reason = "Acknowledge activation only while the primary is running"
    )]
    pub(super) fn activate(&self, on_activation: impl FnOnce()) -> io::Result<()> {
        if !self.exiting.load(Ordering::Relaxed) {
            on_activation();
            if unsafe { SetEvent(self.acknowledged.as_raw_handle()) } == 0 {
                return Err(io::Error::last_os_error());
            }
        }
        Ok(())
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
    reason = "Create a medium-integrity Win32 object with the token's default ACL"
)]
fn named_handle(
    name: &str,
    create: impl FnOnce(&SECURITY_ATTRIBUTES, *const u16) -> HANDLE,
) -> io::Result<OwnedHandle> {
    let mut descriptor = std::ptr::null_mut();
    if unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            windows_sys::core::w!("S:(ML;;NW;;;ME)"),
            SDDL_REVISION_1,
            &mut descriptor,
            std::ptr::null_mut(),
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    let attributes = SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: descriptor,
        bInheritHandle: 0,
    };
    let name = name.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let handle = create(&attributes, name.as_ptr());
    let result = if handle.is_null() {
        Err(io::Error::last_os_error())
    } else {
        Ok(unsafe { OwnedHandle::from_raw_handle(handle) })
    };
    unsafe { LocalFree(descriptor) };
    result
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
