//! Clean builds have no lookups. Same command, always unavailable.
const UNAVAILABLE: &str = "Not included in this build";

#[tauri::command]
pub async fn oathnet_lookup(_app: tauri::AppHandle, _kind: String, _user_id: String) -> Result<(), String> {
    Err(UNAVAILABLE.into())
}
