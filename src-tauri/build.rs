fn main() {
    // window.rs embeds the mod core, which `npm run core:build` generates.
    println!("cargo:rerun-if-changed=inject/core.js");
    if !std::path::Path::new("inject/core.js").exists() {
        panic!("src-tauri/inject/core.js is missing. Run `npm run core:build` first.");
    }
    tauri_build::build()
}
