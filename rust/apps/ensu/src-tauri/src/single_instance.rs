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
                let instance = app.state::<windows::Instance>();
                match event {
                    tauri::RunEvent::Ready => {
                        let handle = app.clone();
                        let result = instance
                            .listen(move || {
                                let app = handle.clone();
                                if let Err(error) = handle.run_on_main_thread(move || {
                                    if let Err(error) = app
                                        .state::<windows::Instance>()
                                        .activate(|| focus_main_window(&app))
                                    {
                                        logging::log(
                                            "App",
                                            format!(
                                                "failed to acknowledge activation error={error}"
                                            ),
                                        );
                                        app.exit(1);
                                    }
                                }) {
                                    logging::log(
                                        "App",
                                        format!("failed to dispatch activation error={error}"),
                                    );
                                }
                            })
                            .and_then(|()| instance.activate(|| {}));
                        if let Err(error) = result {
                            logging::log(
                                "App",
                                format!("failed to listen for activation error={error}"),
                            );
                            app.exit(1);
                        }
                    }
                    tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                        instance.mark_exiting()
                    }
                    tauri::RunEvent::WindowEvent {
                        label,
                        event: tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed,
                        ..
                    } if label == "main" => instance.mark_exiting(),
                    _ => {}
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
