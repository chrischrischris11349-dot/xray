import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseHTML } from "linkedom";

const outfile = resolve("node_modules/.cache/xray/dropdowns.test.cjs");
mkdirSync(resolve("node_modules/.cache/xray"), { recursive: true });
await build({
  entryPoints: ["core/src/ui/dropdownStyles.ts"], outfile, bundle: true,
  platform: "node", format: "cjs", logLevel: "warning",
});
const { shadowDropdownCss, discordDropdownCss } = createRequire(import.meta.url)(outfile);

function rules(css) {
  const { document } = parseHTML("<html><body></body></html>");
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  return [...style.sheet.cssRules];
}

function matchingRules(node, css) {
  return rules(css).filter(rule => {
    if (!rule.selectorText || rule.selectorText.includes(":host")) return false;
    // Linkedom has no focus/hover state. Browser fixture verification covers
    // these states; keep structural matching here independent of that state.
    return node.matches(rule.selectorText.replace(/:(?:focus-visible|hover)/g, ":not(*)"));
  });
}

test("native dialog and plugin selects share opaque, palette-aware option surfaces", () => {
  const { document } = parseHTML(`<html><body>
    <select class="dialog-input"><option id="dialog">Long server name</option></select>
    <select class="opt-input"><option id="plugin">High quality</option></select>
    <button id="unrelated">Ordinary button</button>
  </body></html>`);
  for (const id of ["dialog", "plugin"]) {
    const applied = matchingRules(document.getElementById(id), shadowDropdownCss);
    assert(applied.some(rule => rule.style.background === "var(--raised)"));
    assert(applied.some(rule => rule.style.color === "var(--text)"));
  }
  const field = document.querySelector("select");
  assert(matchingRules(field, shadowDropdownCss).some(rule => rule.style.getPropertyValue("appearance") === "auto"));
  assert(matchingRules(field, shadowDropdownCss).some(rule => rule.style.getPropertyValue("color-scheme") === "var(--xr-color-scheme, dark)"));
  assert.equal(matchingRules(document.getElementById("unrelated"), shadowDropdownCss).length, 0);
});

test("Discord Select popups get palette surfaces without overriding placement or unrelated listboxes", () => {
  const { document } = parseHTML(`<html class="xray-obsidian"><body>
    <div id="field" class="select_abc lookFilled_abc" role="button"></div>
    <div id="popup" class="popout_abc" role="listbox"><div id="selected" role="option" aria-selected="true">Selected</div></div>
    <div id="search" role="listbox"><div role="option">Search result</div></div>
    <div id="popover" class="popout_abc">Unrelated profile popover</div>
  </body></html>`);
  const fieldRules = matchingRules(document.getElementById("field"), discordDropdownCss);
  assert(fieldRules.some(rule => rule.style.background === "var(--xr-field)"));
  const popupRules = matchingRules(document.getElementById("popup"), discordDropdownCss);
  assert(popupRules.some(rule => rule.style.background === "var(--xr-raised)"));
  for (const rule of popupRules) {
    for (const property of ["position", "top", "left", "transform", "z-index", "overflow", "height"]) {
      assert.equal(rule.style.getPropertyValue(property), "", `Discord retains ${property}`);
    }
  }
  assert(matchingRules(document.getElementById("selected"), discordDropdownCss).some(rule => rule.style.background === "var(--xr-selected)"));
  assert.equal(matchingRules(document.getElementById("search"), discordDropdownCss).length, 0);
  assert.equal(matchingRules(document.getElementById("popover"), discordDropdownCss).length, 0);
  document.documentElement.classList.remove("xray-obsidian");
  assert.equal(matchingRules(document.getElementById("popup"), discordDropdownCss).length, 0);
});

test("narrow settings rows let both the label and selector shrink independently", () => {
  const { document } = parseHTML(`<html><body>
    <div class="row appearance-row"><label id="label">Color palette</label><select class="dialog-input"></select></div>
    <div class="opt" id="plugin-row"><div class="opt-text">Playback resolution</div><select class="opt-input"></select></div>
  </body></html>`);
  assert(matchingRules(document.querySelector(".appearance-row"), shadowDropdownCss).some(rule => rule.style.getPropertyValue("grid-template-columns") === "minmax(0,1fr) minmax(0,1.8fr)"));
  assert(matchingRules(document.getElementById("label"), shadowDropdownCss).some(rule => rule.style.getPropertyValue("white-space") === "normal"));
  assert(matchingRules(document.getElementById("plugin-row"), shadowDropdownCss).some(rule => rule.style.display === "grid"));
});
