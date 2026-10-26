//! Account-scoped documents on the operator's configured server. No disk cache.
use serde_json::Value;
use tauri::{AppHandle, Runtime};

fn valid_ns(ns: &str) -> bool {
    let Some((kind, id)) = ns.split_once('.') else { return false; };
    matches!(kind, "profile-history" | "moderation-audit" | "server-monitors" | "bot-history") && (14..=20).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit())
}

#[tauri::command]
pub async fn history_media<R: Runtime>(app: AppHandle<R>, owner: String, url: String, retry: Option<bool>, offset: Option<u64>) -> Result<Value,String> {
    let source=tauri::Url::parse(&url).map_err(|_|"Invalid attachment URL")?;
    if !(14..=20).contains(&owner.len()) || !owner.bytes().all(|b|b.is_ascii_digit()) || url.len()>2048 || source.scheme()!="https" || !source.username().is_empty() || source.password().is_some() || source.port().is_some() || !matches!(source.host_str(),Some("cdn.discordapp.com"|"media.discordapp.net")) || !(source.path().starts_with("/attachments/") || source.path().starts_with("/ephemeral-attachments/")) {return Err("Invalid history media request".into());}
    let settings=crate::settings::load(&app);
    let endpoint=tauri::Url::parse(&settings.sync_endpoint).map_err(|_|"Configure HTTPS server storage first")?;
    if endpoint.scheme()!="https" || !endpoint.username().is_empty() || endpoint.password().is_some() || endpoint.query().is_some() || endpoint.fragment().is_some() || settings.sync_token.is_empty(){return Err("Configure HTTPS server storage first".into());}
    tauri::async_runtime::spawn_blocking(move||{
        use std::io::Read;
        let base=settings.sync_endpoint.trim_end_matches('/');
        let agent=ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(15)).redirects(0).build();
        let mut payload=serde_json::json!({"owner":owner,"url":url,"retry":retry.unwrap_or(false)});if let Some(offset)=offset{if offset>250*1024*1024{return Err("Invalid media offset".into());}payload["offset"]=Value::from(offset);}
        let response=agent.post(&format!("{base}/media")).set("Authorization",&format!("Bearer {}",settings.sync_token)).send_json(payload).map_err(|error|match error{ureq::Error::Status(404,_)=>"Update the XRay server; media archiving is unavailable".to_string(),ureq::Error::Status(401,_)=>"The media server rejected its configured token".to_string(),_=>"The media archive server is unavailable".to_string()})?;
        let mut bytes=Vec::new();response.into_reader().take(750001).read_to_end(&mut bytes).map_err(|_|"Could not read media archive status")?;
        if bytes.len()>750000{return Err("Media archive response exceeds its limit".into());}
        let mut value:Value=serde_json::from_slice(&bytes).map_err(|_|"Invalid media archive response")?;
        if value["state"]=="ready" && offset.is_none(){let path=value["path"].as_str().ok_or("Media URL missing")?;if !path.starts_with("/media/file/")||path.contains("..")||path.contains('#'){return Err("Invalid media archive path".into());}value["url"]=Value::String(format!("{base}{path}"));}
        Ok(value)
    }).await.map_err(|_|"Media archive task failed".to_string())?
}

#[tauri::command]
pub async fn document_store<R: Runtime>(app: AppHandle<R>, ns: String, value: Option<String>, revision: Option<u64>) -> Result<Value, String> {
    if !valid_ns(&ns) || ns.starts_with("bot-history.") && value.is_some() || value.as_ref().is_some_and(|v| v.len() > 2_000_000) || value.is_some() && revision.is_none() {
        return Err("Invalid document or revision".into());
    }
    // Reload this file so adding the server address does not need an app restart.
    let settings = crate::settings::load(&app);
    let endpoint = settings.sync_endpoint;
    let token = settings.sync_token;
    let url = tauri::Url::parse(&endpoint).map_err(|_| "Set sync_endpoint and sync_token in XRay's shell.json first")?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() || token.is_empty() || url.query().is_some() || url.fragment().is_some() {
        return Err("Configure an HTTPS server and token in shell.json first".into());
    }
    tauri::async_runtime::spawn_blocking(move || transfer(&endpoint, &token, &ns, value, revision)).await.map_err(|_| "Document task failed".to_string())?
}

fn transfer(endpoint: &str, token: &str, ns: &str, value: Option<String>, revision: Option<u64>) -> Result<Value, String> {
    use std::io::Read;
    let url = format!("{}/documents?ns={ns}", endpoint.trim_end_matches('/'));
    let agent = ureq::AgentBuilder::new().timeout(std::time::Duration::from_secs(15)).redirects(0).build();
    let request = agent.request(if value.is_some() { "PUT" } else { "GET" }, &url).set("authorization", &format!("Bearer {token}"));
    let response = match value { Some(value) => request.send_json(serde_json::json!({"value":value,"revision":revision})), None => request.call() };
    let response = response.map_err(|error| match error {
        ureq::Error::Status(409, _) => "Server data changed on another device. Reload XRay before saving again.".to_string(),
        ureq::Error::Status(401, _) => "The server rejected the token in shell.json.".to_string(),
        ureq::Error::Status(404, _) => "Update your XRay server service; /documents is unavailable.".to_string(),
        ureq::Error::Status(code, _) => format!("Server storage returned HTTP {code}"),
        _ => "Server storage is unreachable. Keep XRay open; pending changes are only in memory.".to_string(),
    })?;
    let mut body = String::new();
    response.into_reader().take(2_500_001).read_to_string(&mut body).map_err(|_| "Could not read server document")?;
    if body.len() > 2_500_000 { return Err("Server document exceeds the size limit".into()); }
    serde_json::from_str(&body).map_err(|_| "Server returned invalid JSON".into())
}

#[cfg(test)]
mod tests {
    #[test]
    fn document_namespaces_are_narrow() {
        assert!(super::valid_ns("profile-history.300760994454437890"));
        assert!(super::valid_ns("moderation-audit.300760994454437890"));
        for bad in ["xray", "profile-history.1", "profile-history.300760994454437890/../x", "other.300760994454437890"] { assert!(!super::valid_ns(bad)); }
    }
}
