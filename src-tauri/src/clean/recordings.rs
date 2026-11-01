//! Clean builds have no voice recording. Same command, always unavailable.
use serde_json::Value;
use tauri::AppHandle;

#[tauri::command]
pub async fn recording_transfer(_app: AppHandle, _payload: Value) -> Result<Value, String> {
    Err("Not included in this build".into())
}
