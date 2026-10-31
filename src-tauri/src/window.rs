//! The main window: Discord's web app with xray's core injected before any of
//! Discord's scripts run. The window stays on Discord; every other link opens
//! in your default browser.

use tauri::webview::NewWindowResponse;
use tauri::window::Color;
use tauri::{AppHandle, Manager, Runtime, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_dialog::{DialogExt,MessageDialogButtons};

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
    create_account(app,MAIN,None,visible)
}
pub fn create_account<R:Runtime>(app:&AppHandle<R>,label:&str,data:Option<std::path::PathBuf>,visible:bool)->tauri::Result<()> {
    crate::network::validate_environment().map_err(|message|tauri::Error::Io(std::io::Error::new(std::io::ErrorKind::PermissionDenied,message)))?;
    // The isolated native test fixture is unavailable in release builds.
    let fixture=cfg!(debug_assertions)&&std::env::var("XRAY_TEST_WINDOW").as_deref()==Ok("accounts");
    let url = if fixture{WebviewUrl::App("xray-account-test.html".into())}else{WebviewUrl::External(Url::parse(DISCORD_APP).expect("DISCORD_APP is a valid URL"))};
    let nav_app = app.clone();
    let popup_app = app.clone();
    let mut builder = WebviewWindowBuilder::new(app, label, url)
        .title(crate::accounts::title(app,label))
        .inner_size(1280.0, 820.0)
        .min_inner_size(940.0, 600.0)
        .visible(visible)
        .theme(Some(tauri::Theme::Dark))
        // Frameless: xray draws its own title bar (the themed bar with the
        // window buttons) over Discord's own. The shadow keeps Windows'
        // resize borders and drop shadow on an undecorated window.
        .decorations(false)
        .shadow(true)
        // Let Discord handle HTML5 server/folder ordering and file drops.
        // Tauri's default native drop target replaces WebView2's HTML handler.
        .disable_drag_drop_handler()
        .background_color(Color(6, 6, 7, 255));
    // Debug builds only: XRAY_TEST_WINDOW=offscreen opens the window off-screen
    // and unfocused, so automated tests never pop up over whatever you're doing.
    let offscreen = is_offscreen_test();
    if let Some(data)=data { builder=builder.data_directory(data); }
    builder = if offscreen {
        builder.position(OFFSCREEN.0, OFFSCREEN.1).focused(false).skip_taskbar(true)
    } else {
        builder.center()
    };
    if let Some(script) = crate::installer::script(app) { builder = builder.initialization_script(script); }
    let window = builder
        .initialization_script(crate::network::privacy_script())
        .initialization_script(if fixture{""}else{EQUICORD})
        .initialization_script(if fixture{""}else{CORE})
        .additional_browser_args(&crate::graphics::configured_args(app,BROWSER_ARGS))
        .on_navigation(move |url| {
            if is_discord(url)||fixture&&url.host_str()==Some("tauri.localhost") {
                return true;
            }
            open_in_browser(&nav_app, url);
            false
        })
        .on_document_title_changed(|window, title| crate::badge::update(&window, &title))
        // Fail closed until the asynchronous Windows chooser is registered.
        // Do not cancel an already registered request before its deferral runs.
        .on_download(|webview,_|crate::downloads::ready(webview.label()))
        .on_new_window(move |url, _features| {
            // Discord's pop-out windows start as about:blank and the page writes into them.
            if url.as_str() == "about:blank" {
                return NewWindowResponse::Allow;
            }
            open_in_browser(&popup_app, &url);
            NewWindowResponse::Deny
        })
        .build()?;
    crate::downloads::install(&window)?;
    crate::taskbar::install_window(&window);
    let zoom = app.state::<crate::Shell>().0.lock().map(|s| s.zoom).unwrap_or(1.0);
    let _ = window.set_zoom(if zoom.is_finite() { zoom.clamp(0.5,2.0) } else { 1.0 });
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
    if let Some(window) = crate::accounts::current(app) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Hides the window when it's on screen, otherwise shows it.
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = crate::accounts::current(app) else { return };
    let on_screen = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
    if on_screen {
        let _ = window.hide();
    } else {
        show(app);
    }
}

