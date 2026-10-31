fn main() {
    println!("cargo:rerun-if-env-changed=XRAY_PERSONAL_BUILD");
    println!("cargo:rerun-if-changed=windows/plugin-catalog.json");
    println!("cargo:rerun-if-changed=../core/installer-bootstrap.js");
    // window.rs embeds the mod core, which `npm run core:build` generates.
    println!("cargo:rerun-if-changed=inject/core.js");
    if !std::path::Path::new("inject/core.js").exists() {
        panic!("src-tauri/inject/core.js is missing. Run `npm run core:build` first.");
    }
    // Equicord is optional for a quick debug build: without it xray runs on its own plugins.
    println!("cargo:rerun-if-changed=inject/equicord.js");
    if !std::path::Path::new("inject/equicord.js").exists() {
        println!("cargo:warning=inject/equicord.js is missing, so this build has no Equicord. Run `npm run equicord:build`.");
        std::fs::write("inject/equicord.js", "// No Equicord in this build (run `npm run equicord:build`).
").expect("write placeholder");
    }
    // Listing the app's commands generates an `allow-<command>` permission for
    // each, so capabilities can grant them one at a time.
    let manifest = tauri_build::AppManifest::new().commands(&["account_sessions", "graphics_settings", "open_reviewed_link", "save_file_as", "notify", "set_notification_privacy", "get_hotkeys", "set_hotkeys", "report_events", "sync_config", "app_update", "document_store", "history_media", "message_archive", "translate", "web_fetch", "oathnet_lookup", "provider_keys", "open_provider_settings", "intel_request", "recording_transfer", "set_voice_controls", "change_zoom", "open_sandbox_preview"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest)).expect("tauri-build failed");
}
