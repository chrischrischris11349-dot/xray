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
    /// WebView2's automatic GPU path; false is an opt-in compatibility mode.
    pub hardware_acceleration: bool,
    /// Local-only strict SOCKS routing; changing this requires a full restart.
    pub tor_proxy: bool,
    pub tor_browser_path: String,
    pub zoom: f64,
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
    /// Your server's base URL for settings sync (sync.rs), e.g.
    /// `https://xray.example.com`. Empty means settings sync is off.
    pub sync_endpoint: String,
    /// The bearer token for settings sync. Empty means settings sync is off.
    pub sync_token: String,
}

impl Default for ShellSettings {
    fn default() -> Self {
        Self {
            hardware_acceleration: true,
            tor_proxy: false,
            tor_browser_path: String::new(),
            zoom: 1.0,
            close_to_tray: true,
            start_minimized: false,
            autostart_initialized: false,
            hotkeys: Hotkeys::default(),
            log_endpoint: String::new(),
            log_token: String::new(),
            sync_endpoint: String::new(),
            sync_token: String::new(),
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
    let _ = save_checked(app, settings);
}

pub fn save_checked<R: Runtime>(app: &AppHandle<R>, settings: &ShellSettings) -> Result<(),String> {
    let destination=path(app).ok_or("XRay's settings directory is unavailable")?;
    write_settings(&destination,settings).map_err(|_|"Settings could not be saved. Check disk space and retry; the previous preference was kept.".into())
}

fn write_settings(destination:&std::path::Path,settings:&ShellSettings)->std::io::Result<()> {
    use std::io::Write;
    if let Some(parent)=destination.parent(){fs::create_dir_all(parent)?;}
    let staged=destination.with_extension(format!("{}.tmp",std::process::id()));
    let data=serde_json::to_vec_pretty(settings)?;
    let mut file=fs::File::create(&staged)?;file.write_all(&data)?;file.sync_all()?;drop(file);
    fs::rename(&staged,destination)
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn graphics_defaults_and_saved_preferences_survive_restart() {
        let mut value:ShellSettings=serde_json::from_str("{}").unwrap();assert!(value.hardware_acceleration);
        value.hardware_acceleration=false;value.zoom=1.25;
        let directory=std::env::temp_dir().join(format!("xray-settings-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let destination=directory.join("shell.json");write_settings(&destination,&value).unwrap();
        let restored:ShellSettings=serde_json::from_slice(&fs::read(&destination).unwrap()).unwrap();assert!(!restored.hardware_acceleration);assert_eq!(restored.zoom,1.25);
        value.hardware_acceleration=true;write_settings(&destination,&value).unwrap();let restored:ShellSettings=serde_json::from_slice(&fs::read(&destination).unwrap()).unwrap();assert!(restored.hardware_acceleration);
        fs::remove_file(destination).unwrap();fs::remove_dir(directory).unwrap();
    }
    #[test] fn legacy_link_only_tor_is_retired_without_changing_strict_routing_or_other_settings() {
        let normal:ShellSettings=serde_json::from_str("{}").unwrap();
        assert!(!normal.tor_proxy);
        let links:ShellSettings=serde_json::from_value(serde_json::json!({"tor_proxy":false,"tor_browser_links":true,"tor_browser_path":"existing-tor-browser","zoom":1.2})).unwrap();
        let restored:ShellSettings=serde_json::from_str(&serde_json::to_string(&links).unwrap()).unwrap();
        assert!(!restored.tor_proxy);assert!(serde_json::to_value(&restored).unwrap().get("tor_browser_links").is_none());
        assert_eq!(restored.tor_browser_path,"existing-tor-browser");assert_eq!(restored.zoom,1.2);
        let strict:ShellSettings=serde_json::from_value(serde_json::json!({"tor_proxy":true,"tor_browser_links":false})).unwrap();assert!(strict.tor_proxy);
    }
}
