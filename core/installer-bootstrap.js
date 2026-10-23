// Runs before Equicord and XRay initialize. Installer selections contain IDs and booleans only.
((selection) => {
  if (!selection || window.top !== window) return;
  const marker = "xray.installerSelection";
  const keys = ["xray.settings", "EquicordSettings", marker];
  let previous;
  const read = raw => {
    let value = raw ? JSON.parse(raw) : {};
    if (typeof value === "string") value = JSON.parse(value);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  };
  try {
    if (localStorage.getItem(marker) === selection.fingerprint) return;
    previous = keys.map(key => localStorage.getItem(key));
    const core = read(previous[0]), equicord = read(previous[1]);
    if (!core.plugins || typeof core.plugins !== "object" || Array.isArray(core.plugins)) core.plugins = {};
    if (!core.features || typeof core.features !== "object" || Array.isArray(core.features)) core.features = {};
    if (!equicord.plugins || typeof equicord.plugins !== "object" || Array.isArray(equicord.plugins)) equicord.plugins = {};
    for (const id of selection.coreIds) core.plugins[id] = { ...core.plugins[id], enabled: false, handedToEquicord: true };
    for (const [key, enabled] of Object.entries(selection.choices)) {
      const colon = key.indexOf(":"), source = key.slice(0, colon), id = key.slice(colon + 1);
      if (source === "xray") core.plugins[id] = { ...core.plugins[id], enabled, handedToEquicord: true };
      else if (source === "equicord") equicord.plugins[id] = { ...equicord.plugins[id], enabled };
      else if (source === "feature") core.features[id] = enabled;
    }
    core.pickedPlugins = true;
    localStorage.setItem(keys[0], JSON.stringify(core));
    localStorage.setItem(keys[1], JSON.stringify(equicord));
    localStorage.setItem(marker, selection.fingerprint);
  } catch (error) {
    // Don't leave half-applied choices if parsing or a storage write fails.
    try { if (previous) keys.forEach((key, index) => previous[index] === null ? localStorage.removeItem(key) : localStorage.setItem(key, previous[index])); } catch { /* storage may be unavailable */ }
    console.warn("XRay could not apply installer plugin choices; existing settings were preserved.", error);
  }
})(/*XRAY_SELECTION*/null);
