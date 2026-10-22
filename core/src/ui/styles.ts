/**
 * xray's own UI (panel, picker, dialogs, palette, voice bar) in the "mist
 * and oak" design language; every value comes from theme/tokens.ts (see
 * docs/DESIGN.md). Text is Discord's own gg sans; mono is only for key caps
 * and code.
 */
import { accent, edge, ink, mist, motion, radius, type } from "../theme/tokens";
export const css = `
* { box-sizing: border-box; }
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
.mono { font-family: "Cascadia Mono", Consolas, ui-monospace, monospace; }
.label { font-size: 12px; font-weight: ${type.heavy}; color: var(--faint); }

.panel {
  position: fixed; top: 52px; right: 16px; z-index: 2147483000;
  width: 420px; max-height: calc(100vh - 72px); overflow-y: auto; padding: 8px;
  border-radius: ${radius.l}; background: rgba(34,38,42,.94);
  backdrop-filter: saturate(180%) blur(24px);
  box-shadow: 0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(237,233,226,.09), inset 0 1px 0 rgba(237,233,226,.07);
  scrollbar-width: thin; scrollbar-color: var(--line2) transparent;
  animation: pop ${motion.rise} var(--ease);
}
@keyframes pop { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
/* Reduced motion: nothing rises or fades in xray's own UI. */
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }

.head { display: flex; align-items: center; gap: 10px; padding: 8px 8px 12px; }
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

.switch { width: 44px; height: 26px; flex: none; padding: 2px; border: 0; border-radius: 13px; background: var(--switchOff); display: flex; justify-content: flex-start; cursor: pointer; transition: background-color 120ms ease; }
.switch span { width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.switch[aria-checked="true"] { background: var(--accent); justify-content: flex-end; }
.switch[aria-checked="true"] span { background: var(--onAccent); }

.reload { margin: 8px 2px 0; display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 14px; border-radius: ${radius.m}; background: var(--accentSoft); border: 1px solid var(--line); font-size: 13px; }
.reload span { flex: 1; }
.btn { height: 30px; padding: 0 14px; border: 0; border-radius: ${radius.m}; background: var(--accent); color: var(--onAccent); font: 600 13px ${type.family}; cursor: pointer; transition: transform 120ms var(--ease); }
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
  background: rgba(34,38,42,.94); backdrop-filter: saturate(180%) blur(24px);
  box-shadow: 0 20px 50px rgba(0,0,0,.5), 0 0 0 1px rgba(237,233,226,.09);
  font-size: 13.5px; animation: pop ${motion.rise} var(--ease);
}
.kbd { padding: 1px 6px; border-radius: ${radius.s}; border: 1px solid var(--line2); font-family: "Cascadia Mono", Consolas, monospace; font-size: 11px; color: var(--muted); }

/* Shared glass for floating surfaces */
.bubble, .qr, .palette {
  background: rgba(34,38,42,.94);
  backdrop-filter: saturate(180%) blur(24px);
  box-shadow: 0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(237,233,226,.09), inset 0 1px 0 rgba(237,233,226,.07);
}

/* Quick reply */
.bubble {
  position: fixed; right: 20px; bottom: 92px; z-index: 2147482990;
  width: 48px; height: 48px; padding: 0; border: 0; border-radius: 50%;
  color: var(--text); display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: transform 120ms var(--ease);
}
.bubble:active { transform: scale(.94); }
.badge {
  position: absolute; top: -3px; right: -3px; min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: ${radius.m}; border: 2px solid #0b0b0b; background: #d92d20; color: #fff;
  font: 700 11px/16px ${type.family}; text-align: center;
}
.qr {
  position: fixed; right: 20px; bottom: 152px; z-index: 2147482995;
  width: 360px; height: 480px; max-height: calc(100vh - 180px);
  display: flex; flex-direction: column; overflow: hidden; border-radius: ${radius.l};
  animation: rise ${motion.rise} var(--ease); transform-origin: bottom right;
}
@keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.qr-head { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 12px 10px 16px; border-bottom: 1px solid var(--line); }
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
.msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; scrollbar-width: thin; scrollbar-color: var(--line2) transparent; }
.msg { align-self: flex-start; max-width: 78%; padding: 8px 12px; border-radius: ${radius.m}; background: rgba(237,233,226,.08); font-size: 14px; line-height: 1.35; white-space: pre-wrap; overflow-wrap: anywhere; }
.msg.mine { align-self: flex-end; border-radius: ${radius.m}; background: var(--accent); color: var(--onAccent); }
.msg-author { margin: 6px 4px 0; font-size: 12px; font-weight: 700; color: var(--faint); }
.reply { flex: none; padding: 10px 12px 12px; border-top: 1px solid var(--line); }
.reply-field { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 4px 0 14px; border-radius: ${radius.l}; background: rgba(237,233,226,.05); border: 1px solid var(--line); }
.reply-field:focus-within { border-color: rgba(237,233,226,.22); }
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
.dialog { width: min(500px, 100%); max-height: 80vh; overflow: auto; display: flex; flex-direction: column; gap: 14px; padding: 20px; border-radius: ${radius.l}; background: rgba(34,38,42,.94); backdrop-filter: saturate(180%) blur(24px); box-shadow: 0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(237,233,226,.09), inset 0 1px 0 rgba(237,233,226,.07); animation: pop ${motion.rise} var(--ease); scrollbar-width: thin; scrollbar-color: var(--line2) transparent; }
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
select.opt-input option { background: #181818; color: var(--text); }
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
.lock-card { width: 300px; display: flex; flex-direction: column; gap: 12px; padding: 24px; border-radius: ${radius.l}; background: rgba(34,38,42,.94); box-shadow: 0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(237,233,226,.09); }
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
.win-btns { position: fixed; top: 0; right: 0; height: 46px; z-index: 2147482992; display: flex; align-items: center; padding-right: 4px; gap: 2px; }
.win-btn { width: 38px; height: 30px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: ${radius.m}; background: transparent; color: var(--muted); cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.win-btn:hover { background: rgba(237,233,226,.07); color: var(--text); }
.win-btn.close:hover { background: #c42b1c; color: #fff; }

/* Title-bar voice controls (plugins/voiceBar.ts), left of the window buttons. */
.xray-vbar { position: fixed; top: 0; right: 128px; height: 46px; z-index: 2147482991; display: flex; align-items: center; gap: 2px; }
.xray-vbar button { width: 36px; height: 30px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: ${radius.m}; background: transparent; color: var(--muted); cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.xray-vbar button:hover { background: rgba(237,233,226,.07); color: var(--text); }
.xray-vbar button[aria-pressed="true"] { background: rgba(255,90,90,.16); color: #ff6b5b; }
.xray-vbar button.cam[aria-pressed="true"] { background: rgba(61,214,140,.16); color: #3dd68c; }
.xray-vbar button[disabled] { opacity: .35; pointer-events: none; }
:host-context(html:not(.xray-obsidian)) .xray-vbar { display: none; }
/* Plugin picker (picker.ts): a tall glass sheet with one scrolling list. */
.pk-scrim { align-items: center; padding: 24px; }
.picker { width: min(760px, 100%); height: min(86vh, 900px); display: flex; flex-direction: column; gap: 12px; padding: 22px 22px 16px; border-radius: ${radius.l}; background: rgba(34,38,42,.97); box-shadow: 0 40px 90px rgba(0,0,0,.65), 0 0 0 1px rgba(237,233,226,.09), inset 0 1px 0 rgba(237,233,226,.07); font-family: "gg sans", "Segoe UI", system-ui, sans-serif; animation: pop ${motion.rise} var(--ease); }
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
.pf-banner { height: 136px; background: center / cover no-repeat ${mist.m4}; }
.pf-banner.mist { --pf-tint: ${accent.oak}; background: radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--pf-tint) 28%, transparent), transparent 60%), radial-gradient(90% 120% at 100% 100%, rgba(124,138,146,.22), transparent 62%), ${mist.m4}; }
.pf-head { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 16px; align-items: end; padding: 0 24px; margin-top: -48px; }
.pf-avatar-wrap { width: 104px; height: 104px; padding: 6px; border-radius: 50%; background: var(--raised); }
.pf-avatar { width: 92px; height: 92px; border-radius: 50%; object-fit: cover; display: block; background: ${mist.m4}; }
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
.pf-badge { padding: 2px 8px; border-radius: ${radius.s}; border: 1px solid var(--line2); font-size: 12px; font-weight: 600; color: var(--muted); }
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
`;
