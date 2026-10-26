//! Explicit Save As only: the web page supplies content, never a filesystem path.
use std::{fs::{self, OpenOptions}, io::{Read, Write}, net::ToSocketAddrs, sync::atomic::{AtomicBool,AtomicU64,Ordering}, time::Duration};
use tauri::{AppHandle,Manager};
use tauri_plugin_dialog::DialogExt;
static BUSY:AtomicBool=AtomicBool::new(false);
static NEXT:AtomicU64=AtomicU64::new(1);
const MAX:u64=250*1024*1024;
struct Guard;
impl Drop for Guard{fn drop(&mut self){BUSY.store(false,Ordering::SeqCst);}}
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
pub async fn save_file_as(app:AppHandle,name:String,url:Option<String>,text:Option<String>)->Result<bool,String>{
 if url.is_some()==text.is_some(){return Err("Choose a file URL or report text".into());}
 if text.as_ref().is_some_and(|value|value.len()>10*1024*1024){return Err("Report export is limited to 10 MB".into());}
 let remote=url.as_deref().map(source).transpose()?;
 if BUSY.swap(true,Ordering::SeqCst){return Err("A Save As dialog or download is already open".into());}
 tauri::async_runtime::spawn_blocking(move||{
  let _guard=Guard;
  let mut dialog=app.dialog().file().set_title("Save copy as").set_file_name(filename(&name));
  if let Some(window)=app.get_webview_window(crate::window::MAIN){dialog=dialog.set_parent(&window);}
  let Some(selected)=dialog.blocking_save_file()else{return Ok(false)};
  let path=selected.into_path().map_err(|_|"Select a local file destination")?;
  let parent=path.parent().ok_or("Select a destination folder")?;
  let partial=parent.join(format!(".xray-download-{}-{}.part",std::process::id(),NEXT.fetch_add(1,Ordering::SeqCst)));
  let result=(||{
   let mut output=OpenOptions::new().write(true).create_new(true).open(&partial).map_err(|_|"Could not create the download in this folder")?;
   if let Some(mut current)=remote{
    let agent=ureq::AgentBuilder::new().resolver(|host:&str|{
     let addresses:Vec<_>=host.to_socket_addrs()?.collect();
     if addresses.is_empty()||addresses.iter().any(|a|!crate::webfetch::is_public(a.ip())){return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,"Non-public download destination"));}Ok(addresses)
    }).redirects(0).timeout(Duration::from_secs(180)).build();
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
