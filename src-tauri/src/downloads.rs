//! Explicit Save As only: the web page supplies content, never a filesystem path.
use std::{fs::{self, OpenOptions}, io::{Read, Write},  sync::atomic::{AtomicBool,AtomicU64,Ordering}, time::Duration};
use tauri::{AppHandle,Manager};
use tauri_plugin_dialog::DialogExt;
static BUSY:AtomicBool=AtomicBool::new(false);
static NEXT:AtomicU64=AtomicU64::new(1);
const MAX:u64=250*1024*1024;
struct Guard;
impl Drop for Guard{fn drop(&mut self){BUSY.store(false,Ordering::SeqCst);}}

// Keep WebView2 COM objects on their owning UI thread. Only the numeric request
// id and selected path cross threads through the dialog completion callback.
#[cfg(windows)]
mod browser_downloads {
 use super::*;
 use std::{cell::RefCell,path::PathBuf};
 use tauri::{Runtime,WebviewWindow};
 use windows::core::{Interface,HSTRING,PWSTR};
 use webview2_com::{DownloadStartingEventHandler,take_pwstr,Microsoft::Web::WebView2::Win32::{ICoreWebView2_4,ICoreWebView2DownloadStartingEventArgs,ICoreWebView2Deferral}};
 struct Pending {id:u64,args:ICoreWebView2DownloadStartingEventArgs,deferral:ICoreWebView2Deferral,_guard:Guard}
 impl Drop for Pending {fn drop(&mut self){unsafe{let _=self.deferral.Complete();}}}
 thread_local!{static PENDING:RefCell<Option<Pending>>=const{RefCell::new(None)};static READY:RefCell<std::collections::HashSet<String>>=RefCell::new(std::collections::HashSet::new());}
 pub fn ready(label:&str)->bool{READY.with(|labels|labels.borrow().contains(label))}
 pub fn forget(label:&str){READY.with(|labels|{labels.borrow_mut().remove(label);});}
 #[cfg(test)]mod lifecycle_tests{use super::*;#[test]fn reopened_sessions_wait_for_a_new_save_chooser(){READY.with(|labels|{labels.borrow_mut().insert("account-abcd".into());});assert!(ready("account-abcd"));forget("account-abcd");assert!(!ready("account-abcd"));}}

 fn complete(id:u64,path:Option<PathBuf>){
  PENDING.with(|slot|{
   let mut slot=slot.borrow_mut();
   if slot.as_ref().is_none_or(|pending|pending.id!=id){return;}
   let pending=slot.take().unwrap();drop(slot);
   // Cancel stays true on cancellation, an invalid path, or a failed path write.
   if let Some(path)=path.filter(|path|path.is_absolute()) {unsafe{
    if pending.args.SetResultFilePath(&HSTRING::from(path.as_os_str())).is_ok(){let _=pending.args.SetCancel(false);}
   }}
   drop(pending);
  });
 }

