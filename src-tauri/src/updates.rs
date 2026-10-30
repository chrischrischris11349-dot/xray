//! Signed updates only. The page cannot choose endpoints, installers or signatures.
use std::{sync::Mutex,time::Duration};
use serde_json::{json,Value};
use tauri::{AppHandle,Manager};
use tauri_plugin_updater::{Update,UpdaterExt};
#[derive(Default)]
struct State { update:Option<Update>, bytes:Option<Vec<u8>>, phase:String, downloaded:u64,total:Option<u64>,busy:bool }
#[derive(Default)]
pub struct Updates(Mutex<State>);
fn snapshot(state:&State)->Value{json!({"phase":if state.phase.is_empty(){"idle"}else{&state.phase},"version":state.update.as_ref().map(|u|&u.version),"current":env!("CARGO_PKG_VERSION"),"downloaded":state.downloaded,"total":state.total,"personal":option_env!("XRAY_PERSONAL_BUILD")==Some("1")})}
#[tauri::command]
pub async fn app_update(app:AppHandle,action:String)->Result<Value,String>{
 let shared=app.state::<Updates>();
 if action=="status" {return shared.0.lock().map(|s|snapshot(&s)).map_err(|_|"Update state unavailable".into());}
 if crate::network::tor_enabled()&&["check","download"].contains(&action.as_str()){return Err("Strict Tor mode pauses the native updater. Download the signed installer through your Tor-configured Firefox; no direct update request was sent.".into());}
 if !["check","download","apply"].contains(&action.as_str()){return Err("Invalid update action".into());}
 {let mut state=shared.0.lock().map_err(|_|"Update state unavailable")?;if state.busy{return Err("An update operation is already running".into());}state.busy=true;state.phase=if action=="check"{"checking"}else if action=="download"{"downloading"}else{"installing"}.into();}
 let result=operate(&app,&action).await;
 let mut state=shared.0.lock().map_err(|_|"Update state unavailable")?;state.busy=false;
 if result.is_err(){state.phase="failed".into();}result?;Ok(snapshot(&state))
}
async fn operate(app:&AppHandle,action:&str)->Result<(),String>{
 if action=="check"{
  let mut builder=app.updater_builder().timeout(Duration::from_secs(60));
  if option_env!("XRAY_PERSONAL_BUILD")==Some("1"){
   let settings=crate::settings::load(app);let mut endpoint=tauri::Url::parse(&settings.sync_endpoint).map_err(|_|"Set up your private server for personal-build updates")?;
   if endpoint.scheme()!="https"||!endpoint.username().is_empty()||endpoint.password().is_some()||endpoint.query().is_some()||endpoint.fragment().is_some()||settings.sync_token.is_empty(){return Err("Set up private HTTPS storage for personal-build updates".into());}
   endpoint.set_path(&format!("{}/updates/personal.json",endpoint.path().trim_end_matches('/')));
   builder=builder.endpoints(vec![endpoint]).map_err(|_|"Invalid private update endpoint")?.header("Authorization",format!("Bearer {}",settings.sync_token)).map_err(|_|"Invalid private update configuration")?;
  }
  let update=builder.build().map_err(|_|"Updater configuration is unavailable")?.check().await.map_err(|_|"Update feed unavailable. Retry later or use the matching installer")?;
  let state=app.state::<Updates>();let mut state=state.0.lock().map_err(|_|"Update state unavailable")?;state.phase=if update.is_some(){"available"}else{"current"}.into();state.update=update;state.bytes=None;state.downloaded=0;state.total=None;return Ok(());
 }
 let update={let state=app.state::<Updates>();let state=state.0.lock().map_err(|_|"Update state unavailable")?;state.update.clone().ok_or("Check for an available update first")?};
 if action=="download"{
  let progress=app.clone();let bytes=update.download(move|chunk,total|{let state=progress.state::<Updates>();if let Ok(mut state)=state.0.lock(){state.downloaded+=chunk as u64;state.total=total;};},||{}).await.map_err(|_|"Update download or signature verification failed. Nothing was installed")?;
  if bytes.len()>100*1024*1024{return Err("Update exceeds the 100 MB installer limit".into());}
  let state=app.state::<Updates>();let mut state=state.0.lock().map_err(|_|"Update state unavailable")?;state.bytes=Some(bytes);state.phase="ready".into();return Ok(());
 }
 let bytes={let state=app.state::<Updates>();let mut state=state.0.lock().map_err(|_|"Update state unavailable")?;state.bytes.take().ok_or("Download and verify the update before applying it")?};
 update.install(bytes).map_err(|_|"Could not launch the signed update installer")?;
 #[cfg(not(windows))] app.restart();
 Ok(())
}
#[cfg(test)]
mod tests{
 #[test]
 fn status_never_exposes_installer_bytes(){let state=super::State{phase:"ready".into(),bytes:Some(b"private installer contents".to_vec()),downloaded:25,total:Some(100),..Default::default()};let result=super::snapshot(&state);assert_eq!(result["phase"],"ready");assert_eq!(result["downloaded"],25);assert!(!result.to_string().contains("private installer"));assert!(result.get("bytes").is_none());}
}
