//! Syncs your own xray settings — plugin config, theme and feature switches —
//! to your server, so they follow you between machines. It carries your
//! settings only: never message content, and nothing about other people.
//!
//! Like report.rs, the server address and token live in `shell.json` on the
//! Rust side, out of Discord's page's reach (any script on discord.com could
//! read a token the page held). The core hands over a JSON blob to push, or
//! asks for the stored one; Rust talks to `<sync_endpoint>/config`, which is
//! the same endpoint the log server already exposes for a client's own
//! settings (see server/README.md). When no server is configured the command
//! returns an error and the core leaves your local settings untouched.

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use crate::Shell;

const TIMEOUT_SECS: u64 = 10;

/// Namespaces are short and made only of safe characters. The core uses a
/// single namespace ("xray") for the whole settings blob; the check also
/// keeps the value out of the query string's structure.
fn valid_ns(ns: &str) -> bool {
    !ns.is_empty()
        && ns.len() <= 64
        && ns.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'.' || b == b'-')
}

/// Pull (payload `None`) or push (payload `Some`) the settings blob for `ns`.
/// Returns the server's JSON reply verbatim: `{ value, updatedAt }` on a pull,
/// `{ updatedAt }` on a push.
#[tauri::command]
pub async fn sync_config<R: Runtime>(
    app: AppHandle<R>,
    ns: String,
    payload: Option<Value>,
) -> Result<Value, String> {
    if !valid_ns(&ns) {
        return Err("bad namespace".into());
    }
    let (endpoint, token) = {
        let shell = app.state::<Shell>();
        let settings = shell.0.lock().map_err(|_| "settings unavailable".to_string())?;
        (settings.sync_endpoint.clone(), settings.sync_token.clone())
    };
    if endpoint.is_empty() || token.is_empty() || !endpoint.starts_with("https://") {
        return Err("no sync server configured".into());
    }
    tauri::async_runtime::spawn_blocking(move || transfer(&endpoint, &token, &ns, payload))
        .await
        .map_err(|err| err.to_string())?
}

#[cfg(not(test))]
fn transfer(endpoint: &str, token: &str, ns: &str, payload: Option<Value>) -> Result<Value, String> {
    let base = endpoint.trim_end_matches('/');
    let url = format!("{base}/config?ns={ns}");
    let agent = crate::network::agent_builder()
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
        .build();
    let bearer = format!("Bearer {token}");
    let response = match payload {
        Some(value) => agent
            .request("PUT", &url)
            .set("authorization", &bearer)
            .send_json(serde_json::json!({ "value": value })),
        None => agent.request("GET", &url).set("authorization", &bearer).call(),
    };
    response
        .map_err(|err| err.to_string())?
        .into_json::<Value>()
        .map_err(|err| err.to_string())
}

// Unit tests never reach the network (that would need a live server).
#[cfg(test)]
fn transfer(_endpoint: &str, _token: &str, _ns: &str, _payload: Option<Value>) -> Result<Value, String> {
    Ok(Value::Null)
}

#[cfg(test)]
mod tests {
    use super::valid_ns;

    #[test]
    fn namespaces_are_checked() {
        assert!(valid_ns("xray"));
        assert!(valid_ns("text-replace_2.0"));
        assert!(!valid_ns(""));
        assert!(!valid_ns("../etc"));
        assert!(!valid_ns("has space"));
        assert!(!valid_ns(&"x".repeat(65)));
    }
}
