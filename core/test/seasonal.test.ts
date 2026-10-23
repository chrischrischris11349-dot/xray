import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseHTML } from "linkedom";
import { palettes, paletteVariables } from "../src/theme/palettes";
import { contrast } from "../src/theme/tokens";
import { halloweenMark, seasonalShadowCss } from "../src/theme/seasonal";

test("Halloween preserves readable semantic text across all surfaces", () => {
  const p = palettes.halloween;
  for (const surface of [p.base, p.side, p.chat, p.raised]) {
    for (const text of [p.text, p.muted, p.faint, p.accent]) {
      assert.ok(contrast(text, surface) >= 4.5, `${text} on ${surface}`);
    }
  }
  assert.ok(contrast(p.onAccent, p.accent) >= 4.5);
  const variables = paletteVariables(p);
  assert.equal(variables["--accent"], p.accent);
  assert.equal(variables["--raised"], p.raised);
  assert.equal(variables["--inset"], p.chat);
  assert.equal(variables["--accentSoft"], p.wash);
  for (const [name, palette] of Object.entries(palettes)) {
    const expected = name === "silver" || name === "offWhite" ? "light" : "dark";
    assert.equal(palette.colorScheme, expected);
    assert.equal(paletteVariables(palette)["--xr-color-scheme"], expected);
  }
});

test("Seasonal decoration is local vector artwork scoped to the optional palette", () => {
  const { document } = parseHTML(halloweenMark);
  assert.equal(document.querySelectorAll("svg").length, 1);
  assert.equal(document.querySelectorAll("g").length, 2);
  assert.equal(document.querySelectorAll("image, script, foreignObject, animate").length, 0);
  assert.match(seasonalShadowCss, /^\s*:host\(\[data-palette="halloween"\]\)/);
  assert.ok(seasonalShadowCss.includes(encodeURIComponent(halloweenMark)));
  assert.match(seasonalShadowCss, /forced-colors:active/);
  assert.match(seasonalShadowCss, /prefers-contrast:more/);
  assert.doesNotMatch(seasonalShadowCss, /animation:|https?:\/\//);
});
