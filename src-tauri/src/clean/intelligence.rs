//! Clean builds have no provider lookups. Same commands, always unavailable.
use serde_json::Value;
use tauri::{AppHandle, WebviewWindow};

const UNAVAILABLE: &str = "Not included in this build";

#[tauri::command]
pub async fn provider_keys(_app: AppHandle, _window: WebviewWindow, _provider: Option<String>, _key: Option<String>, _host: Option<String>) -> Result<Value, String> {
    Err(UNAVAILABLE.into())
}

#[tauri::command]
pub fn open_provider_settings(_app: AppHandle) -> Result<(), String> {
    Err(UNAVAILABLE.into())
}

#[tauri::command]
pub async fn intel_request(_app: AppHandle, _provider: String, _operation: String, _query: String, _kind: String, _cursor: Option<String>, _search_id: Option<String>) -> Result<Value, String> {
    Err(UNAVAILABLE.into())
}
