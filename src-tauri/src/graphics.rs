//! A local graphics preference, never a general browser-flags interface.
use serde_json::{json,Value};
use tauri::{AppHandle,Manager,Runtime};
pub struct Graphics { pub active:bool }

pub fn browser_args(base:&str,enabled:bool)->String {
    if enabled { base.into() } else { format!("{base} --disable-gpu") }
}
pub fn configured_args<R:Runtime>(app:&AppHandle<R>,base:&str)->String {
    crate::network::browser_args(&browser_args(base,app.state::<Graphics>().active))
}
fn snapshot(enabled:bool,active:bool,external:&str)->Value {
    let external=external.to_ascii_lowercase();
    let external_override=["--disable-gpu","--use-angle","--use-gl"].iter().any(|flag|external.contains(flag));
    json!({"enabled":enabled,"active":active,"restartRequired":enabled!=active,"externalOverride":external_override})
}
#[tauri::command]
pub async fn graphics_settings(app:AppHandle,action:String,enabled:Option<bool>)->Result<Value,String> {
    if action=="restart" {crate::accounts::prepare(&app,None).await?;app.restart();}
    if !["get","set"].contains(&action.as_str()){return Err("Invalid graphics action".into());}
    let shared=app.state::<crate::Shell>();let mut settings=shared.0.lock().map_err(|_|"Graphics settings are unavailable")?;
    if action=="set" {
        let requested=enabled.ok_or("Choose a hardware acceleration preference")?;
        let mut next=settings.clone();next.hardware_acceleration=requested;
        crate::settings::save_checked(&app,&next)?;*settings=next;
    }
    Ok(snapshot(settings.hardware_acceleration,app.state::<Graphics>().active,&std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default()))
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn automatic_gpu_preserves_normal_flags_and_software_mode_is_explicit(){
        assert_eq!(browser_args("--autoplay-policy=no-user-gesture-required",true),"--autoplay-policy=no-user-gesture-required");
        assert_eq!(browser_args("",false).trim(),"--disable-gpu");
        assert!(!browser_args("",true).contains("ignore-gpu-blocklist"));
    }
    #[test] fn only_graphics_state_is_exposed_and_saved_state_requires_a_restart(){
        let result=snapshot(false,true,"--disable-gpu --unrelated-secret=private");
        assert_eq!(result["restartRequired"],true);assert_eq!(result["externalOverride"],true);assert_eq!(result.as_object().unwrap().len(),4);assert!(!result.to_string().contains("private"));
        assert_eq!(snapshot(false,false,"")["restartRequired"],false);
    }
}
