/**
 * The Obsidian look from the UI preview. Fonts: Discord's page only allows
 * fonts from a few hosts, so the panel uses Discord's own gg sans for text
 * and Windows' Cascadia Mono for data labels.
 */
export const css = `
:host { all: initial; }
* { box-sizing: border-box; }
.panel, .toast {
  --text: #f2f3f5; --muted: #9a9ca5; --faint: #858790;
  --line: rgba(255,255,255,.065); --line2: rgba(255,255,255,.12);
  --seg: rgba(255,255,255,.055); --hover: rgba(255,255,255,.045); --inset: rgba(255,255,255,.035);
  --accent: #f2f3f5; --onAccent: #0b0b0d; --accentSoft: rgba(255,255,255,.09);
  --ok: #3dd68c; --warn: #f5b84a; --bad: #ff7a66; --switchOff: rgba(255,255,255,.16);
  --ease: cubic-bezier(.32,.72,0,1);
  color: var(--text);
  font: 14px/1.4 "gg sans", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.mono { font-family: "Cascadia Mono", Consolas, ui-monospace, monospace; }
.label { font-family: "Cascadia Mono", Consolas, ui-monospace, monospace; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--faint); }

.panel {
  position: fixed; top: 52px; right: 16px; z-index: 2147483000;
  width: 380px; max-height: calc(100vh - 72px); overflow-y: auto; padding: 8px;
  border-radius: 18px; background: rgba(22,22,26,.74);
  backdrop-filter: saturate(180%) blur(24px);
  box-shadow: 0 30px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.09), inset 0 1px 0 rgba(255,255,255,.07);
  scrollbar-width: thin; scrollbar-color: var(--line2) transparent;
  animation: pop 200ms var(--ease);
}
@keyframes pop { from { opacity: 0; transform: translateY(-6px) scale(.97); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .panel, .toast { animation: none; } }

.head { display: flex; align-items: center; gap: 10px; padding: 8px 8px 12px; }
.logo { display: flex; width: 22px; height: 22px; flex: none; }
.title { font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
.head .label { flex: 1; }
.icon-btn { width: 30px; height: 30px; flex: none; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; transition: background-color 120ms ease; }
.icon-btn:hover { background: var(--hover); color: var(--text); }

.card { margin: 0 2px 8px; padding: 12px 14px; border-radius: 14px; background: var(--inset); border: 1px solid var(--line); display: flex; align-items: center; gap: 14px; }
.card.on { background: var(--accentSoft); }
.card-text { flex: 1; min-width: 0; }
.card-title { font-size: 14px; font-weight: 600; }
.card-sub { margin-top: 2px; font-size: 12.5px; color: var(--muted); }

.section { display: flex; align-items: baseline; justify-content: space-between; padding: 14px 10px 6px; }
.impact { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 600; }
.meter { display: inline-flex; gap: 3px; }
.meter span { width: 14px; height: 4px; border-radius: 2px; background: var(--line2); }

.list { margin: 0 2px; border-radius: 14px; border: 1px solid var(--line); overflow: hidden; background: rgba(255,255,255,.02); }
.row { display: flex; align-items: center; gap: 14px; padding: 12px 14px; }
.row + .row { border-top: 1px solid var(--line); }
.row-text { flex: 1; min-width: 0; }
.row-name { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 14px; font-weight: 600; }
.tag { padding: 2px 6px; border-radius: 5px; background: var(--seg); color: var(--muted); font-family: "Cascadia Mono", Consolas, monospace; font-size: 10px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; }
.row-desc { margin-top: 2px; font-size: 13px; color: var(--muted); }
.row-meta { margin-top: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--faint); }
.dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.rating { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }

.switch { width: 44px; height: 26px; flex: none; padding: 2px; border: 0; border-radius: 13px; background: var(--switchOff); display: flex; justify-content: flex-start; cursor: pointer; transition: background-color 120ms ease; }
.switch span { width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
.switch[aria-checked="true"] { background: var(--accent); justify-content: flex-end; }
.switch[aria-checked="true"] span { background: var(--onAccent); }

.reload { margin: 8px 2px 0; display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 14px; border-radius: 12px; background: var(--accentSoft); border: 1px solid var(--line); font-size: 13px; }
.reload span { flex: 1; }
.btn { height: 30px; padding: 0 14px; border: 0; border-radius: 8px; background: var(--accent); color: var(--onAccent); font: 600 13px "gg sans", "Segoe UI", system-ui, sans-serif; cursor: pointer; transition: transform 120ms var(--ease); }
.btn:active, .switch:active, .icon-btn:active { transform: scale(.94); }

.chip { min-width: 84px; height: 30px; flex: none; padding: 0 10px; border: 1px solid var(--line2); border-radius: 8px; background: var(--seg); color: var(--text); font: 500 12px "Cascadia Mono", Consolas, ui-monospace, monospace; cursor: pointer; transition: background-color 120ms ease; }
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
  display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 14px;
  background: rgba(22,22,26,.82); backdrop-filter: saturate(180%) blur(24px);
  box-shadow: 0 20px 50px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.09);
  font-size: 13.5px; animation: pop 200ms var(--ease);
}
.kbd { padding: 1px 6px; border-radius: 5px; border: 1px solid var(--line2); font-family: "Cascadia Mono", Consolas, monospace; font-size: 11px; color: var(--muted); }
`;
