//! The main window: Discord's web app with xray's core injected before any of
//! Discord's scripts run. The window stays on Discord; every other link opens
//! in your default browser.

use tauri::webview::NewWindowResponse;
use tauri::window::Color;
use tauri::{AppHandle, Manager, Runtime, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

pub const MAIN: &str = "main";
/// Passed by the launch-at-login entry, so startup can tell it apart from a normal launch.
pub const AUTOSTART_ARG: &str = "--autostart";

const DISCORD_APP: &str = "https://discord.com/app";
/// Built by `npm run core:build` (see core/build.mjs).
const CORE: &str = include_str!("../inject/core.js");
/// Equicord's plugins, built by `npm run equicord:build` (see equicord/README.md).
/// It runs first, so its webpack patcher is in place before Discord's scripts,
/// and xray's core then rides on it.
const EQUICORD: &str = include_str!("../inject/equicord.js");
/// Autoplay lets call sounds play without a click first. The disabled features
/// are WebView2 pop-up UI that a chat app doesn't need.
const BROWSER_ARGS: &str = "--autoplay-policy=no-user-gesture-required --disable-features=msWebOOUI,msPdfOOUI";

pub fn create<R: Runtime>(app: &AppHandle<R>, visible: bool) -> tauri::Result<()> {
    let url = WebviewUrl::External(Url::parse(DISCORD_APP).expect("DISCORD_APP is a valid URL"));
    let nav_app = app.clone();
    let popup_app = app.clone();
    let mut builder = WebviewWindowBuilder::new(app, MAIN, url)
        .title("xray")
        .inner_size(1280.0, 820.0)
        .min_inner_size(940.0, 600.0)
        .visible(visible)
        .theme(Some(tauri::Theme::Dark))
        // Frameless: xray draws its own title bar (the themed bar with the
        // window buttons) over Discord's own. The shadow keeps Windows'
        // resize borders and drop shadow on an undecorated window.
        .decorations(false)
        .shadow(true)
        .background_color(Color(6, 6, 7, 255));
    // Debug builds only: XRAY_TEST_WINDOW=offscreen opens the window off-screen
    // and unfocused, so automated tests never pop up over whatever you're doing.
    let offscreen = is_offscreen_test();
    builder = if offscreen {
        builder.position(OFFSCREEN.0, OFFSCREEN.1).focused(false).skip_taskbar(true)
    } else {
        builder.center()
    };
    let window = builder
        .initialization_script(EQUICORD)
        .initialization_script(CORE)
        .additional_browser_args(BROWSER_ARGS)
        .on_navigation(move |url| {
            if is_discord(url) {
                return true;
            }
            open_in_browser(&nav_app, url);
            false
        })
        .on_document_title_changed(|window, title| crate::badge::update(&window, &title))
        .on_new_window(move |url, _features| {
            // Discord's pop-out windows start as about:blank and the page writes into them.
            if url.as_str() == "about:blank" {
                return NewWindowResponse::Allow;
            }
            open_in_browser(&popup_app, &url);
            NewWindowResponse::Deny
        })
        .build()?;
    if offscreen {
        // Windows ignores the builder's off-screen position and cascades the
        // window onto the screen, so move it again now that it exists. This
        // doesn't activate it or change its z-order.
        window.set_position(tauri::PhysicalPosition::new(OFFSCREEN.0 as i32, OFFSCREEN.1 as i32))?;
    }
    Ok(())
}

/// Far left of any monitor layout: where the test window lives.
const OFFSCREEN: (f64, f64) = (-4000.0, 0.0);

/// Brings the window back from the tray or the taskbar and focuses it.
/// Debug builds only: `XRAY_TEST_WINDOW=offscreen`, for automated tests.
pub fn is_offscreen_test() -> bool {
    cfg!(debug_assertions) && std::env::var("XRAY_TEST_WINDOW").as_deref() == Ok("offscreen")
}

pub fn show<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Hides the window when it's on screen, otherwise shows it.
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN) else { return };
    let on_screen = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
    if on_screen {
        let _ = window.hide();
    } else {
        show(app);
    }
}

/// Runs a snippet in Discord's page, for tray actions like opening the xray panel.
pub fn eval<R: Runtime>(app: &AppHandle<R>, js: &str) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.eval(js);
    }
}

fn is_discord(url: &Url) -> bool {
    url.scheme() == "https"
        && url
            .host_str()
            .is_some_and(|host| host == "discord.com" || host.ends_with(".discord.com"))
}

fn open_in_browser<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    if matches!(url.scheme(), "http" | "https") {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}
