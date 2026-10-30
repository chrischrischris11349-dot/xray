/**
 * xray's own UI (panel, picker, dialogs, palette, voice bar) in the "mist
 * and oak" design language; every value comes from theme/tokens.ts (see
 * docs/DESIGN.md). Text is Discord's own gg sans; mono is only for key caps
 * and code.
 */
import { accent, edge, ink, mist, motion, radius, space, type } from "../theme/tokens";
import { seasonalShadowCss } from "../theme/seasonal";
import { shadowDropdownCss } from "./dropdownStyles";
export const css = `
* { box-sizing: border-box; }
[hidden] { display:none!important; }
:host {
  all: initial;
  --text: ${ink.text}; --muted: ${ink.text2}; --faint: ${ink.text3};
  --line: ${edge.soft}; --line2: ${edge.strong};
  --seg: rgba(237,233,226,.06); --hover: ${edge.hover}; --inset: rgba(237,233,226,.035);
  --accent: ${accent.oak}; --onAccent: ${accent.onOak}; --accentSoft: ${accent.oakWash};
  --ok: ${accent.bamboo}; --warn: #E3B567; --bad: ${accent.danger}; --switchOff: rgba(237,233,226,.18);
  --raised: ${mist.m3}; --ease: ${motion.ease};
  color: var(--text);
  font: 14px/1.4 ${type.family};
  -webkit-font-smoothing: antialiased;
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.link-warning-scrim { z-index:2147483645; }
a[data-xray-masked-link] { text-decoration-style:dashed; }
a[data-xray-masked-link]::after { content:" → " attr(data-xray-link-host);font-size:.8em;opacity:.85;unicode-bidi:isolate; }
.tor-mode-badge { position:fixed;top:10px;left:80px;z-index:2147482992;padding:3px 8px;border:1px solid var(--line2);border-radius:6px;background:var(--raised);color:var(--muted);font-size:11px;line-height:18px; }
.link-warning .link-destination-host { font-size:20px;font-weight:600;line-height:1.3;overflow-wrap:anywhere;unicode-bidi:isolate; }
.link-warning .link-destination { user-select:text;overflow-wrap:anywhere;white-space:pre-wrap;unicode-bidi:isolate; }
.moderation-indicator { position:fixed; right:16px; bottom:8px; z-index:2147482990; min-height:28px; padding:0 10px; border:1px solid var(--line2); border-radius:8px; background:var(--raised); color:var(--muted); font:600 11px ${type.family}; cursor:pointer; }
.moderation-indicator[aria-pressed="true"] { color:var(--text); box-shadow:0 0 0 1px var(--accent); }
:host([data-presentation]) > :not(.win-btns,.presentation-button,.recording-status,.dialog-scrim[data-explicit-dialog]) { display:none!important; }
.presentation-button { position: fixed; top: calc((var(--xr-titlebar-height, 46px) - 28px) / 2); right: 132px; z-index: 2147482993; height: 28px; width: 28px; display: grid; place-items: center; padding: 0; border: 0; border-radius: ${radius.m}; background: transparent; color: var(--faint); opacity: .55; cursor: pointer; }
.presentation-button:hover, .presentation-button:focus-visible { opacity: 1; background: var(--hover); }
.presentation-button[aria-pressed="true"] { color: var(--text); background: var(--seg); opacity: .8; }
:host([data-presentation]) .scrim, :host([data-presentation]) .dialog-scrim, :host([data-presentation]) .panel, :host([data-presentation]) .qr, :host([data-presentation]) .bubble, :host([data-presentation]) .palette, :host([data-presentation]) .notification-stack { display: none !important; }
:host([data-presentation]) .dialog-scrim[data-explicit-dialog] { display:flex!important; }
:host([data-presentation]) :is(.xray-vbar,.xray-launch,.cmdbar,.calltimer,.welcome) { display:none!important; }
.notification-stack { position: fixed; top: 58px; right: 16px; width: min(360px,calc(100vw - 32px)); z-index: 2147483200; display: flex; flex-direction: column; gap: 10px; }
.notification-card { display: flex; align-items: flex-start; border-radius: ${radius.l}; background: var(--raised); border: 1px solid var(--line2); box-shadow: 0 12px 36px rgba(0,0,0,.25); overflow: hidden; animation: pop 140ms var(--ease); }
.notification-open { display: flex; flex: 1; gap: 12px; padding: 14px; min-width: 0; background: transparent; border: 0; color: var(--text); text-align: left; font: inherit; cursor: pointer; }
.notification-avatar { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; background: var(--seg); display: grid; place-items: center; flex: none; }
.notification-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-wrap: anywhere; font-size: 13px; }
.notification-brand { font-size: 10px; font-weight: 700; letter-spacing: .08em; color: var(--faint); }
.notification-dismiss { margin: 8px 8px 0 0; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
.mono { font-family: "Cascadia Mono", Consolas, ui-monospace, monospace; }
.label { font-size: 12px; font-weight: ${type.heavy}; color: var(--faint); }

.panel {
  position: fixed; top: 52px; right: 16px; z-index: 2147483000;
  width: 420px; min-width: min(340px,calc(100vw - 16px)); min-height: min(240px,calc(100vh - 60px)); max-width: calc(100vw - 16px); max-height: calc(100vh - 60px); overflow: auto; resize: both; padding: 8px;
  border-radius: ${radius.l}; background: var(--raised);
  backdrop-filter: saturate(180%) blur(24px);
  box-shadow: 0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(237,233,226,.09), inset 0 1px 0 rgba(237,233,226,.07);
  scrollbar-width: thin; scrollbar-color: var(--line2) transparent;
  animation: pop ${motion.rise} var(--ease);
}
@keyframes pop { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
/* Reduced motion: nothing rises or fades in xray's own UI. */
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }

.head { display: flex; align-items: center; gap: 10px; padding: 8px 8px 12px; }
.panel > .head { cursor: grab; touch-action: none; user-select: none; }
.panel.dragging, .panel.dragging > .head { cursor: grabbing; }
.row.appearance-row { display: grid; grid-template-columns: minmax(96px,1fr) minmax(140px,1.8fr); align-items: center; gap: 16px; }
.appearance-row label { white-space: nowrap; }
.appearance-row .dialog-input { width: 100%; min-width: 0; margin: 0; height: 36px; padding: 0 10px; line-height: normal; }
.logo { display: flex; width: 22px; height: 22px; flex: none; }
.title { font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
.head .label { flex: 1; }
.icon-btn { width: 30px; height: 30px; flex: none; display: flex; align-items: center; justify-content: center; border: 0; border-radius: ${radius.m}; background: transparent; color: var(--muted); cursor: pointer; transition: background-color 120ms ease; }
.icon-btn:hover { background: var(--hover); color: var(--text); }

.card { margin: 0 2px 8px; padding: 12px 14px; border-radius: ${radius.m}; background: var(--inset); border: 1px solid var(--line); display: flex; align-items: center; gap: 14px; }
.card.on { background: var(--accentSoft); }
.card-text { flex: 1; min-width: 0; }
.card-title { font-size: 14px; font-weight: 600; }
.card-sub { margin-top: 2px; font-size: 12.5px; color: var(--muted); }
.settings-detail-card,.app-update-card { display:grid;grid-template-columns:minmax(0,1fr);align-items:start;gap:10px; }
.settings-detail-card>.card-title,.app-update-card>.card-title { display:flex;align-items:center;gap:8px;min-width:0; }
.settings-detail-card>select { width:100%; }
.settings-detail-card>.btn { justify-self:start; }
.app-update-card>.dialog-actions { justify-content:flex-start;flex-wrap:wrap;gap:8px; }
.update-dialog { width:min(540px,calc(100vw - 32px)); }
.dialog-scrim { align-items:center;box-sizing:border-box;padding:24px; }
.recording-choice { display:flex;align-items:center;gap:10px;min-height:28px; }
.recording-choice input { flex:none;accent-color:var(--accent); }

.section { display: flex; align-items: baseline; justify-content: space-between; padding: 14px 10px 6px; }
.impact { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; }
.meter { display: inline-flex; gap: 3px; }
.meter span { width: 14px; height: 4px; border-radius: 2px; background: var(--line2); }

.list { margin: 0 2px; border-radius: ${radius.m}; border: 1px solid var(--line); overflow: hidden; background: rgba(237,233,226,.02); }
.row { display: flex; align-items: center; gap: 14px; padding: 12px 14px; }
.row + .row { border-top: 1px solid var(--line); }
.row-text { flex: 1; min-width: 0; }
.row-name { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 14px; font-weight: 600; }
.tag { padding: 2px 6px; border-radius: ${radius.s}; background: var(--seg); color: var(--muted); font-size: 11px; font-weight: 700; }
.row-desc { margin-top: 2px; font-size: 13px; color: var(--muted); }
.row-meta { margin-top: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--faint); }
.dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.rating { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }

.switch { width: 44px; height: 26px; flex: none; padding: 2px; border: 0; border-radius: 13px; background: var(--switchOff); display: flex; justify-content: flex-start; cursor: pointer; transition: background-color ${motion.fast} var(--ease); }
.switch span { width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform ${motion.rise} var(--ease), background-color ${motion.fast} var(--ease); }
.switch[aria-checked="true"] { background: var(--accent); }
.switch[aria-checked="true"] span { background: var(--onAccent); transform: translateX(18px); }

.reload { margin: 8px 2px 0; display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 14px; border-radius: ${radius.m}; background: var(--accentSoft); border: 1px solid var(--line); font-size: 13px; }
.reload span { flex: 1; }
.btn { display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:30px;height:auto;min-width:0;max-width:100%;padding:6px 14px;text-align:center;line-height:1.2;border:0;border-radius:${radius.m};background:var(--accent);color:var(--onAccent);font:600 13px ${type.family};cursor:pointer;transition:transform 120ms var(--ease); }
.btn:active, .switch:active, .icon-btn:active { transform: scale(.94); }

.chip { min-width: 84px; height: 30px; flex: none; padding: 0 10px; border: 1px solid var(--line2); border-radius: ${radius.m}; background: var(--seg); color: var(--text); font: 500 12px "Cascadia Mono", Consolas, ui-monospace, monospace; cursor: pointer; transition: background-color 120ms ease; }
.chip:hover { background: var(--hover); }
.chip.empty { color: var(--faint); }
.chip.capturing { background: var(--accent); border-color: var(--accent); color: var(--onAccent); }
.icon-btn.small { width: 26px; height: 26px; margin-left: -8px; }
.note { margin: 8px 12px 0; font-size: 12px; color: var(--faint); }
.note.error { color: var(--bad); }

.foot { display: flex; justify-content: space-between; padding: 12px 10px 6px; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.toast {
  position: fixed; left: 50%; bottom: 28px; z-index: 2147483000; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: ${radius.m};
  background: var(--raised); backdrop-filter: saturate(180%) blur(24px);
  box-shadow: 0 20px 50px rgba(0,0,0,.5), 0 0 0 1px rgba(237,233,226,.09);
  font-size: 13.5px; animation: toast-rise ${motion.rise} var(--ease);
}
@keyframes toast-rise { from { opacity:0; transform:translate(-50%,4px); } to { opacity:1; transform:translate(-50%,0); } }
.kbd { padding: 1px 6px; border-radius: ${radius.s}; border: 1px solid var(--line2); font-family: "Cascadia Mono", Consolas, monospace; font-size: 11px; color: var(--muted); }

/* Shared glass for floating surfaces */
.bubble, .qr, .palette {
  background: var(--raised);
  backdrop-filter: saturate(180%) blur(24px);
  box-shadow: 0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(237,233,226,.09), inset 0 1px 0 rgba(237,233,226,.07);
}

/* Quick reply */
.bubble {
  position: fixed; right: 20px; bottom: 92px; z-index: 2147482990;
  width: 56px; height: 56px; padding: 0; border: 1px solid var(--line2); border-radius: 18px;
  color: var(--text); display: flex; align-items: center; justify-content: center; cursor: grab; touch-action: none; user-select: none; background: linear-gradient(145deg, rgba(255,255,255,.14), rgba(255,255,255,.025)), color-mix(in srgb, var(--raised) 62%, transparent); backdrop-filter: blur(28px) saturate(135%); box-shadow: 0 12px 32px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.2), inset 0 -1px 0 rgba(255,255,255,.04);
}
.bubble:active { border-color: var(--accent); }
.bubble.dragging { cursor: grabbing; transition:none; will-change:transform; }
.badge {
  position: absolute; top: -3px; right: -3px; min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: ${radius.m}; border: 2px solid #0b0b0b; background: #d92d20; color: #fff;
  font: 700 11px/16px ${type.family}; text-align: center;
}
.qr {
  position: fixed; right: 20px; bottom: 152px; z-index: 2147482995;
  width: 360px; height: 480px; max-height: calc(100vh - 60px);
  background: linear-gradient(145deg, rgba(255,255,255,.055), transparent 60%), color-mix(in srgb, var(--raised) 78%, transparent); border:1px solid var(--line2);
  display: flex; flex-direction: column; overflow: hidden; border-radius: ${radius.l};
  animation: rise ${motion.rise} var(--ease); transform-origin: bottom right;
}
@keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.qr-head { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 12px 10px 16px; border-bottom: 1px solid var(--line); }
.qr-head { cursor:grab; user-select:none; touch-action:none; }
.qr.dragging { animation:none; user-select:none; will-change:transform; }
.qr.dragging .qr-head { cursor:grabbing; }
.qr-resize { position:absolute; bottom:0; right:0; width:20px; height:20px; padding:3px; border:0; border-radius:6px 0 0; background:transparent; color:var(--faint); cursor:nwse-resize; touch-action:none; }
.qr-resize:hover,.qr-resize:focus-visible { color:var(--text); background:var(--hover); }
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active) {
  .bubble,.qr,.panel,.palette,.dialog,.toast { background:var(--raised); backdrop-filter:none; }
}
.qr-title { flex: 1; min-width: 0; font-size: 15px; font-weight: 650; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qr-list { flex: 1; min-height: 0; overflow-y: auto; padding: 6px; scrollbar-width: thin; scrollbar-color: var(--line2) transparent; }
.dm { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 10px; border: 0; border-radius: ${radius.m}; background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; transition: background-color 120ms ease; }
.dm:hover { background: var(--hover); }
.avatar { width: 36px; height: 36px; flex: none; border-radius: 50%; object-fit: cover; background: var(--seg); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; color: var(--muted); }
.avatar.small { width: 28px; height: 28px; font-size: 12px; }
.dm-text { flex: 1; min-width: 0; }
.dm-name, .dm-preview { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dm-name { font-size: 14px; font-weight: 550; }
.dm-preview { margin-top: 1px; font-size: 12.5px; color: var(--muted); }
.count { flex: none; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--accent); color: var(--onAccent); font: 700 11px/18px ${type.family}; text-align: center; }
.msgs { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: ${space.s3}; display: flex; flex-direction: column; gap: ${space.s2}; scrollbar-width: thin; scrollbar-color: var(--line2) transparent; }
.msg { align-self: flex-start; max-width: 78%; padding: ${space.s2}; border-radius: ${radius.l}; background: var(--seg); font-size: ${type.sm}; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
.msg.mine { align-self: flex-end; background: var(--accent); color: var(--onAccent); }
.msg-author { margin: 6px 4px 0; font-size: 12px; font-weight: 700; color: var(--faint); }
.reply { flex: none; padding: 10px 12px 12px; border-top: 1px solid var(--line); }
.reply-field { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 4px 0 14px; border-radius: ${radius.l}; background: rgba(237,233,226,.05); border: 1px solid var(--line); }
.reply-field:focus-within { border-color: rgba(237,233,226,.22); }
.qr-draft-images { display:flex; gap:8px; overflow-x:auto; padding:0 0 10px; }
.qr-draft-images[hidden] { display:none; }
.qr-draft-image { position:relative; width:64px; height:64px; flex:none; }
.qr-draft-image img { width:100%; height:100%; object-fit:cover; border:1px solid var(--line2); border-radius:8px; }
.qr-draft-remove { position:absolute; top:-3px; right:-3px; width:24px; height:24px; padding:0; display:grid; place-items:center; border:1px solid var(--line2); border-radius:50%; background:var(--raised); color:var(--text); cursor:pointer; }
.qr-attach { width:28px; height:28px; }
.reply-field button:disabled { opacity:.5; cursor:default; }
.reply-field input, .pal-input input { flex: 1; min-width: 0; border: 0; padding: 0; background: transparent; color: var(--text); font: 14px ${type.family}; outline: none; }
.reply-field input::placeholder, .pal-input input::placeholder { color: var(--faint); }
.send { width: 32px; height: 32px; flex: none; border: 0; border-radius: 50%; background: var(--accent); color: var(--onAccent); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 120ms var(--ease); }
.send:active { transform: scale(.94); }
.send:disabled { background: var(--seg); color: var(--faint); cursor: default; }
.empty { padding: 40px 16px; text-align: center; font-size: 13px; color: var(--muted); }

/* Ctrl+K search */
.scrim { position: fixed; inset: 0; z-index: 2147483001; display: flex; justify-content: center; align-items: flex-start; padding: 12vh 24px 24px; background: rgba(0,0,0,.42); animation: fade 160ms ease-out; }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
.palette { width: min(640px, 100%); max-height: 70vh; display: flex; flex-direction: column; overflow: hidden; border-radius: ${radius.l}; animation: pop ${motion.rise} var(--ease); }
.pal-input { flex: none; display: flex; align-items: center; gap: 12px; height: 58px; padding: 0 18px; border-bottom: 1px solid var(--line); }
.pal-input input { font-size: 16px; }
.pal-icon { display: flex; color: var(--muted); }

/* The search bar in the command bar (palette.ts). Only with xray's theme, which leaves room for it. */
.cmdbar {
  display: none; position: fixed; top: 8px; left: 50%; z-index: 2147482980; transform: translateX(-50%);
  width: min(440px, 38vw); height: 30px; align-items: center; gap: 10px; padding: 0 6px 0 12px;
  border: 0; border-radius: ${radius.m}; background: rgba(237,233,226,.05); box-shadow: inset 0 0 0 1px rgba(237,233,226,.09);
  color: var(--faint); font: inherit; font-size: 13px; cursor: pointer; transition: background-color 120ms ease, color 120ms ease;
}
:host-context(html.xray-obsidian) .cmdbar { display: flex; }
.cmdbar[hidden] { display: none !important; }
.cmdbar:hover { background: rgba(237,233,226,.08); color: var(--muted); }
.cmdbar .pal-icon { color: inherit; }
.cmdbar .pal-icon svg { width: 15px; height: 15px; }
.cmdbar-text { flex: 1; text-align: left; }
.pal-list { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 8px 8px; scrollbar-width: thin; scrollbar-color: var(--line2) transparent; }
.group { display: block; padding: 10px 10px 4px; }
.result { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 6px 10px; border: 0; border-radius: ${radius.m}; background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
.result.sel { background: rgba(237,233,226,.08); }
.glyph { width: 28px; height: 28px; flex: none; border-radius: ${radius.m}; object-fit: cover; background: var(--seg); display: flex; align-items: center; justify-content: center; font: 700 12px ${type.family}; color: var(--muted); }
.glyph.round { border-radius: 50%; }
.result-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.result-title, .result-sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.result-title { font-size: 14px; font-weight: 500; }
.result-sub { font-size: 12px; color: var(--muted); }
.kind { flex: none; font-size: 11px; font-weight: 700; color: var(--faint); }
.pal-foot { flex: none; display: flex; gap: 18px; padding: 10px 18px; border-top: 1px solid var(--line); }

/* Dialogs (dialog.ts) */
.dialog-scrim { align-items: center; padding: 24px; }
.dialog { width: min(500px, 100%); max-height: 80vh; overflow: auto; display: flex; flex-direction: column; gap: 14px; padding: 20px; border-radius: ${radius.l}; background: var(--raised); box-shadow: 0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(237,233,226,.09), inset 0 1px 0 rgba(237,233,226,.07); animation: pop ${motion.rise} var(--ease); scrollbar-width: thin; scrollbar-color: var(--line2) transparent; }
.panel,.palette { backdrop-filter:none; } /* Opaque surfaces cannot reveal the blurred backdrop. */
.dialog-title { font-size: 16px; font-weight: 650; letter-spacing: -.01em; }
.dialog-text { font-size: 13.5px; color: var(--muted); white-space: pre-wrap; }
.dialog-facts { display: grid; grid-template-columns: auto 1fr; gap: 9px 18px; margin: 0; }
.dialog-facts dt { align-self: center; }
.dialog-facts dd { margin: 0; font-size: 13.5px; overflow-wrap: anywhere; }
.dialog-code { margin: 0; max-height: 50vh; overflow: auto; padding: 12px; border-radius: ${radius.m}; border: 1px solid var(--line); background: rgba(237,233,226,.035); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; }
.dialog-input { width: 100%; padding: 10px 12px; border-radius: ${radius.m}; border: 1px solid var(--line2); background: rgba(237,233,226,.04); color: var(--text); font: inherit; outline: none; resize: vertical; }
.dialog-input:focus { border-color: rgba(237,233,226,.3); }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.btn.ghost { background: rgba(237,233,226,.07); color: var(--text); }
.btn.danger { background: #d92d20; color: #fff; }

/* Plugin list (pluginList.ts) */
.qr-message-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.qr-link { color: var(--accent); text-decoration: underline; overflow-wrap: anywhere; }
.qr-media-link { display: block; }
.qr-media { display: block; width: 100%; max-width: 280px; height: 180px; object-fit: contain; border-radius: ${radius.m}; margin-top: 6px; background: var(--inset); }
.qr-attachment { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
.qr-file-size, .qr-embed-provider, .qr-message-time { font-size: 11px; color: var(--muted); }
.qr-message-time { display: block; margin-top: 5px; }
.qr-embed, .qr-invite { display: block; white-space: normal; padding: 10px; margin-top: 6px; border: 1px solid var(--line2); border-radius: ${radius.m}; background: var(--inset); overflow-wrap: anywhere; }
.qr-embed p { margin: 6px 0; }
.qr-embed-provider { display: block; }
.qr-invite { color: var(--text); text-decoration: none; }
.qr-embed { color: var(--text); }
.msg.mine .qr-attachment .qr-link, .msg.mine > .qr-message-text .qr-link { color: inherit; }
.msg.mine .qr-message-time, .msg.mine .qr-file-size { color: inherit; opacity: .8; }
.msg audio { max-width: 100%; }
.qr-context { position:fixed; z-index:2147483005; width:228px; max-height:calc(100vh - 68px); overflow:auto; padding:6px; border:1px solid var(--line2); border-radius:12px; background:var(--raised); box-shadow:0 18px 60px #0008; }
.qr-context button { display:block; width:100%; min-height:30px; padding:6px 10px; border:0; border-radius:6px; background:transparent; color:var(--text); text-align:left; font:inherit; font-size:13px; overflow-wrap:anywhere; cursor:pointer; }
.qr-context button:hover, .qr-context button:focus-visible { background:var(--hover); outline:1px solid var(--line2); }
.qr-context button:disabled { opacity:.4; cursor:default; }
.qr-context button.danger { color:var(--bad); }
.qr-msg-actions { display:flex; justify-content:flex-end; gap:4px; margin-top:3px; }
.qr-msg-actions button { min-width:28px; height:24px; display:grid; place-items:center; border:0; border-radius:6px; background:transparent; color:inherit; cursor:pointer; opacity:.65; }
.qr-msg-actions button:hover, .qr-msg-actions button:focus-visible { background:#8883; opacity:1; outline:1px solid currentColor; }
.qr-typing { flex:none; padding:3px 14px 7px; color:var(--muted); font-size:12px; }
.qr-typing[hidden], .qr-reply-target[hidden] { display:none; }
.qr-reply-target { margin-bottom:8px; padding:8px 10px; border:1px solid var(--line2); border-left:2px solid var(--accent); border-radius:8px; background:var(--inset); font-size:12px; }
.qr-reply-label { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.qr-reply-preview { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted); margin:3px 0 6px; }
.qr-reply-target label { display:flex; align-items:center; gap:6px; color:var(--muted); }
.qr-quote { margin-bottom:6px; padding-left:7px; border-left:2px solid currentColor; font-size:12px; opacity:.8; max-height:48px; overflow:hidden; }
.qr-pinned { display:block; font-size:11px; opacity:.7; margin-bottom:3px; }
.qr-current { margin:6px; }
:host([data-presentation]) .qr-context { display:none !important; }
.plugin-tools { display: flex; flex-direction: column; gap: 8px; margin: 0 2px 8px; }
.plugin-search { height: 36px; padding: 0 12px; border-radius: ${radius.m}; border: 1px solid var(--line2); background: rgba(237,233,226,.04); color: var(--text); font: inherit; font-size: 13.5px; outline: none; }
.plugin-search:focus { border-color: rgba(237,233,226,.28); }
.plugin-search::placeholder { color: var(--faint); }
.plugin-search::-webkit-search-cancel-button { display: none; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip-filter { height: 26px; padding: 0 10px; border: 0; border-radius: ${radius.s}; background: var(--seg); color: var(--muted); font-family: inherit; font-size: 12px; font-weight: 500; cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.chip-filter:hover { color: var(--text); }
.chip-filter.on { background: var(--accent); color: var(--onAccent); }
.settings-toggle { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 8px; margin-left: auto; border: 0; border-radius: 6px; background: var(--seg); color: var(--muted); font-family: inherit; font-size: 11.5px; font-weight: 500; cursor: pointer; }
.settings-toggle:hover { color: var(--text); }
.settings-toggle .chev { display: flex; transition: transform 160ms var(--ease); }
.settings-toggle.open .chev { transform: rotate(90deg); }
.row-group + .row, .row + .row-group, .row-group + .row-group { border-top: 1px solid var(--line); }
.options { display: flex; flex-direction: column; gap: 12px; padding: 4px 14px 14px; }
.opt { display: flex; align-items: center; gap: 12px; }
.opt.stacked { flex-direction: column; align-items: stretch; gap: 6px; }
.opt-text { flex: 1; min-width: 0; }
.opt-name { font-size: 13px; font-weight: 600; }
.opt-input { min-width: 0; padding: 6px 10px; border-radius: ${radius.m}; border: 1px solid var(--line2); background: rgba(237,233,226,.04); color: var(--text); font: inherit; font-size: 13px; outline: none; }
.opt-input:focus { border-color: rgba(237,233,226,.28); }
.opt-input.num { width: 84px; }
.opt-input.wide { width: 100%; resize: vertical; }
select.opt-input { max-width: 180px; }
select.opt-input option { background: var(--raised); color: var(--text); }
.switch.small { width: 36px; height: 22px; }
.switch.small span { width: 18px; height: 18px; }

/* Call Timer (plugins/appearance.ts) */
.calltimer { position: fixed; top: 4px; right: 96px; z-index: 2147482980; height: 24px; display: flex; align-items: center; gap: 7px; padding: 0 10px; border-radius: ${radius.m}; background: rgba(61,214,140,.1); box-shadow: inset 0 0 0 1px rgba(61,214,140,.28); color: #8cf0c0; font-size: 12px; pointer-events: none; }
:host-context(html.xray-obsidian) .calltimer { top: 10px; height: 26px; }
.calltimer-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 6px var(--ok); }

/* Image Zoom (plugins/media.ts) */
.zoom-lens { position: fixed; z-index: 2147483002; border-radius: 50%; pointer-events: none; background-repeat: no-repeat; background-color: #0b0b0b; box-shadow: 0 18px 50px rgba(0,0,0,.6), 0 0 0 2px rgba(237,233,226,.85), inset 0 0 0 1px rgba(0,0,0,.4); }

/* Passcode Lock (plugins/comfort.ts): above everything, including the panel. */
.lock { position: fixed; inset: 0; z-index: 2147483600; display: flex; align-items: center; justify-content: center; background: rgba(4,4,5,.86); backdrop-filter: blur(28px) saturate(140%); }
.lock-card { width: 300px; display: flex; flex-direction: column; gap: 12px; padding: 24px; border-radius: ${radius.l}; background: var(--raised); box-shadow: 0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(237,233,226,.09); }
.lock-title { font-size: 16px; font-weight: 650; text-align: center; }
.lock-input { height: 38px; padding: 0 12px; border-radius: ${radius.m}; border: 1px solid var(--line2); background: rgba(237,233,226,.04); color: var(--text); font: inherit; letter-spacing: .2em; outline: none; text-align: center; }
.lock-input:focus { border-color: rgba(237,233,226,.3); }
.lock-status { min-height: 16px; font-size: 12.5px; color: var(--bad); text-align: center; }

/* Panel launcher (panel.ts): a clickable spot over the xray wordmark, top-left. */
.xray-launch { position: fixed; top: 0; left: 8px; z-index: 2147482985; width: 104px; height: 46px; padding: 0; border: 0; background: transparent; border-radius: ${radius.m}; cursor: pointer; transition: background-color 120ms ease; }
.xray-launch:hover { background: rgba(237,233,226,.06); }
.xray-launch:active { background: rgba(237,233,226,.1); }
:host-context(html:not(.xray-obsidian)) .xray-launch { display: none; }

/* Window frame (frame.ts): window buttons for the frameless window. Dragging needs no element. */
.win-btns { position: fixed; top: 0; right: 0; height: var(--xr-titlebar-height, 46px); z-index: 2147482992; display: flex; align-items: center; padding-right: 4px; gap: 2px; }
.win-btn { width: 38px; height: 30px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: ${radius.m}; background: transparent; color: var(--muted); cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.win-btn:hover { background: rgba(237,233,226,.07); color: var(--text); }
.win-btn.close:hover { background: #c42b1c; color: #fff; }

/* Title-bar voice controls (plugins/voiceBar.ts), left of the window buttons. */
.xray-vbar { position: fixed; top: 0; right: 172px; height: var(--xr-titlebar-height, 46px); z-index: 2147482991; display: flex; align-items: center; gap: 2px; }
.xray-vbar button { width: 36px; height: 30px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: ${radius.m}; background: transparent; color: var(--muted); cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.xray-vbar button:hover { background: rgba(237,233,226,.07); color: var(--text); }
.xray-vbar button[aria-pressed="true"] { background: rgba(255,90,90,.16); color: #ff6b5b; }
.xray-vbar button.cam[aria-pressed="true"] { background: rgba(61,214,140,.16); color: #3dd68c; }
.xray-vbar button[disabled] { opacity: .35; pointer-events: none; }
:host-context(html:not(.xray-obsidian)) .xray-vbar { display: none; }
/* Plugin picker (picker.ts): a tall glass sheet with one scrolling list. */
.pk-scrim { align-items: center; padding: 24px; }
.picker { width: min(760px, 100%); height: min(86vh, 900px); display: flex; flex-direction: column; gap: 12px; padding: 22px 22px 16px; border-radius: ${radius.l}; background: var(--raised); box-shadow: 0 40px 90px rgba(0,0,0,.65), 0 0 0 1px rgba(237,233,226,.09), inset 0 1px 0 rgba(237,233,226,.07); font-family: "gg sans", "Segoe UI", system-ui, sans-serif; animation: pop ${motion.rise} var(--ease); }
.pk-title { font-size: 20px; font-weight: 700; color: var(--text); }
.pk-sub { margin-top: 4px; font-size: 13.5px; color: var(--muted); line-height: 1.45; }
.pk-presets { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.pk-presets-label { margin-right: 4px; font-size: 12.5px; color: var(--faint); }
.picker .plugin-tools { margin: 0; flex-direction: row; align-items: center; }
.picker .plugin-search { flex: 1; min-width: 0; }
.pk-list { flex: 1; min-height: 0; overflow-y: auto; border-radius: ${radius.m}; border: 1px solid var(--line); background: rgba(237,233,226,.02); scrollbar-width: thin; scrollbar-color: var(--line2) transparent; }
.pk-row { display: flex; align-items: center; gap: 14px; padding: 10px 14px; }
.pk-row + .pk-row { border-top: 1px solid var(--line); }
.pk-text { flex: 1; min-width: 0; }
.pk-name { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--text); }
.pk-src { padding: 1px 7px; border-radius: 999px; background: rgba(237,233,226,.07); color: var(--muted); font-size: 11px; font-weight: 500; }
.pk-src.xray { background: rgba(237,233,226,.9); color: #0b0b0b; }
.pk-desc { margin-top: 2px; font-size: 13px; color: var(--muted); line-height: 1.4; }
.pk-empty { padding: 28px; text-align: center; color: var(--faint); font-size: 13.5px; }
.pk-foot { display: flex; align-items: center; gap: 8px; }
.pk-count { font-size: 12.5px; color: var(--faint); }
.pk-spacer { flex: 1; }
/* Extended profile (profile.ts): a raised sheet; blocks on a 12px grid, one column when narrow. */
.dialog-scrim:has(> .profile) { align-items: center; padding: 24px; }
.profile { container-type: inline-size; width: min(760px, 100%); max-height: min(88vh, 920px); display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; overflow: hidden; border-radius: ${radius.l}; background: var(--raised); box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 0 0 1px var(--line2); animation: pop ${motion.rise} var(--ease); }
.pf-banner { height: 136px; background: center / cover no-repeat var(--inset); }
.pf-banner.mist { --pf-tint: var(--accent); background: radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--pf-tint) 16%, transparent), transparent 60%), var(--inset); }
.pf-head { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 16px; align-items: end; padding: 0 24px; margin-top: -48px; }
.pf-avatar-wrap { width: 104px; height: 104px; padding: 6px; border-radius: 50%; background: var(--raised); }
.pf-avatar { width: 92px; height: 92px; border-radius: 50%; object-fit: cover; display: block; background: var(--inset); box-shadow: 0 0 0 1px var(--line2); }
.pf-initial { display: flex; align-items: center; justify-content: center; font-weight: ${type.heavy}; color: var(--muted); }
.pf-avatar.pf-initial { font-size: 36px; }
.pf-names { min-width: 0; padding-bottom: 4px; }
.pf-name { margin: 0; display: flex; align-items: center; gap: 8px; font-size: ${type.xl}; line-height: 1.15; font-weight: ${type.heavy}; letter-spacing: -.02em; color: var(--text); overflow-wrap: anywhere; }
.pf-tag { padding: 1px 6px; border-radius: ${radius.s}; background: var(--accent); color: var(--onAccent); font-size: 11px; font-weight: 700; letter-spacing: 0; }
.pf-handle { margin-top: 2px; font-size: ${type.md}; color: var(--muted); overflow-wrap: anywhere; }
.pf-meta { margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.pf-status { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; border-radius: ${radius.s}; background: var(--seg); font-size: 12px; font-weight: 700; color: var(--text); }
.pf-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); }
.pf-status.online .pf-dot { background: var(--ok); }
.pf-status.idle .pf-dot { background: var(--warn); }
.pf-status.dnd .pf-dot { background: var(--bad); }
.pf-custom { font-size: 13px; color: var(--muted); }
.pf-badges { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.pf-badge { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: ${radius.s}; border: 1px solid var(--line2); font-size: 12px; font-weight: 600; color: var(--muted); }
.pf-report-data { user-select:text; -webkit-user-select:text; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; color: var(--muted); }
.pf-message .msg { width:100%; max-width:100%; margin-top:${space.s2}; }
.pf-message .qr-media { max-width:100%; max-height:360px; object-fit:contain; }
.pf-message .qr-media-link { max-width:100%; }
.pf-report-details { margin-top: 12px; }
.pf-report-details summary { cursor: pointer; color: var(--text); }
.pf-journal-actions { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
.pf-note-input { margin:8px 0; min-height:72px; }
.pf-history-setup { margin-top:14px; border-top:1px solid var(--line); padding-top:12px; }
.pf-history-setup > summary { cursor:pointer; min-height:28px; font-weight:600; }
.pf-history-option { display:flex; align-items:center; gap:10px; min-height:34px; font-size:13px; color:var(--muted); }
.pf-history-option input { width:18px; height:18px; accent-color:var(--accent); flex:none; }
.pf-history-option select { width:150px; margin:8px 0; }
.pf-timeline { list-style:none; margin:12px 0 0; padding:0; }
.pf-timeline li { display:flex; flex-direction:column; gap:4px; border-left:1px solid var(--line2); padding:4px 0 14px 14px; overflow-wrap:anywhere; font-size:13px; }
.pf-timeline time { font-size:11px; color:var(--faint); }
.history-event { border:1px solid var(--line); border-radius:${radius.m}; background:var(--inset); }
.history-event > summary { min-height:30px; padding:${space.s2}; display:flex; align-items:flex-start; gap:${space.s2}; cursor:pointer; }
.history-event-heading { min-width:0; display:flex; flex-direction:column; gap:${space.s1}; }
.history-event-icon { flex:none; display:flex; margin-top:2px; color:var(--muted); }
.history-event-preview { color:var(--muted); font-size:12px; overflow-wrap:anywhere; }
.history-event-body { padding:0 ${space.s3} ${space.s3}; }
.history-event-body > pre { margin:0; }
.history-event > summary::after { content:"›"; margin-left:auto; color:var(--muted); transform:rotate(0deg); transition:transform ${motion.fast} var(--ease); }
.history-event[open] > summary::after { transform:rotate(90deg); }
.report-metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr)); gap:${space.s2}; margin:${space.s3} 0; }
.report-metrics > div { min-width:0; padding:${space.s3}; border:1px solid var(--line); border-radius:${radius.m}; background:var(--inset); }
.report-metrics dt { color:var(--muted); font-size:12px; }
.report-metrics dd { margin:${space.s1} 0 0; font-size:20px; font-weight:${type.heavy}; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
.report-metrics dd.report-metric-unavailable { font-size:13px; font-weight:500; color:var(--muted); }
.report-summary > details > summary { min-height:28px; cursor:pointer; }
.report-summary > details svg { vertical-align:middle; }
.intel-record-icon { display:grid; place-items:center; color:var(--muted); }
.pf-body,.intel-workspace-body,.panel,.qr-list { overscroll-behavior:contain; scrollbar-gutter:stable; }
.history-event > summary:hover,.intel-record-heading:hover { background:var(--hover); }
.history-event > summary,.intel-record-heading { transition:background-color ${motion.fast} var(--ease); }
@media (prefers-reduced-motion:reduce) { .history-event > summary::after { transition:none; } }
.pf-server-context { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
.pf-server-context select { width:min(100%,320px); }
.pf-report-card { padding: 12px; border-radius: ${radius.m}; border: 1px solid var(--line); background: var(--inset); }
.pf-report-card > summary { font-size: 13px; font-weight: ${type.heavy}; }
.pf-report-card[open] > summary { margin-bottom: 12px; }
.pf-report-card .pf-facts { font-size: 12px; gap: 8px 12px; }
.pf-report-card dd { font-weight: 500; }
.pf-report-structured summary { font-size: 12px; color: var(--accent); cursor: pointer; }
.pf-report-structured pre { max-height: 240px; overflow: auto; margin: 8px 0 0; }
.intel-group { margin-top: 14px; border: 1px solid var(--line2); border-radius: 10px; overflow: hidden; background: var(--raised); }
.intel-group-heading { display: flex; align-items: center; gap: 12px; padding: 14px; cursor: pointer; list-style: none; }
.intel-group-heading::after { content: "⌄"; color: var(--faint); }
.intel-group:not([open]) > .intel-group-heading::after { content: "›"; }
.intel-group-icon { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); flex: none; }
.intel-heading-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; font-size: 13px; }
.intel-count { padding: 3px 8px; border-radius: 20px; font-size: 10px; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; }
.intel-record-heading { display: flex; align-items: center; gap: 10px; list-style: none; }
.intel-record-heading::after { content: "›"; margin-left: auto; color: var(--faint); }
.pf-report-card[open] > .intel-record-heading::after { content: "⌄"; }
.intel-avatar { width: 40px; height: 40px; flex: none; border-radius: 10px; object-fit: cover; display: grid; place-items: center; background: var(--seg); color: var(--muted); }
.intel-group .pf-report-card { margin: 0 12px 12px; }
.intel-workspace { grid-template-rows: auto auto minmax(0,1fr); height: min(86vh,860px); }
.intel-workspace-head { display: flex; align-items: center; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--line); font-size: 13px; letter-spacing: .06em; }
.intel-workspace-head strong { flex: 1; }
.intel-tabs { display: flex; gap: 6px; padding: 12px 22px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.intel-tabs [aria-pressed="true"] { background: var(--accent); color: var(--onAccent); }
.intel-workspace-body { padding: 20px 22px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
.intel-workspace-body h2 { margin: 0; font-size: 19px; }
.intel-workspace-body input[type="file"] { width: 100%; padding: 10px; border: 1px solid var(--line2); border-radius: 8px; background: var(--inset); color: var(--muted); font: inherit; font-size: 13px; }
.intel-workspace-body input::file-selector-button { padding: 7px 10px; margin-right: 12px; border: 1px solid var(--line2); border-radius: 6px; background: var(--seg); color: var(--text); font: inherit; cursor: pointer; }
.intel-workspace-body input::file-selector-button:hover { background: var(--hover); }
.pf-report-details > pre { max-height: 320px; overflow: auto; }
.intel-workspace-body audio, .intel-workspace-body video { display: block; max-width: 100%; max-height: 300px; margin: 12px 0; }
.pf-navigation { width: 100%; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; display: flex; align-items: center; gap: 10px; padding: 6px; border-radius: 6px; cursor: pointer; min-width: 0; }
.pf-navigation:hover { background: var(--hover); }
.pf-navigation .pf-item-sub { white-space: normal; overflow-wrap: anywhere; }
.pf-foot { flex-wrap: wrap; }
.pf-body { min-height: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: 12px; padding: 20px 24px; scrollbar-width: thin; scrollbar-color: var(--line2) transparent; }
.pf-block { min-width: 0; padding: 14px 16px; border-radius: ${radius.m}; background: var(--inset); border: 1px solid var(--line); }
.pf-block.wide { grid-column: 1 / -1; }
.pf-title { margin: 0 0 10px; font-size: 12px; font-weight: ${type.heavy}; color: var(--faint); }
.pf-bio { margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text); }
.pf-facts { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px 14px; font-size: 13px; }
.pf-facts dt { color: var(--muted); }
.pf-facts dd { margin: 0; color: var(--text); font-weight: 600; overflow-wrap: anywhere; }
.pf-roles { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
.pf-role { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 9px; border-radius: ${radius.s}; background: var(--seg); font-size: 12.5px; font-weight: 600; color: var(--text); }
.pf-role-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--faint); }
.pf-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.pf-list.compact { gap: 4px; font-size: 13px; }
.pf-item { display: flex; align-items: center; gap: 10px; min-width: 0; color: var(--text); }
.pf-icon { width: 28px; height: 28px; flex: none; border-radius: ${radius.m}; object-fit: cover; background: var(--seg); font-size: 12px; }
.pf-item-text { display: flex; flex-direction: column; min-width: 0; }
.pf-item-name { font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf-item-sub { font-size: 12px; color: var(--muted); }
.pf-verified { margin-left: auto; font-size: 11px; font-weight: 700; color: var(--ok); }
.pf-note { margin: 8px 0 0; font-size: 12.5px; color: var(--muted); }
.pf-timeline li > span { white-space: pre-wrap; overflow-wrap: anywhere; }
.msg.qr-deleted { border: 1px dashed var(--line2); background: var(--inset); }
.qr-deleted-label { display: block; margin-bottom: 6px; color: var(--muted); font-size: 10px; font-weight: 600; letter-spacing: .02em; }
.recording-status { position:fixed; top:52px; left:50%; transform:translateX(-50%); z-index:20; padding:9px 14px; max-width:90vw; border:1px solid #8e6565; border-radius:20px; color:#ffe4e4; background:#39282b; font:600 12px "Segoe UI",sans-serif; cursor:pointer; }
.recording-status[hidden] { display:none; }
.intel-live { display:flex; flex-direction:column; gap:12px; }
.pf-report-data a,.pf-bio a { color:var(--accent); text-decoration:underline; text-underline-offset:3px; }
.pf-foot { display: flex; align-items: center; gap: 8px; padding: 12px 24px; border-top: 1px solid var(--line); }
.pf-id { font-size: 12px; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf-spacer { flex: 1; }
@container (max-width: 560px) {
  .pf-head { grid-template-columns: 1fr; margin-top: -44px; padding: 0 16px; }
  .pf-body { grid-template-columns: 1fr; padding: 16px; }
  .pf-foot { flex-wrap: wrap; padding: 12px 16px; }
  .pf-id { flex-basis: 100%; }
  .pf-spacer { display: none; }
}
${seasonalShadowCss}
${shadowDropdownCss}

.pf-view-tabs { display:flex;flex-wrap:wrap;gap:6px;position:sticky;top:-20px;z-index:2;padding:8px 0;background:var(--raised);border-bottom:1px solid var(--line); }
.pf-view-tabs [aria-selected="true"] { background:var(--accentSoft);box-shadow:inset 0 0 0 1px var(--accent);color:var(--text); }
.profile-change-tags { display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:8px 0; }
  .pf-presence-details { display:grid;grid-template-columns:minmax(128px,1fr) minmax(0,2fr);align-items:baseline;gap:8px 16px;margin:12px 0;overflow-wrap:anywhere; }
  .pf-presence-details .pf-note { grid-column:1/-1;margin:0; }
.profile-change-tag { display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:12px;border:1px solid var(--line2);font-size:11px;line-height:1.2;background:var(--seg);color:var(--muted); }
.profile-change-tag.important { color:var(--text);background:var(--accentSoft);border-color:var(--accent); }
.pf-timeline li[data-unreviewed] { border-left:2px solid var(--accent);background:var(--inset);border-radius:0 8px 8px 0; }
.profile-art-change { display:flex;flex-wrap:wrap;gap:16px; }
.profile-art-change figure { margin:8px 0;flex:1;min-width:120px;max-width:240px; }
.profile-art-change figcaption { font-size:12px;color:var(--muted); }
.history-audio audio,.recording-row audio { max-width:100%;width:100%;margin:8px 0; }
.recording-row { display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line); }
`;
