/** Preserve native folders while the pinned sidebar filters are incompatible. */
export function nativeFolderCompatibility(source){
 if(!source.includes('predicate: () => settings.store.sidebar'))throw new Error('Review BetterFolders compatibility patch for this pin');
 return source.replace(/\bsettings\.store\.sidebar\b/g,'false').replace(/((?:sidebar|sidebarAnim|keepIcons|showFolderIcon):\s*{)/g,'$1\n        hidden: true,').replace('Shows server folders on dedicated sidebar and adds folder related improvements','Native server folders with folder navigation improvements');
}
