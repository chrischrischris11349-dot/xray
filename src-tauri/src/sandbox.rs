use std::{io::Read,sync::atomic::{AtomicU64,AtomicUsize,Ordering},time::Duration,net::ToSocketAddrs};
use tauri::{AppHandle,Manager,WebviewUrl,WebviewWindowBuilder};
static NEXT:AtomicU64=AtomicU64::new(1);
static PENDING:AtomicUsize=AtomicUsize::new(0);
struct Reservation;
impl Drop for Reservation{fn drop(&mut self){PENDING.fetch_sub(1,Ordering::SeqCst);}}
fn preview_url(url:&str,html_mode:bool)->Result<tauri::Url,String>{
    let source=tauri::Url::parse(&url).map_err(|_|"Invalid preview URL")?;
    if url.len()>8192 || !source.username().is_empty() || source.password().is_some(){return Err("Use a public HTTPS URL without credentials".into());}
    if !html_mode && source.host_str().is_some_and(|h|h=="discord.com" || h.ends_with(".discord.com")){return Err("Discord pages cannot be opened inside the preview".into());}
    crate::webfetch::check_public(&source)?;
    Ok(source)
}
#[tauri::command]
pub async fn open_sandbox_preview(app:AppHandle,url:String,html_mode:bool,allow_scripts:bool)->Result<(),String> {
    let source=preview_url(&url,html_mode)?;
    let count=app.webview_windows().keys().filter(|name|name.starts_with("sandbox-")).count();
    // Keep the stable API for older supported Rust toolchains.
    #[allow(deprecated)]
    PENDING.fetch_update(Ordering::SeqCst,Ordering::SeqCst,|pending|if count+pending<3{Some(pending+1)}else{None}).map_err(|_|"Close a sandbox window before opening another")?;
    let _reservation=Reservation;
    let host=source.host_str().unwrap_or("preview").to_owned();
    let label=format!("sandbox-{}",NEXT.fetch_add(1,Ordering::Relaxed));
    if html_mode {
        let (text,base_url)=tauri::async_runtime::spawn_blocking(move||{
            let agent=ureq::AgentBuilder::new().resolver(|host:&str|{
                let addresses:Vec<_>=host.to_socket_addrs()?.collect();
                if addresses.is_empty() || addresses.iter().any(|a|!crate::webfetch::is_public(a.ip())){return Err(std::io::Error::new(std::io::ErrorKind::PermissionDenied,"Non-public preview destination"));}Ok(addresses)
            }).timeout(Duration::from_secs(15)).redirects(0).build();
            let mut destination=source;
            let mut response=None;
            for _ in 0..5 {
                let next=agent.get(destination.as_str()).call().map_err(|_|"HTML could not be fetched; the attachment may have expired")?;
                if (300..400).contains(&next.status()) {
                    let location=next.header("location").ok_or("Preview redirect has no destination")?;
                    let resolved=destination.join(location).map_err(|_|"Invalid preview redirect")?;
                    destination=preview_url(resolved.as_str(),true).map_err(|_|"Preview redirect destination is not allowed")?;
                    continue;
                }
                response=Some(next); break;
            }
            let response=response.ok_or("Too many preview redirects")?;
            let mut data=Vec::new();response.into_reader().take(1_048_577).read_to_end(&mut data).map_err(|_|"Could not read HTML")?;
            if data.len()>1_048_576{return Err("Preview HTML is limited to 1 MB");}let text=String::from_utf8(data).map_err(|_|"HTML must be UTF-8")?;
            Ok::<_, &str>((text,destination.to_string()))
        }).await.map_err(|_|"Preview fetch failed")??;
        let payload=serde_json::json!({"html":text,"scripts":allow_scripts,"baseUrl":base_url});
        WebviewWindowBuilder::new(&app,label,WebviewUrl::App("sandbox.html".into())).title(format!("XRay sandbox · HTML from {host}")).inner_size(960.,720.).incognito(true).initialization_script(format!("window.__sandboxContent={payload};")).on_download(|_,_|false).on_permission_request(|_,_|tauri::webview::PermissionResponse::Deny).on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny).build().map_err(|_|"Could not open HTML sandbox")?;
    } else {
        let mut builder=WebviewWindowBuilder::new(&app,label,WebviewUrl::External(source)).title(format!("XRay sandbox · {host}")).inner_size(1024.,760.).incognito(true).on_navigation(|url|crate::webfetch::check_public(url).is_ok() && url.host_str().is_some_and(|h|h!="discord.com" && !h.ends_with(".discord.com"))).on_download(|_,_|false).on_permission_request(|_,_|tauri::webview::PermissionResponse::Deny).on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny);
        if !allow_scripts{builder=builder.disable_javascript();}
        builder.build().map_err(|_|"Could not open website sandbox")?;
    }Ok(())
}

#[cfg(test)]
mod tests{use super::*;
 #[test]fn preview_destination_restrictions(){
  for raw in ["http://example.com","https://127.0.0.1","https://localhost","https://user:secret@example.com","https://discord.com/channels/@me"]{assert!(preview_url(raw,false).is_err());}
  assert!(preview_url("https://1.1.1.1",false).is_ok());
 }
}
