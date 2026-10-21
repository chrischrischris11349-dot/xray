//! Shell settings that live outside Discord's page: tray and launch-at-login
//! behavior. Stored as `shell.json` in the app's config folder.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::hotkeys::Hotkeys;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct ShellSettings {
    /// Closing the window hides it to the tray instead of quitting.
    pub close_to_tray: bool,
    /// When xray starts at login, stay in the tray instead of opening the window.
    pub start_minimized: bool,
    /// Set once launch at login has been switched on by default, so turning it off sticks.
    pub autostart_initialized: bool,
    /// Global hotkeys (see hotkeys.rs).
    pub hotkeys: Hotkeys,
    /// Your log server's ingest URL (report.rs). Empty means logs are never sent.
    pub log_endpoint: String,
    /// The bearer token your log server checks. Empty means logs are never sent.
    pub log_token: String,
}

impl Default for ShellSettings {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            start_minimized: false,
            autostart_initialized: false,
            hotkeys: Hotkeys::default(),
            log_endpoint: String::new(),
            log_token: String::new(),
        }
    }
}

fn path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|dir| dir.join("shell.json"))
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> ShellSettings {
    path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

pub fn save<R: Runtime>(app: &AppHandle<R>, settings: &ShellSettings) {
    let Some(path) = path(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(path, json);
    }
}
