//! xray's Rust shell: one window running Discord's web app with xray's mod
//! core injected at document start, plus desktop notifications, the unread
//! badge, the tray, single-instance handling and launch at login.

mod badge;
mod documents;
mod hotkeys;
mod installer;
mod intelligence;
mod recordings;
mod taskbar;
mod sandbox;
mod notify;
mod oathnet;
mod report;
mod settings;
mod sync;
mod translate;
mod tray;
mod webfetch;
mod window;

use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

use settings::ShellSettings;

/// Shell settings, shared by the tray menu and the window's close handler.
pub struct Shell(pub Mutex<ShellSettings>);

pub fn run() {
    let mut builder = tauri::Builder::default();
    // Must be registered first: a second launch hands off to the running copy and exits.
    // An off-screen test copy skips this, so it never brings your own window to the front.
    if !window::is_offscreen_test() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| window::show(app)));
    }
    builder
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![window::AUTOSTART_ARG]),
        ))
        .plugin(tauri_plugin_opener::init())
        // Every command Discord's page may call (see capabilities/main.json).
        .invoke_handler(tauri::generate_handler![notify::notify, notify::set_notification_privacy, hotkeys::get_hotkeys, hotkeys::set_hotkeys, report::report_events, sync::sync_config, documents::document_store, translate::translate, webfetch::web_fetch, oathnet::oathnet_lookup, intelligence::provider_keys, intelligence::open_provider_settings, intelligence::intel_request, recordings::recording_transfer, taskbar::set_voice_controls, window::change_zoom, sandbox::open_sandbox_preview])
        .setup(|app| {
            let handle = app.handle();
            let mut shell = settings::load(handle);
            sync_autostart(handle, &mut shell);
            notify::register(handle);
            let at_login = std::env::args().any(|arg| arg == window::AUTOSTART_ARG);
            let visible = !(at_login && shell.start_minimized);
            let bindings = shell.hotkeys.clone();
            // Register settings before the WebView restores zoom or its injected
            // core invokes a native command during document-start.
            app.manage(Shell(Mutex::new(shell)));
            window::create(handle, visible)?;
            taskbar::register_shortcut(handle);
            taskbar::install(handle);
            hotkeys::start(handle, bindings);
            tray::build(handle)?;
            Ok(())
        })
        .on_window_event(|win, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Auxiliary windows must actually close: hidden sandboxes retain
                // their WebView and consume the bounded preview-window allowance.
                if win.label() != window::MAIN { return; }
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
/// later sticks. While it's on, each launch re-registers this exe, so the entry
/// follows xray if it moves (from a build folder to an install, say).
fn sync_autostart<R: Runtime>(app: &AppHandle<R>, shell: &mut ShellSettings) {
    if cfg!(debug_assertions) {
        return;
    }
    let autolaunch = app.autolaunch();
    if !shell.autostart_initialized {
        if autolaunch.enable().is_ok() {
            shell.autostart_initialized = true;
            settings::save(app, shell);
        }
    } else if autolaunch.is_enabled().unwrap_or(false) {
        let _ = autolaunch.enable();
    }
}
