/** Restore visible tags once; later deliberate user choices remain respected. */
export function clanTagCompatibility(source){
 const pattern=/(removeClanTag:\s*{[\s\S]*?default:\s*)true(\s*,)/;
 if(!pattern.test(source))throw Error('Review Declutter clan-tag defaults for this pin');
 return source.replace(pattern,'$1false$2').replace('definePluginSettings, migratePluginSetting }','definePluginSettings, migratePluginSetting, SettingsStore }')+`
// XRay: preserve Discord identity details through the inherited Declutter migration.
// Plugin settings getters are not initialized yet; use the existing migration store.
const xrayClanSettings = (SettingsStore.plain.plugins.Declutter ??= {}) as any;
if (!xrayClanSettings.xrayClanTagRestoreV1) {
    xrayClanSettings.removeClanTag = false;
    xrayClanSettings.xrayClanTagRestoreV1 = true;
    SettingsStore.markAsChanged();
}
`;
}
