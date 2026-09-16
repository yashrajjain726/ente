use tauri::{AppHandle, Manager, plugin::TauriPlugin};

use crate::logging;

#[cfg(windows)]
mod windows;

pub fn plugin() -> TauriPlugin<tauri::Wry> {
    #[cfg(target_os = "linux")]
    {
        tauri_plugin_single_instance::init(|app, _, _| focus_main_window(app))
    }
    #[cfg(windows)]
    {
        tauri::plugin::Builder::new("single-instance")
            .setup(|app, _| {
                match windows::Instance::acquire(&app.config().identifier)? {
                    Some(instance) => {
                        app.manage(instance);
                    }
                    None => {
                        app.cleanup_before_exit();
                        std::process::exit(0);
                    }
                }
                Ok(())
            })
            .on_event(|app, event| {
                if matches!(event, tauri::RunEvent::Ready) {
                    let instance = app.state::<windows::Instance>();
                    let app = app.clone();
                    if let Err(error) = instance.listen(move || focus_main_window(&app)) {
                        logging::log(
                            "App",
                            format!("failed to listen for activation error={error}"),
                        );
                    }
                }
            })
            .build()
    }
}

fn focus_main_window(app: &AppHandle) {
    logging::log(
        "App",
        "additional launch received; focusing existing window",
    );
    if let Some(window) = app.get_webview_window("main") {
        for (operation, result) in [
            ("show", window.show()),
            ("restore", window.unminimize()),
            ("focus", window.set_focus()),
        ] {
            if let Err(error) = result {
                logging::log(
                    "App",
                    format!("failed to {operation} existing window error={error}"),
                );
            }
        }
    }
}
