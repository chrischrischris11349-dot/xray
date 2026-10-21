//! xray's Rust shell: one window running Discord's web app with xray's mod
//! core injected at document start, plus the tray, single-instance handling
//! and launch at login.

mod settings;
mod tray;
mod window;

use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use settings::ShellSettings;

/// Shell settings, shared by the tray menu and the window's close handler.
pub struct Shell(pub Mutex<ShellSettings>);

pub fn run() {
    tauri::Builder::default()
        // Must be registered first: a second launch hands off to the running copy and exits.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| window::show(app)))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![window::AUTOSTART_ARG]),
        ))
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle();
            let mut shell = settings::load(handle);
            enable_autostart_once(handle, &mut shell);
            let at_login = std::env::args().any(|arg| arg == window::AUTOSTART_ARG);
            window::create(handle, !(at_login && shell.start_minimized))?;
            app.manage(Shell(Mutex::new(shell)));
            tray::build(handle)?;
            Ok(())
        })
        .on_window_event(|win, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let shell = win.app_handle().state::<Shell>();
                let to_tray = shell.0.lock().map(|s| s.close_to_tray).unwrap_or(true);
                if to_tray {
                    api.prevent_close();
                    let _ = win.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("xray failed to start");
}

/// Launch at login is on by default. It's switched on once, on the first run of
/// a release build, so dev builds never register themselves and turning it off
/// later sticks.
fn enable_autostart_once<R: Runtime>(app: &AppHandle<R>, shell: &mut ShellSettings) {
    if cfg!(debug_assertions) || shell.autostart_initialized {
        return;
    }
    if app.autolaunch().enable().is_ok() {
        shell.autostart_initialized = true;
        settings::save(app, shell);
    }
}