/// Runs a snippet in Discord's page, for tray actions like opening the xray panel.
pub fn eval<R: Runtime>(app: &AppHandle<R>, js: &str) {
    if let Some(window) = crate::accounts::current(app) {
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
 let Ok(url)=external_url(url.as_str())else{return;};
 // Fallback guard for popups/context menus outside the core's anchor handlers.
 let handle=app.clone();let text=format!("Actual website: {}\n\n{}\n\nThis site sees the network address used by your browser. Redirects can change the destination.",url.host_str().unwrap_or(""),url.as_str());
 app.dialog().message(text).title("XRay · Open external website?").buttons(MessageDialogButtons::OkCancelCustom("Open link".into(),"Cancel".into())).show(move|allowed|{if allowed{let owner=handle.clone();tauri::async_runtime::spawn_blocking(move||{if let Err(message)=launch_reviewed(&owner,&url){owner.dialog().message(message).title("XRay · Link kept closed").show(|_|{});}});}});
}
fn external_url(value:&str)->Result<Url,String>{
 let url=Url::parse(value).map_err(|_|"Invalid link")?;
 if value.len()>8192||!matches!(url.scheme(),"https"|"http")||url.host_str().is_none()||!url.username().is_empty()||url.password().is_some(){return Err("Only HTTP(S) links without embedded credentials may open".into());}Ok(url)
}
fn launch_reviewed<R:Runtime>(app:&AppHandle<R>,url:&Url)->Result<(),String>{
 // Strict Tor remains fail-closed. The retired link-only preference cannot
 // redirect normally routed clients away from their Windows default handler.
 if crate::network::tor_enabled(){return crate::network::open_browser(url.as_str());}
 app.opener().open_url(url.as_str(),None::<&str>).map_err(|_|"The browser could not be opened".into())
}
/// A web-only opener after the core's sheet. Not an authorization boundary
/// against scripts already executing inside Discord's web origin.
#[tauri::command]
pub async fn open_reviewed_link(app:AppHandle,url:String)->Result<(),String>{
 let url=external_url(&url)?;tauri::async_runtime::spawn_blocking(move||launch_reviewed(&app,&url)).await.map_err(|_|"Browser launch failed".to_string())?
}

/// Native page zoom scales Discord and the closed-shadow UI together.
#[tauri::command]
pub fn change_zoom(app: AppHandle, window:tauri::WebviewWindow, step: i32) -> Result<f64,String> {
    if ![-1,0,1].contains(&step) { return Err("Invalid zoom step".into()); }
    let state=app.state::<crate::Shell>();
    let mut settings=state.0.lock().map_err(|_|"Settings unavailable")?;
    let value=next_zoom(settings.zoom,step);
    window.set_zoom(value).map_err(|e|e.to_string())?;
    settings.zoom=value;crate::settings::save(&app,&settings);Ok(value)
}
fn next_zoom(current:f64,step:i32)->f64 {
    if step==0 {return 1.0;}
    let current=if current.is_finite(){current}else{1.0};
    ((current*10.0).round()+step as f64).clamp(5.0,20.0)/10.0
}
#[cfg(test)] mod zoom_tests { use super::*;
 #[test] fn external_links_do_not_accept_files_scripts_or_credentials(){for value in ["file:///C:/secret","javascript:alert(1)","https://name:secret@example.com",""]{assert!(external_url(value).is_err());}assert!(external_url("https://example.com/path").is_ok());}
 #[test] fn zoom_limits_reset_and_invalid_saved_value(){assert_eq!(next_zoom(1.0,1),1.1);assert_eq!(next_zoom(0.5,-1),0.5);assert_eq!(next_zoom(2.0,1),2.0);assert_eq!(next_zoom(1.7,0),1.0);assert_eq!(next_zoom(f64::NAN,1),1.1);}
}
