//! Unread badge. Discord's page title starts with "(3)" when you have three
//! unread mentions or DMs. xray mirrors that count with a red dot on the tray
//! icon and the taskbar button, and a count in the tray tooltip. It also
//! flashes the taskbar when new mentions arrive while xray isn't focused.

use std::{collections::HashMap,sync::{Mutex,LazyLock}};

use tauri::image::Image;
use tauri::{Manager, Runtime, UserAttentionType, WebviewWindow};

use crate::tray;

const TRAY_MENTION: &[u8] = include_bytes!("../icons/tray-mention.png");
const TASKBAR_DOT: &[u8] = include_bytes!("../icons/overlay-mention.png");

static COUNTS:LazyLock<Mutex<HashMap<String,u32>>>=LazyLock::new(||Mutex::new(HashMap::new()));

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
    let (previous,total)=match COUNTS.lock(){Ok(mut counts)=>record(&mut counts,window.label(),count),Err(_)=>return};
    if count == previous {
        return;
    }
    let app = window.app_handle();
    update_tray(app,total);
    let _ = window.set_overlay_icon(if count > 0 { Image::from_bytes(TASKBAR_DOT).ok() } else { None });
    if count > previous && !window.is_focused().unwrap_or(false) {
        let _ = window.request_user_attention(Some(UserAttentionType::Informational));
    }
}
fn record(counts:&mut HashMap<String,u32>,label:&str,count:u32)->(u32,u32){let previous=counts.insert(label.into(),count).unwrap_or(0);(previous,counts.values().fold(0u32,|total,value|total.saturating_add(*value)))}
pub fn forget<R:Runtime>(app:&tauri::AppHandle<R>,label:&str){if let Ok(mut counts)=COUNTS.lock(){counts.remove(label);let total=counts.values().fold(0u32,|total,value|total.saturating_add(*value));drop(counts);update_tray(app,total);}}
fn update_tray<R:Runtime>(app:&tauri::AppHandle<R>,count:u32){
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
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]fn counts_are_scoped_to_their_account_window(){let mut counts=HashMap::new();assert_eq!(record(&mut counts,"main",3),(0,3));assert_eq!(record(&mut counts,"account-abc",3),(0,6));assert_eq!(record(&mut counts,"main",3),(3,6));assert_eq!(record(&mut counts,"account-abc",0),(3,3));}

    #[test]
    fn reads_the_count_from_discord_titles() {
        assert_eq!(mentions("(3) Discord | #general | Pixel Garage"), 3);
        assert_eq!(mentions("(12) Discord"), 12);
        assert_eq!(mentions("Discord | #general"), 0);
        assert_eq!(mentions("(beta) Discord"), 0);
        assert_eq!(mentions(""), 0);
    }
}
