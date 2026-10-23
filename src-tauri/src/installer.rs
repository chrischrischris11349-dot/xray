//! Installer choices are a fixed local INI file, applied before either plugin engine starts.
use std::{collections::{BTreeMap, HashSet}, hash::{Hash, Hasher}};
use serde::{Deserialize, Serialize};
use tauri::Manager;

const CATALOG: &str = include_str!("../windows/plugin-catalog.json");
const BOOTSTRAP: &str = include_str!("../../core/installer-bootstrap.js");
#[derive(Deserialize)]
struct Catalog { #[serde(rename = "coreIds")] core_ids: Vec<String>, plugins: Vec<Choice> }
#[derive(Deserialize)]
struct Choice { key: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Selection { fingerprint: String, core_ids: Vec<String>, choices: BTreeMap<String, bool> }

fn parse(text: &str, catalog: &Catalog) -> Result<BTreeMap<String, bool>, &'static str> {
    if text.len() > 65_536 { return Err("Selection too large"); }
    let allowed: HashSet<&str> = catalog.plugins.iter().map(|p| p.key.as_str()).collect();
    let mut choices = BTreeMap::new(); let mut header = false;
    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if line == "[plugins]" && !header { header = true; continue; }
        let (key, value) = line.split_once('=').ok_or("Invalid selection entry")?;
        if !header || !allowed.contains(key) || !matches!(value, "0" | "1") || choices.contains_key(key) { return Err("Invalid selection entry"); }
        choices.insert(key.into(), value == "1");
    }
    if !header || choices.len() != allowed.len() { return Err("Incomplete selection"); }
    Ok(choices)
}

pub fn script<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<String> {
    let path = app.path().app_config_dir().ok()?.join("installer-plugins.ini");
    if std::fs::metadata(&path).ok()?.len() > 65_536 { return None; }
    let text = std::fs::read_to_string(path).ok()?;
    let catalog: Catalog = serde_json::from_str(CATALOG).ok()?;
    let choices = parse(&text, &catalog).ok()?;
    let mut hash = std::collections::hash_map::DefaultHasher::new(); choices.hash(&mut hash);
    catalog.core_ids.hash(&mut hash);
    let selection = Selection { fingerprint: format!("{:x}", hash.finish()), core_ids: catalog.core_ids, choices };
    Some(BOOTSTRAP.replace("/*XRAY_SELECTION*/null", &serde_json::to_string(&selection).ok()?))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installer_choices_must_be_complete_known_and_boolean() {
        let catalog = Catalog { core_ids: vec![], plugins: vec![Choice { key:"xray:test".into() }] };
        assert_eq!(parse("[plugins]\r\nxray:test=1\r\n", &catalog).unwrap()["xray:test"], true);
        for text in ["", "[plugins]", "[plugins]\nxray:test=true", "[plugins]\nunknown=1", "[plugins]\nxray:test=1\nxray:test=0", "xray:test=1"] { assert!(parse(text,&catalog).is_err()); }
    }
}
