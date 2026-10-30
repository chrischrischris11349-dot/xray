//! Only the two profile routes on the local Oathnet helper are reachable.
//! The helper keeps its API key outside Discord. No arbitrary URL or headers.
use std::{io::Read, time::Duration};
use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
pub struct LookupResponse {
    status: u16,
    body: serde_json::Value,
}

fn helper_url(kind: &str, user_id: &str) -> Result<String, String> {
    if !matches!(kind, "profile" | "history") {
        return Err("Unsupported Oathnet lookup.".into());
    }
    if !(14..=19).contains(&user_id.len()) || !user_id.bytes().all(|c| c.is_ascii_digit()) {
        return Err("Invalid Discord user ID.".into());
    }
    Ok(format!("http://127.0.0.1:43991/{kind}/{user_id}"))
}

#[tauri::command]
pub async fn oathnet_lookup(app: tauri::AppHandle, kind: String, user_id: String) -> Result<LookupResponse, String> {
    if kind == "imported" {
        helper_url("profile", &user_id)?;
        let path = app.path().app_config_dir().map_err(|_| "Could not locate xray's report folder.")?
            .join("oathnet-reports").join(format!("{user_id}.json"));
        return tauri::async_runtime::spawn_blocking(move || {
            let file = match std::fs::File::open(path) {
                Ok(file) => file,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(LookupResponse { status: 404, body: serde_json::json!({"success": false, "message": "No imported report for this user."}) }),
                Err(_) => return Err("Could not read the imported Oathnet report.".into()),
            };
            let mut bytes = Vec::new();
            file.take(1_048_577).read_to_end(&mut bytes).map_err(|_| "Could not read the imported report.")?;
            if bytes.len() > 1_048_576 { return Err("The imported report is too large.".into()); }
            let report: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| "Invalid imported report JSON.")?;
            if report["metadata"]["query"].as_str() != Some(user_id.as_str()) || !report["records"].is_array() {
                return Err("This report does not match the selected Discord ID.".into());
            }
            Ok(LookupResponse { status: 200, body: serde_json::json!({"success": true, "data": report}) })
        }).await.map_err(|_| "Could not load the imported report.".to_string())?;
    }
    if crate::intelligence::configured(&app,"oathnet") {
        helper_url(&kind,&user_id)?;
        return tauri::async_runtime::spawn_blocking(move||crate::intelligence::transfer(&app,"oathnet",&kind,&user_id,"discord").map(|body|LookupResponse{status:200,body})).await.map_err(|_|"Oathnet task failed".to_string())?;
    }
    let url = helper_url(&kind, &user_id)?;
    if crate::network::tor_enabled(){return Err("The local lookup helper is unavailable in strict Tor mode. Configure the provider key in XRay to use its remote HTTPS API through Tor.".into());}
    tauri::async_runtime::spawn_blocking(move || {
        let agent = crate::network::agent_builder().timeout(Duration::from_secs(20)).redirects(0).build();
        let response = match agent.get(&url).set("Origin", "https://discord.com").call() {
            Ok(response) | Err(ureq::Error::Status(_, response)) => response,
            Err(_) => return Err("Could not reach the Oathnet helper on port 43991. Start the helper with your API key, then retry.".into()),
        };
        let status = response.status();
        if (300..400).contains(&status) { return Err("The Oathnet helper returned an unexpected redirect.".into()); }
        let mut bytes = Vec::new();
        response.into_reader().take(1_048_577).read_to_end(&mut bytes)
            .map_err(|_| "Could not read the Oathnet helper response.")?;
        if bytes.len() > 1_048_576 { return Err("The Oathnet response is too large.".into()); }
        let body = serde_json::from_slice(&bytes).map_err(|_| "The Oathnet helper returned unreadable data.")?;
        Ok(LookupResponse { status, body })
    }).await.map_err(|_| "The Oathnet lookup could not finish.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_fixed_profile_routes_are_allowed() {
        assert_eq!(helper_url("profile", "300760994454437890").unwrap(), "http://127.0.0.1:43991/profile/300760994454437890");
        assert!(helper_url("history", "300760994454437890").is_ok());
        assert!(helper_url("logs", "300760994454437890").is_err());
        for id in ["", "123", "300760994454437890/..", "３００７６０９９４４５４４３７８９０"] {
            assert!(helper_url("profile", id).is_err());
        }
    }
}
