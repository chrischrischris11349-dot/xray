//! Unread badge. Discord's page title starts with "(3)" when you have three
//! unread mentions or DMs. xray mirrors that count with a red dot on the tray
//! icon and the taskbar button, and a count in the tray tooltip. It also
//! flashes the taskbar when new mentions arrive while xray isn't focused.

use std::sync::atomic::{AtomicU32, Ordering};

use tauri::image::Image;
use tauri::{Manager, Runtime, UserAttentionType, WebviewWindow};

use crate::tray;

const TRAY_MENTION: &[u8] = include_bytes!("../icons/tray-mention.png");
const TASKBAR_DOT: &[u8] = include_bytes!("../icons/overlay-mention.png");

static SHOWN: AtomicU32 = AtomicU32::new(0);

/// The mention count at the start of a title like "(3) Discord | #general".
fn mentions(title: &str) -> u32 {
    title
        .trim_start()
        .strip_prefix('(')
        .and_then(|rest| rest.split_once(')'))
        .and_then(|(count, _)| count.trim().parse().ok())
        .unwrap_or(0)
}

pub fn update<R: Runtime>(window: &WebviewWindow<R>, title: &str) {
    let count = mentions(title);
    let previous = SHOWN.swap(count, Ordering::Relaxed);
    if count == previous {
        return;
    }
    let app = window.app_handle();
    if let Some(icon) = app.tray_by_id(tray::ID) {
        let image = if count > 0 {
            Image::from_bytes(TRAY_MENTION).ok()
        } else {
            app.default_window_icon().cloned()
        };
        let _ = icon.set_icon(image);
        let tooltip = if count > 0 { format!("xray · {count} unread") } else { "xray".to_owned() };
        let _ = icon.set_tooltip(Some(tooltip));
    }
    let _ = window.set_overlay_icon(if count > 0 { Image::from_bytes(TASKBAR_DOT).ok() } else { None });
    if count > previous && !window.is_focused().unwrap_or(false) {
        let _ = window.request_user_attention(Some(UserAttentionType::Informational));
    }
}

#[cfg(test)]
mod tests {
    use super::mentions;

    #[test]
    fn reads_the_count_from_discord_titles() {
        assert_eq!(mentions("(3) Discord | #general | Pixel Garage"), 3);
        assert_eq!(mentions("(12) Discord"), 12);
        assert_eq!(mentions("Discord | #general"), 0);
        assert_eq!(mentions("(beta) Discord"), 0);
        assert_eq!(mentions(""), 0);
    }
}
