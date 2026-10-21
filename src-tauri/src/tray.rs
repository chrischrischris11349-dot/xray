//! System tray: left-click shows or hides xray. The menu opens the xray panel,
//! switches launch at login and keep-running-when-closed, reloads Discord and quits.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt;

use crate::{settings, window, Shell};

pub const ID: &str = "xray";
const SHOW: &str = "show";
const PANEL: &str = "panel";
const AT_LOGIN: &str = "at-login";
const TO_TRAY: &str = "to-tray";
const RELOAD: &str = "reload";
const QUIT: &str = "quit";
/// A double-click arrives as click, double-click, click. Ignoring clicks this
/// soon after a toggle keeps a double-click from showing and then hiding.
const CLICK_DEBOUNCE: Duration = Duration::from_millis(450);

static LAST_TOGGLE: Mutex<Option<Instant>> = Mutex::new(None);

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let at_login = app.autolaunch().is_enabled().unwrap_or(false);
    let to_tray = app.state::<Shell>().0.lock().map(|s| s.close_to_tray).unwrap_or(true);
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, SHOW, "Show xray", true, None::<&str>)?,
            &MenuItem::with_id(app, PANEL, "Open xray panel", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &CheckMenuItem::with_id(app, AT_LOGIN, "Open at login", true, at_login, None::<&str>)?,
            &CheckMenuItem::with_id(app, TO_TRAY, "Keep running when closed", true, to_tray, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, RELOAD, "Reload Discord", true, None::<&str>)?,
            &MenuItem::with_id(app, QUIT, "Quit xray", true, None::<&str>)?,
        ],
    )?;

    let mut tray = TrayIconBuilder::with_id(ID)
        .tooltip("xray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(handle_menu)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let Ok(mut last) = LAST_TOGGLE.lock() else { return };
                if matches!(*last, Some(at) if at.elapsed() < CLICK_DEBOUNCE) {
                    return;
                }
                *last = Some(Instant::now());
                drop(last);
                window::toggle(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn handle_menu<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    match event.id().as_ref() {
        SHOW => window::show(app),
        PANEL => {
            window::show(app);
            window::eval(app, "window.__xray && window.__xray.openPanel()");
        }
        AT_LOGIN => {
            let autolaunch = app.autolaunch();
            let _ = if autolaunch.is_enabled().unwrap_or(false) {
                autolaunch.disable()
            } else {
                autolaunch.enable()
            };
        }
        TO_TRAY => {
            if let Ok(mut shell) = app.state::<Shell>().0.lock() {
                shell.close_to_tray = !shell.close_to_tray;
                settings::save(app, &shell);
            }
        }
        RELOAD => window::eval(app, "location.reload()"),
        QUIT => app.exit(0),
        _ => {}
    }
}
