use std::{io::Read,time::Duration};
use serde_json::Value;
use tauri::AppHandle;
#[tauri::command]
pub async fn recording_transfer(app:AppHandle,payload:Value)->Result<Value,String>{
    let action=payload["action"].as_str().ok_or("Recording action required")?;
    if !["start","chunk","finish","list","read","abort"].contains(&action) || payload.to_string().len()>200_000{return Err("Invalid recording request".into());}
    let settings=crate::settings::load(&app);
    let url=tauri::Url::parse(&settings.sync_endpoint).map_err(|_|"Configure your HTTPS storage server first")?;
    if url.scheme()!="https" || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() || settings.sync_token.is_empty(){return Err("Configure HTTPS server storage first".into());}
    tauri::async_runtime::spawn_blocking(move||{
        let agent=crate::network::agent_builder().timeout(Duration::from_secs(25)).redirects(0).build();
        let result=agent.post(&format!("{}/recordings",settings.sync_endpoint.trim_end_matches('/'))).set("Authorization",&format!("Bearer {}",settings.sync_token)).send_json(payload);
        let response=match result{Ok(response)=>response,Err(ureq::Error::Status(400,response))=>{let mut bytes=Vec::new();let _=response.into_reader().take(2048).read_to_end(&mut bytes);let body:Value=serde_json::from_slice(&bytes).unwrap_or_default();return Err(body["error"].as_str().unwrap_or("Recording request rejected").chars().take(180).collect());},Err(ureq::Error::Status(401,_))=>return Err("Recording server rejected the token".into()),Err(_)=>return Err("Recording server unavailable. Keep XRay open to retry pending audio.".into())};
        let mut bytes=Vec::new();response.into_reader().take(46_000_001).read_to_end(&mut bytes).map_err(|_|"Could not read recording response")?;
        if bytes.len()>46_000_000{return Err("Recording response exceeds size limit".into());}serde_json::from_slice(&bytes).map_err(|_|"Invalid recording response".into())
    }).await.map_err(|_|"Recording upload task failed".to_string())?
}
