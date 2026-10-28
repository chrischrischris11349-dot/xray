//! Desktop notifications. Discord's page calls `notify` (through the core's
//! Notification replacement) and xray shows a Windows toast under its own
//! name. Clicking the toast brings xray back and opens the conversation.
//!
//! This is the one command Discord's page can call, so any script running on
//! discord.com can reach it. Text is length-capped and bursts are dropped.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use std::{hash::{Hash, Hasher}, io::Read, path::PathBuf};

use tauri::{AppHandle, Runtime};

const MAX_TITLE: usize = 120;
const MAX_BODY: usize = 400;
/// At most this many toasts per window of time. Discord never needs more.
const BURST: usize = 6;
const BURST_WINDOW: Duration = Duration::from_secs(10);

static RECENT: Mutex<VecDeque<Instant>> = Mutex::new(VecDeque::new());
static PRIVATE: AtomicBool = AtomicBool::new(false);
static AVATAR_CACHE: Mutex<()> = Mutex::new(());

#[tauri::command]
pub fn set_notification_privacy(active: bool) { PRIVATE.store(active, Ordering::SeqCst); }

#[tauri::command]
pub async fn notify<R: Runtime>(app: AppHandle<R>, id: u32, title: String, body: String, icon: Option<String>, context: Option<String>) {
    if within_burst_limit() {
        let _ = tauri::async_runtime::spawn_blocking(move || {
            let avatar = if PRIVATE.load(Ordering::SeqCst) { None } else { icon.as_deref().and_then(|url| cached_avatar(&app, url)) };
            if PRIVATE.load(Ordering::SeqCst) { show(app, id, "XRay", "New message · preview hidden", None, None); }
            else { show(app, id, &clip(&title, MAX_TITLE), &clip(&body, MAX_BODY), avatar, context); }
        }).await;
    }
}

fn avatar_url(value: &str) -> Option<tauri::Url> {
    let mut url = tauri::Url::parse(value).ok()?;
    if url.scheme() != "https" || !matches!(url.host_str(),Some("cdn.discordapp.com"|"media.discordapp.net")) || url.port_or_known_default() != Some(443) || !url.username().is_empty() || url.password().is_some() { return None; }
    url.set_host(Some("cdn.discordapp.com")).ok()?;
    let segments: Vec<_> = url.path_segments()?.collect();
    if segments.len()==6 && segments[0]=="guilds" && segments[2]=="users" && segments[4]=="avatars" && [segments[1],segments[3]].iter().all(|id|!id.is_empty() && id.bytes().all(|b|b.is_ascii_digit())) {
        let hash=segments[5].rsplit_once('.')?.0;
        if hash.is_empty() || !hash.bytes().all(|b|b.is_ascii_alphanumeric() || b==b'_'){return None;}
        url.set_path(&format!("/guilds/{}/users/{}/avatars/{hash}.png",segments[1],segments[3]));url.set_query(Some("size=64"));return Some(url);
    }
    if segments.len() == 3 && segments[0] == "embed" && segments[1] == "avatars" && matches!(segments[2], "0.png" | "1.png" | "2.png" | "3.png" | "4.png" | "5.png") { url.set_query(Some("size=64")); return Some(url); }
    if segments.len() != 3 || !matches!(segments[0], "avatars" | "icons" | "channel-icons") || !segments[1].bytes().all(|b| b.is_ascii_digit()) { return None; }
    let hash = segments[2].rsplit_once('.')?.0;
    if hash.is_empty() || !hash.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_') { return None; }
    let path = format!("/{}/{}/{}.png", segments[0], segments[1], hash);
    url.set_path(&path); url.set_query(Some("size=64")); Some(url)
}

fn cached_avatar<R: Runtime>(app: &AppHandle<R>, value: &str) -> Option<PathBuf> {
    use tauri::Manager;
    let url = avatar_url(value)?;
    let dir = app.path().app_cache_dir().ok()?.join("notification-avatars");
    std::fs::create_dir_all(&dir).ok()?;
    let mut hash = std::collections::hash_map::DefaultHasher::new(); url.as_str().hash(&mut hash);
    let path = dir.join(format!("{:x}.png", hash.finish()));
    if path.exists() { return Some(path); }
    let response = ureq::AgentBuilder::new().timeout(Duration::from_secs(5)).redirects(0).build().get(url.as_str()).set("Accept","image/png").call().ok()?;
    let mut bytes = Vec::new(); response.into_reader().take(262_145).read_to_end(&mut bytes).ok()?;
    if bytes.len() > 262_144 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") { return None; }
    let _cache = AVATAR_CACHE.lock().ok()?;
    if path.exists() { return Some(path); }
    trim_avatar_cache(&dir)?;
    std::fs::write(&path, bytes).ok()?; Some(path)
}

