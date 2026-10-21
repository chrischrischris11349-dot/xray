fn main() {
    // window.rs embeds the mod core, which `npm run core:build` generates.
    println!("cargo:rerun-if-changed=inject/core.js");
    if !std::path::Path::new("inject/core.js").exists() {
        panic!("src-tauri/inject/core.js is missing. Run `npm run core:build` first.");
    }
    // Listing the app's commands generates an `allow-<command>` permission for
    // each, so capabilities can grant them one at a time.
    let manifest = tauri_build::AppManifest::new().commands(&["notify", "get_hotkeys", "set_hotkeys", "report_events", "sync_config", "translate"]);
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest)).expect("tauri-build failed");
}
