//! Desktop notifications. Discord's page calls `notify` (through the core's
//! Notification replacement) and xray shows a Windows toast under its own
//! name. Clicking the toast brings xray back and opens the conversation.
//!
//! This is the one command Discord's page can call, so any script running on
//! discord.com can reach it. Text is length-capped and bursts are dropped.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Runtime};

const MAX_TITLE: usize = 120;
const MAX_BODY: usize = 400;
/// At most this many toasts per window of time. Discord never needs more.
const BURST: usize = 6;
const BURST_WINDOW: Duration = Duration::from_secs(10);

static RECENT: Mutex<VecDeque<Instant>> = Mutex::new(VecDeque::new());

#[tauri::command]
pub async fn notify<R: Runtime>(app: AppHandle<R>, id: u32, title: String, body: String) {
    if within_burst_limit() {
        show(app, id, &clip(&title, MAX_TITLE), &clip(&body, MAX_BODY));
    }
}

fn within_burst_limit() -> bool {
    let Ok(mut recent) = RECENT.lock() else { return false };
    let now = Instant::now();
    while recent.front().is_some_and(|at| now.duration_since(*at) > BURST_WINDOW) {
        recent.pop_front();
    }
    if recent.len() >= BURST {
        return false;
    }
    recent.push_back(now);
    true
}

fn clip(text: &str, max_chars: usize) -> String {
    match text.char_indices().nth(max_chars) {
        Some((cut, _)) => format!("{}…", &text[..cut]),
        None => text.to_owned(),
    }
}

#[cfg(windows)]
fn show<R: Runtime>(app: AppHandle<R>, id: u32, title: &str, body: &str) {
    use tauri_winrt_notification::{Duration as Shown, Toast};

    let aumid = app.config().identifier.clone();
    let toast = Toast::new(&aumid)
        .title(title)
        .text1(body)
        // Discord plays its own notification sound.
        .sound(None)
        .duration(Shown::Short)
        .on_activated(move |_| {
            crate::window::show(&app);
            crate::window::eval(&app, &format!("window.__xray && window.__xray.notificationClicked({id})"));
            Ok(())
        });
    if let Err(err) = toast.show() {
        eprintln!("xray: couldn't show a notification: {err}");
    }
}

#[cfg(not(windows))]
fn show<R: Runtime>(_app: AppHandle<R>, _id: u32, _title: &str, _body: &str) {}

/// Windows only shows toasts from apps it knows about. An installed app gets
/// that from its Start menu shortcut. This registers xray directly, under its
/// name and icon, so toasts work from any copy of the exe.
#[cfg(windows)]
pub fn register<R: Runtime>(app: &AppHandle<R>) {
    use std::fs;
    use tauri::Manager;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    const ICON: &[u8] = include_bytes!("../icons/128x128.png");

    let key_path = format!(r"Software\Classes\AppUserModelId\{}", app.config().identifier);
    let Ok((key, _)) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(key_path) else { return };
    let _ = key.set_value("DisplayName", &"xray");
    let Ok(dir) = app.path().app_data_dir() else { return };
    let icon = dir.join("notification-icon.png");
    if fs::create_dir_all(&dir).is_ok() && fs::write(&icon, ICON).is_ok() {
        let _ = key.set_value("IconUri", &icon.to_string_lossy().into_owned());
    }
}

#[cfg(not(windows))]
pub fn register<R: Runtime>(_app: &AppHandle<R>) {}
