import {h} from './dom';
import {showSheet,closeDialog} from './dialog';
export const patchLog=[{version:'0.5.19',title:'A darker finish. Better flow.',sections:[
 {title:'New',items:['Separate account tabs with their own Discord sign-ins. Opened sessions stay connected while switching, and saved tabs restore on restart.','Hardware acceleration switch, plus Performance and Typing plugin filters.','Windows Save As for Discord downloads and saved recordings.']},
 {title:'Fixed',items:['Clan tags remain visible by default; inherited Declutter tag hiding is restored once. Later deliberate hide choices are respected.','Personal builds show an explicit local FD active label without changing audio.','Native server and folder dragging. Current Discord uses its native folders to prevent the duplicate BetterFolders sidebar and missing folder contents.','External links use the Windows registered handler; destination and masked-link warnings remain. The old link-only Tor setting is retired.','Notifications and taskbar voice actions target the right account. Restarting checks every opened session for active recordings and unsaved history.']},
 {title:'Polished',items:['Deeper black surfaces, softer tab highlights and compact identity markers using the existing theme.','Cached plugin search, batched typing feedback and cleaned-up sound nodes.','Screen-share capture preserves lower requests, offers explicit 720p presets and reports capture size/FPS in preview. Game-FPS improvement still needs comparison on the affected PC.']},
 {title:'Keep in mind',items:['Each opened account uses additional memory. Up to six saved tabs are supported.','Server storage preserves uploaded history; it cannot collect new activity while all clients are off.','Graphics, voice and streaming behavior depend on WebView2, drivers and selected devices.']}
]}] as const;
export function showPatchNotes():void{
 showSheet(h('section',{class:'dialog patch-log',attrs:{role:'dialog','aria-modal':'true','aria-labelledby':'xray-patch-title'}},
  h('div',{class:'patch-log-head'},h('div',{},h('p',{class:'patch-log-kicker',text:'WHAT’S NEW'}),h('h2',{class:'dialog-title',attrs:{id:'xray-patch-title'},text:'XRay · Patch log'})),h('span',{class:'tag',text:`v${patchLog[0].version}`})),
  ...patchLog.map(release=>h('article',{},h('h3',{class:'patch-log-title',text:release.title}),...release.sections.map(section=>h('section',{},h('h4',{class:'patch-log-section',text:section.title}),h('ul',{},...section.items.map(text=>h('li',{text}))))))),
  h('div',{class:'dialog-actions'},h('button',{class:'btn ghost',text:'Done',on:{click:closeDialog}}))));
}
