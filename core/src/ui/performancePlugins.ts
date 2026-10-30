/** Existing optional plugins; this filter never changes anyone's selections. */
const names=new Set(['FastDiscord','UI Optimisations','NoTypingAnimation','DisableAnimations']);
export const isPerformancePlugin=(source:string,id:string)=>source==='Equicord'&&names.has(id);
export const isTypingFeelPlugin=(source:string,id:string)=>source==='Equicord'?id==='SmoothType':source==='xray'&&['keyboardSounds','characterCounter'].includes(id);
