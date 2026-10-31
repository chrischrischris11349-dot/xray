//! Isolated account sessions. Tabs switch retained WebViews; cookies/tokens are
//! never read, copied, exported or handed from one account to another.
use std::{fs,sync::{Mutex,Condvar,atomic::{AtomicU64,Ordering}}};
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use tauri::{AppHandle,Manager,Runtime,WebviewWindow};
const MAX:usize=6;
static NEXT:AtomicU64=AtomicU64::new(0);
#[derive(Clone,Serialize,Deserialize)]struct Tab{id:String,name:String,open:bool}
#[derive(Clone,Serialize,Deserialize)]struct Config{active:String,tabs:Vec<Tab>}
impl Default for Config{fn default()->Self{Self{active:"main".into(),tabs:vec![Tab{id:"main".into(),name:"Main".into(),open:true}]}}}
struct Preparation{id:u64,pending:std::collections::HashSet<String>,failed:bool}
impl Preparation{fn acknowledge(&mut self,caller:&str,request:Option<u64>,ready:bool){if Some(self.id)==request&&self.pending.remove(caller){self.failed|=!ready;}}}
pub struct Accounts(Mutex<Config>,Mutex<Option<Preparation>>,Condvar,Mutex<()>);
fn valid_id(id:&str)->bool{id=="main"||id.strip_prefix("account-").is_some_and(|tail|!tail.is_empty()&&tail.len()<=40&&tail.bytes().all(|b|b.is_ascii_hexdigit()))}
fn clean(mut config:Config)->Config{
 if config.tabs.is_empty()||config.tabs.len()>MAX||!config.tabs.iter().any(|tab|tab.id=="main"){return Config::default();}
 let mut ids=std::collections::HashSet::new();
 if config.tabs.iter().any(|tab|!valid_id(&tab.id)||!ids.insert(tab.id.clone())||tab.name.trim().is_empty()||tab.name.chars().count()>32||tab.name.chars().any(char::is_control)){return Config::default();}
 for tab in &mut config.tabs{if tab.id=="main"{tab.open=true;}}
 if !config.tabs.iter().any(|tab|tab.id==config.active&&tab.open){config.active="main".into();}config
}
fn persist<R:Runtime>(app:&AppHandle<R>,config:&Config)->Result<(),String>{
 let dir=app.path().app_config_dir().map_err(|_|"Account settings are unavailable")?;
 fs::create_dir_all(&dir).map_err(|_|"Could not create account settings")?;
 let path=dir.join("account-tabs.json");let staged=dir.join("account-tabs.tmp");
 let data=serde_json::to_vec_pretty(config).map_err(|_|"Could not save account tabs")?;
 fs::write(&staged,data).and_then(|_|fs::rename(staged,path)).map_err(|_|"Could not save account tabs. Check disk space.".into())
}
pub fn initialize<R:Runtime>(app:&AppHandle<R>){
 let config=app.path().app_config_dir().ok().and_then(|dir|fs::read(dir.join("account-tabs.json")).ok()).filter(|data|data.len()<16384).and_then(|data|serde_json::from_slice(&data).ok()).map(clean).unwrap_or_default();app.manage(Accounts(Mutex::new(config),Mutex::new(None),Condvar::new(),Mutex::new(())));
}
pub async fn prepare<R:Runtime>(app:&AppHandle<R>,only:Option<String>)->Result<(),String>{
 let owner=app.clone();tauri::async_runtime::spawn_blocking(move||{
  let windows:Vec<_>=owner.webview_windows().into_iter().filter(|(label,_)|is_account(label)&&only.as_ref().is_none_or(|id|id==label)).collect();
  let state=owner.state::<Accounts>();let id=NEXT.fetch_add(1,Ordering::SeqCst);
  {let mut slot=state.1.lock().map_err(|_|"Account save status unavailable")?;if slot.is_some(){return Err("Another account save or restart is in progress".into());}*slot=Some(Preparation{id,pending:windows.iter().map(|(label,_)|label.clone()).collect(),failed:false});}
  for(_,window)in windows{let _=window.eval(&format!("window.__xray?.prepareAccountRestart?.({id})"));}
  let slot=state.1.lock().map_err(|_|"Account save status unavailable")?;
  let(mut slot,_)=state.2.wait_timeout_while(slot,std::time::Duration::from_secs(15),|slot|slot.as_ref().is_some_and(|item|!item.pending.is_empty()&&!item.failed)).map_err(|_|"Account save status unavailable")?;
  let result=slot.take().ok_or("Account save status unavailable")?;
  if result.failed{return Err("An account is recording or could not save pending history. Finish saving it before closing or restarting.".into());}
  if !result.pending.is_empty(){return Err("An account is still loading or saving. Wait and retry; no restart was started.".into());}Ok(())
 }).await.map_err(|_|"Could not prepare account sessions".to_string())?
}
pub fn is_account(label:&str)->bool{valid_id(label)}
pub fn active<R:Runtime>(app:&AppHandle<R>)->String{app.state::<Accounts>().0.lock().map(|state|state.active.clone()).unwrap_or_else(|_|"main".into())}
pub fn title<R:Runtime>(app:&AppHandle<R>,id:&str)->String{app.state::<Accounts>().0.lock().ok().and_then(|state|state.tabs.iter().find(|tab|tab.id==id).map(|tab|format!("XRay · {}",tab.name))).unwrap_or_else(||"XRay".into())}
pub fn current<R:Runtime>(app:&AppHandle<R>)->Option<WebviewWindow<R>>{app.get_webview_window(&active(app)).or_else(||app.get_webview_window("main"))}
fn changed<R:Runtime>(app:&AppHandle<R>){for(label,window)in app.webview_windows(){if is_account(&label){let _=window.eval("window.__xray?.refreshAccountTabs?.()");}}}
fn snapshot<R:Runtime>(app:&AppHandle<R>,caller:&str)->Result<Value,String>{let state=app.state::<Accounts>();let state=state.0.lock().map_err(|_|"Account tabs unavailable")?;Ok(json!({"current":caller,"active":state.active,"limit":MAX,"tabs":state.tabs.iter().map(|tab|json!({"id":tab.id,"name":tab.name,"open":app.get_webview_window(&tab.id).is_some()})).collect::<Vec<_>>()}))}
fn ensure<R:Runtime>(app:&AppHandle<R>,id:&str)->Result<(),String>{
 if app.get_webview_window(id).is_some(){return Ok(());}
 if id=="main"{return Err("Main account window is unavailable. Restart XRay.".into());}
 let data=app.path().app_local_data_dir().map_err(|_|"Account storage is unavailable")?.join("account-sessions").join(id);
 crate::window::create_account(app,id,Some(data),false).map_err(|_|"Could not open this account session. Its saved login was kept.".into())
}
pub fn activate<R:Runtime>(app:&AppHandle<R>,id:&str)->Result<(),String>{
 // Concurrent notifications, initial page loads and tab clicks must not race
 // their show/hide operations and leave the chosen account's window hidden.
 let state=app.state::<Accounts>();let _transition=state.3.lock().map_err(|_|"An account switch could not complete. Retry.")?;
 {let state=app.state::<Accounts>();let state=state.0.lock().map_err(|_|"Account tabs unavailable")?;if !state.tabs.iter().any(|tab|tab.id==id){return Err("Unknown account tab".into());}}
 ensure(app,id)?;let next=app.get_webview_window(id).ok_or("Account window unavailable")?;
 let old=current(app);
 if let Some(old)=old.filter(|old|old.label()!=id){let maxed=old.is_maximized().unwrap_or(false);if let Ok(position)=old.outer_position(){let _=next.set_position(position);}if let Ok(size)=old.inner_size(){let _=next.set_size(size);}if maxed{let _=next.maximize();}else{let _=next.unmaximize();}}
 {let state=app.state::<Accounts>();let mut state=state.0.lock().map_err(|_|"Account tabs unavailable")?;let mut config=state.clone();config.active=id.into();if let Some(tab)=config.tabs.iter_mut().find(|tab|tab.id==id){tab.open=true;}persist(app,&config)?;*state=config;}
 next.show().map_err(|_|"Could not show this account")?;let _=next.unminimize();let _=next.set_focus();
 for(label,window)in app.webview_windows(){if is_account(&label)&&label!=id{let _=window.hide();}}
 changed(app);Ok(())
}
pub fn restore<R:Runtime>(app:&AppHandle<R>,visible:bool){
 let tabs=app.state::<Accounts>().0.lock().map(|state|state.tabs.clone()).unwrap_or_default();
 for tab in tabs.iter().filter(|tab|tab.open&&tab.id!="main"){let _=ensure(app,&tab.id);}
 if visible{if activate(app,&active(app)).is_err(){let _=activate(app,"main");}}
}
pub fn quit<R:Runtime>(app:&AppHandle<R>){let owner=app.clone();tauri::async_runtime::spawn(async move{match prepare(&owner,None).await{Ok(())=>owner.exit(0),Err(message)=>{use tauri_plugin_dialog::DialogExt;owner.dialog().message(message).title("XRay · Finish saving before quitting").show(|_|{});}}});}
#[tauri::command]
pub async fn account_sessions(app:AppHandle,window:WebviewWindow,action:String,id:Option<String>,name:Option<String>,request:Option<u64>,ready:Option<bool>)->Result<Value,String>{
 if !is_account(window.label()){return Err("Account tabs are available only in XRay's Discord sessions".into());}
 match action.as_str(){
  "get"=>{},
  "ready"=>{let state=app.state::<Accounts>();let mut slot=state.1.lock().map_err(|_|"Account save status unavailable")?;if let Some(item)=slot.as_mut(){item.acknowledge(window.label(),request,ready==Some(true));state.2.notify_all();}},
  "activate"=>activate(&app,id.as_deref().ok_or("Choose an account tab")?)?,
  "add"|"rename"=>{
   let state=app.state::<Accounts>();let mut state=state.0.lock().map_err(|_|"Account tabs unavailable")?;let mut config=state.clone();
   let chosen=if action=="add"{if config.tabs.len()>=MAX{return Err("Up to six account tabs are supported. Reopen an existing tab.".into());}format!("account-{:x}{:x}",std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|"System clock unavailable")?.as_nanos(),NEXT.fetch_add(1,Ordering::SeqCst))}else{id.ok_or("Choose an account tab")?};
   let name=name.unwrap_or_else(||format!("Account {}",config.tabs.len()+1)).trim().to_string();if name.is_empty()||name.chars().count()>32||name.chars().any(char::is_control){return Err("Use an account label of 1–32 characters".into());}
   if action=="add"{config.tabs.push(Tab{id:chosen.clone(),name,open:true});}else{config.tabs.iter_mut().find(|tab|tab.id==chosen).ok_or("Unknown account tab")?.name=name;}
   persist(&app,&config)?;*state=config;drop(state);
   if action=="add"{activate(&app,&chosen)?;}else{if let Some(window)=app.get_webview_window(&chosen){let _=window.set_title(&title(&app,&chosen));}changed(&app);}
  },
  "close"=>{
   let id=id.ok_or("Choose an account tab")?;if id=="main"{return Err("The main tab stays available. Use close to tray to hide XRay.".into());}
   {let state=app.state::<Accounts>();let state=state.0.lock().map_err(|_|"Account tabs unavailable")?;if !state.tabs.iter().any(|tab|tab.id==id){return Err("Unknown account tab".into());}}
   if app.get_webview_window(&id).is_some(){prepare(&app,Some(id.clone())).await?;}
   if active(&app)==id{activate(&app,"main")?;}
   if let Some(window)=app.get_webview_window(&id){window.destroy().map_err(|_|"Could not close this tab")?;}
   let state=app.state::<Accounts>();let mut state=state.0.lock().map_err(|_|"Account tabs unavailable")?;let mut config=state.clone();if let Some(tab)=config.tabs.iter_mut().find(|tab|tab.id==id){tab.open=false;}persist(&app,&config)?;*state=config;drop(state);changed(&app);
  },
  _=>return Err("Unknown account action".into())
 }snapshot(&app,window.label())
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn account_ids_never_become_arbitrary_paths(){for id in ["../main","account-../x","account-","main/child","provider-settings"]{assert!(!valid_id(id));}assert!(valid_id("main"));assert!(valid_id("account-abc123"));}
 #[test]fn corrupt_or_duplicate_tabs_fall_back_without_touching_session_data(){let mut config=Config::default();config.tabs.push(config.tabs[0].clone());assert_eq!(clean(config).tabs.len(),1);let mut config=Config::default();config.active="account-dead".into();assert_eq!(clean(config).active,"main");}
 #[test]fn sessions_restore_labels_and_open_state_without_credentials(){let config=Config{active:"account-abc".into(),tabs:vec![Tab{id:"main".into(),name:"Main".into(),open:true},Tab{id:"account-abc".into(),name:"Test account".into(),open:true}]};let text=serde_json::to_string(&config).unwrap();let restored=clean(serde_json::from_str(&text).unwrap());assert_eq!(restored.active,"account-abc");assert_eq!(restored.tabs[1].name,"Test account");assert!(!text.contains("token"));}
 #[test]fn restart_needs_each_sessions_own_ack_and_rejects_stale_or_replayed_replies(){let mut preparation=Preparation{id:8,pending:["main".into(),"account-abc".into()].into_iter().collect(),failed:false};preparation.acknowledge("account-abc",Some(7),true);assert_eq!(preparation.pending.len(),2);preparation.acknowledge("unknown",Some(8),true);assert_eq!(preparation.pending.len(),2);preparation.acknowledge("main",Some(8),true);preparation.acknowledge("main",Some(8),false);assert!(!preparation.failed);assert_eq!(preparation.pending.len(),1);preparation.acknowledge("account-abc",Some(8),false);assert!(preparation.failed);assert!(preparation.pending.is_empty());}
}
