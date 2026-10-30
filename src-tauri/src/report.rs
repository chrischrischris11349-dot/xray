//! Forwards xray's own logs to your log server.
//!
//! Discord's page can't reach your server itself: its content security policy
//! only allows Discord's own hosts, and even if it could, the page must never
//! hold the token (any script on discord.com could read it). So the core
//! hands a batch of events to this one command, and Rust — which holds the
//! address and token in `shell.json`, out of the page's reach — posts them.
//!
//! The command only forwards what the core sends (xray's own errors and your
//! own voice/plugin events); it never reads Discord's data. When no server is
//! configured it does nothing, so logging is inert until you set
//! `log_endpoint` and `log_token`. The post runs on a worker thread so it
//! never blocks the UI, and failures are logged, not surfaced: losing a log
//! line is not worth bothering you over.

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use crate::Shell;

/// The most events accepted in one call, matching the core's queue cap.
const MAX_EVENTS: usize = 100;
const TIMEOUT_SECS: u64 = 10;

/// Accepts a batch of log events from the core and forwards them. The events
/// are passed straight through as JSON; the server validates and caps them.
#[tauri::command]
pub fn report_events<R: Runtime>(app: AppHandle<R>, events: Vec<Value>) {
    if events.is_empty() {
        return;
    }
    let (endpoint, token) = {
        let shell = app.state::<Shell>();
        let Ok(settings) = shell.0.lock() else { return };
        (settings.log_endpoint.clone(), settings.log_token.clone())
    };
    // No server set up: logging is simply off.
    if endpoint.is_empty() || token.is_empty() || !endpoint.starts_with("https://") {
        return;
    }

    let batch: Vec<Value> = events.into_iter().take(MAX_EVENTS).collect();
    // A worker thread, so a slow or unreachable server never stalls the window.
    std::thread::spawn(move || {
        if let Err(err) = post(&endpoint, &token, &batch) {
            eprintln!("xray: couldn't send logs: {err}");
        }
    });
}

#[cfg(not(test))]
fn post(endpoint: &str, token: &str, batch: &[Value]) -> Result<(), String> {
    agent()
        .post(endpoint)
        .set("authorization", &format!("Bearer {token}"))
        .send_json(serde_json::json!({ "events": batch }))
        .map(|_| ())
        .map_err(|err| err.to_string())
}

#[cfg(not(test))]
fn agent() -> ureq::Agent {
    crate::network::agent_builder()
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
        .build()
}

// Unit tests never post (that would need a live server).
#[cfg(test)]
fn post(_endpoint: &str, _token: &str, _batch: &[Value]) -> Result<(), String> {
    Ok(())
}