/// Make room for the newest sender/server image instead of dropping all new
/// icons once the bounded cache fills. Never remove unrelated cache files.
fn trim_avatar_cache(dir: &std::path::Path) -> Option<()> {
    let mut files: Vec<_> = std::fs::read_dir(dir).ok()?.filter_map(Result::ok).filter_map(|entry| {
        let path = entry.path();
        let stem = path.file_stem()?.to_str()?;
        if path.extension()?.to_str()? != "png" || stem.is_empty() || !stem.bytes().all(|b| b.is_ascii_hexdigit()) { return None; }
        let metadata = entry.metadata().ok()?;
        if !metadata.is_file() { return None; }
        Some((metadata.modified().ok()?, path))
    }).collect();
    files.sort();
    let remove = files.len().saturating_sub(63);
    for (_,path) in files.into_iter().take(remove) { std::fs::remove_file(path).ok()?; }
    Some(())
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
fn show<R: Runtime>(app: AppHandle<R>, id: u32, title: &str, body: &str, avatar: Option<PathBuf>, context: Option<String>) {
    use tauri_winrt_notification::{Duration as Shown, IconCrop, Toast};
    use tauri::Manager;

    let aumid = app.config().identifier.clone();
    let fallback = app.path().app_data_dir().ok().map(|dir| dir.join("notification-icon.png"));
    let icon_path = avatar.or(fallback).filter(|path| path.exists());
    let mut toast = Toast::new(&aumid)
        .title(title)
        .text1(body)
        .text2(&context.map(|value|clip(&value,120)).unwrap_or_else(||"XRay · Open conversation".into()))
        // Discord plays its own notification sound.
        .sound(None)
        .duration(Shown::Short)
        .on_activated(move |_| {
            crate::window::show(&app);
            crate::window::eval(&app, &format!("window.__xray && window.__xray.notificationClicked({id})"));
            Ok(())
        });
    if let Some(path) = icon_path { toast = toast.icon(&path, IconCrop::Circular, "Sender"); }
    if let Err(err) = toast.show() {
        eprintln!("xray: couldn't show a notification: {err}");
    }
}

#[cfg(not(windows))]
fn show<R: Runtime>(_app: AppHandle<R>, _id: u32, _title: &str, _body: &str, _avatar: Option<PathBuf>, _context: Option<String>) {}

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
    let _ = key.set_value("DisplayName", &"XRay");
    let Ok(dir) = app.path().app_data_dir() else { return };
    let icon = dir.join("notification-icon.png");
    if fs::create_dir_all(&dir).is_ok() && fs::write(&icon, ICON).is_ok() {
        let _ = key.set_value("IconUri", &icon.to_string_lossy().into_owned());
    }
}

#[cfg(not(windows))]
pub fn register<R: Runtime>(_app: &AppHandle<R>) {}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn notification_avatars_are_narrow_and_bounded() {
        assert_eq!(avatar_url("https://cdn.discordapp.com/avatars/123/a_abc.webp?size=1024").unwrap().as_str(), "https://cdn.discordapp.com/avatars/123/a_abc.png?size=64");
        assert!(avatar_url("https://cdn.discordapp.com/embed/avatars/0.png").is_some());
        assert_eq!(avatar_url("https://cdn.discordapp.com/guilds/123/users/456/avatars/abc.webp?size=128").unwrap().as_str(),"https://cdn.discordapp.com/guilds/123/users/456/avatars/abc.png?size=64");
        assert!(avatar_url("https://cdn.discordapp.com/embed/avatars/5.png").is_some());
        assert!(avatar_url("https://cdn.discordapp.com/embed/avatars/6.png").is_none());
        for value in ["http://cdn.discordapp.com/avatars/123/abc.png", "https://127.0.0.1/avatars/123/abc.png", "https://cdn.discordapp.com@evil.test/avatars/123/abc.png", "https://cdn.discordapp.com/attachments/123/abc.png", "https://cdn.discordapp.com:444/avatars/123/abc.png"] {
            assert!(avatar_url(value).is_none());
        }
        assert_eq!(clip("ééé", 2), "éé…");
    }
    #[test]
    fn full_avatar_cache_makes_room_without_removing_unrelated_files() {
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let dir = std::env::temp_dir().join(format!("xray-avatar-test-{nonce}"));
        std::fs::create_dir(&dir).unwrap();
        for index in 0..65 { std::fs::write(dir.join(format!("{index:x}.png")),b"test").unwrap(); }
        let unrelated = dir.join("keep-user-file.txt"); std::fs::write(&unrelated,b"keep").unwrap();
        trim_avatar_cache(&dir).unwrap();
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(),64);
        assert!(unrelated.exists());
        for entry in std::fs::read_dir(&dir).unwrap() { std::fs::remove_file(entry.unwrap().path()).unwrap(); }
        std::fs::remove_dir(dir).unwrap();
    }
}