 pub fn install<R:Runtime>(window:&WebviewWindow<R>)->tauri::Result<()>{
  let app=window.app_handle().clone();let parent=window.clone();
  window.with_webview(move|platform|{
   let error_parent=parent.clone();
   let label=parent.label().to_string();
   let registered=(||->windows::core::Result<()>{unsafe{
    let view:ICoreWebView2_4=platform.controller().CoreWebView2()?.cast()?;let mut token=0;
    view.add_DownloadStarting(&DownloadStartingEventHandler::create(Box::new(move|_,args|{
     let Some(args)=args else{return Ok(())};
     #[cfg(debug_assertions)]eprintln!("XRay QA: native download request received");
     args.SetCancel(true)?;args.SetHandled(true)?;
     if BUSY.swap(true,Ordering::SeqCst){return Ok(())}
     let guard=Guard;let deferral=args.GetDeferral()?;
     let mut suggested=PWSTR::null();let name=if args.ResultFilePath(&mut suggested).is_ok(){
      let path=PathBuf::from(take_pwstr(suggested));filename(&path.file_name().unwrap_or_default().to_string_lossy())
     }else{"download".into()};
     let id=NEXT.fetch_add(1,Ordering::SeqCst);
     PENDING.with(|slot|*slot.borrow_mut()=Some(Pending{id,args,deferral,_guard:guard}));
     // The plugin's asynchronous dialog returns before the WebView2 event ends.
     // The native download retains its cookies/blob and streams directly to the
     // chosen file; it is not fetched again or copied through JavaScript/IPC.
     let owner=app.clone();
     app.dialog().file().set_parent(&parent).set_title("Save file as").set_file_name(name).save_file(move|selected|{
      #[cfg(debug_assertions)]eprintln!("XRay QA: save chooser completed, selected={}",selected.is_some());
      let path=selected.and_then(|selected|selected.into_path().ok());
      let _=owner.run_on_main_thread(move||complete(id,path));
     });
     Ok(())
    })),&mut token)?;READY.with(|labels|{labels.borrow_mut().insert(label);});Ok(())
   }})();
   if registered.is_err(){error_parent.app_handle().dialog().message("Save As could not initialize. Downloads were kept closed; restart XRay and check the WebView2 runtime.").title("XRay · Save As unavailable").show(|_|{});}
  })
 }
}
#[cfg(windows)]pub use browser_downloads::install;
#[cfg(windows)]pub use browser_downloads::ready;
#[cfg(windows)]pub use browser_downloads::forget;
#[cfg(not(windows))]pub fn install<R:tauri::Runtime>(_:&tauri::WebviewWindow<R>)->tauri::Result<()>{Ok(())}
#[cfg(not(windows))]pub fn ready(_:&str)->bool{false}
#[cfg(not(windows))]pub fn forget(_:&str){}
pub(crate) fn filename(raw:&str)->String{
 let value:String=raw.chars().filter(|c|!c.is_control()&&!"<>:\"/\\|?*".contains(*c)).take(180).collect();
 let value=value.trim().trim_matches('.');
 let stem=value.split('.').next().unwrap_or("").to_ascii_uppercase();
 if value.is_empty()||["CON","PRN","AUX","NUL","COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9","LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9"].contains(&stem.as_str()){return "download".into();}
 value.into()
}
fn source(raw:&str)->Result<tauri::Url,String>{
 let url=tauri::Url::parse(raw).map_err(|_|"Invalid download URL")?;
 if raw.len()>8192||!url.username().is_empty()||url.password().is_some()||url.port().is_some_and(|p|p!=443){return Err("Use a public HTTPS download without credentials".into());}
 crate::webfetch::check_public(&url)?;Ok(url)
}
#[tauri::command]
pub async fn save_file_as(app:AppHandle,window:tauri::WebviewWindow,name:String,url:Option<String>,text:Option<String>)->Result<bool,String>{
 if url.is_some()==text.is_some(){return Err("Choose a file URL or report text".into());}
 if text.as_ref().is_some_and(|value|value.len()>10*1024*1024){return Err("Report export is limited to 10 MB".into());}
 let remote=url.as_deref().map(source).transpose()?;
 if BUSY.swap(true,Ordering::SeqCst){return Err("A Save As dialog or download is already open".into());}
 tauri::async_runtime::spawn_blocking(move||{
  let _guard=Guard;
  let mut dialog=app.dialog().file().set_title("Save copy as").set_file_name(filename(&name));
  dialog=dialog.set_parent(&window);
  let Some(selected)=dialog.blocking_save_file()else{return Ok(false)};
  let path=selected.into_path().map_err(|_|"Select a local file destination")?;
  let parent=path.parent().ok_or("Select a destination folder")?;
  let partial=parent.join(format!(".xray-download-{}-{}.part",std::process::id(),NEXT.fetch_add(1,Ordering::SeqCst)));
  let result=(||{
   let mut output=OpenOptions::new().write(true).create_new(true).open(&partial).map_err(|_|"Could not create the download in this folder")?;
   if let Some(mut current)=remote{
    let agent=crate::network::agent_builder().resolver(crate::network::public_resolver).redirects(0).timeout(Duration::from_secs(180)).build();
    let mut saved=false;
    for _ in 0..5{
     let response=agent.get(current.as_str()).call().map_err(|_|"Download failed. The original may be expired or require its signed-in browser.")?;
     if (300..400).contains(&response.status()){
      let location=response.header("location").ok_or("Invalid download redirect")?;
      current=source(current.join(location).map_err(|_|"Invalid download redirect")?.as_str())?;continue;
     }
     if !(200..300).contains(&response.status()){return Err("Download server did not return a file".into());}
     if response.header("content-length").and_then(|s|s.parse::<u64>().ok()).is_some_and(|s|s>MAX){return Err("Downloads are limited to 250 MB".into());}
     let read=std::io::copy(&mut response.into_reader().take(MAX+1),&mut output).map_err(|_|"Could not finish writing this file")?;
     if read>MAX{return Err("Downloads are limited to 250 MB".into());}saved=true;break;
    }
    if !saved{return Err("Too many download redirects".into());}
   }else{output.write_all(text.as_deref().unwrap_or("").as_bytes()).map_err(|_|"Could not write report")?;}
   output.sync_all().map_err(|_|"Could not finish saving this file")?;drop(output);
   fs::rename(&partial,&path).map_err(|_|"Could not save to the selected destination; check whether the file is open")?;Ok(true)
  })();
  if result.is_err(){let _=fs::remove_file(&partial);}result
 }).await.map_err(|_|"Save As did not complete")?
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn filenames_are_suggestions_without_paths(){assert_eq!(filename("../clip.mp4"),"clip.mp4");assert_eq!(filename("CON.txt"),"download");assert_eq!(filename("photo.png"),"photo.png");assert!(!filename("a\n:b.jpg").contains(':'));}
 #[test]fn restricts_download_sources(){for url in ["file:///C:/secret","http://example.com/a","https://localhost/a","https://127.0.0.1/a","https://user:password@example.com/a","https://example.com:3000/a"]{assert!(source(url).is_err(),"{url}");}}
}
