/**
 * The plugin list in the panel: search, category filters, a switch per
 * plugin, and each plugin's settings folded under it. It redraws only
 * itself while you type, so the search box keeps focus.
 */
import { isEnabled, optionValue, plugins, setEnabled, setOption } from "../plugins/manager";
import type { Category, Impact, Plugin, PluginOption } from "../plugins/types";
import { h } from "./dom";
import { score } from "./search";

const RATING: Record<Impact, { label: string; color: string }> = {
  light: { label: "Light", color: "var(--ok)" },
  moderate: { label: "Moderate", color: "var(--warn)" },
  heavy: { label: "Heavy", color: "var(--bad)" },
};

const CHEVRON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`;

type Filter = Category | "All" | "On";

let query = "";
let filter: Filter = "All";
const expanded = new Set<string>();
let host: HTMLElement | undefined;

/** The whole section: search, filters and the list. Rebuilt with the panel. */
export function pluginSection(): HTMLElement {
  const search = h("input", {
    class: "plugin-search",
    attrs: { type: "search", placeholder: `Search ${plugins.length} plugins`, "aria-label": "Search plugins", spellcheck: "false" },
    on: {
      input: (event: Event) => {
        query = (event.target as HTMLInputElement).value;
        renderList();
      },
    },
  });
  search.value = query;
  host = h("div", { class: "plugin-host" });
  renderList();
  return h("div", { class: "plugins" }, h("div", { class: "plugin-tools" }, search, filters()), host);
}

function filters(): HTMLElement {
  const used = new Set(plugins.map((p) => p.category));
  const choices: Filter[] = ["All", "On", ...([...used].sort() as Category[])];
  return h(
    "div",
    { class: "chips", attrs: { role: "tablist", "aria-label": "Plugin categories" } },
    ...choices.map((choice) =>
      h("button", {
        class: choice === filter ? "chip-filter on" : "chip-filter",
        attrs: { type: "button", role: "tab", "aria-selected": String(choice === filter) },
        text: choice,
        on: {
          click: (event: Event) => {
            filter = choice;
            const row = (event.currentTarget as HTMLElement).parentElement;
            row?.querySelectorAll(".chip-filter").forEach((chip) => {
              const on = chip.textContent === choice;
              chip.classList.toggle("on", on);
              chip.setAttribute("aria-selected", String(on));
            });
            renderList();
          },
        },
      }),
    ),
  );
}

function visible(): Plugin[] {
  const q = query.trim();
  let list = plugins.filter((p) => (filter === "All" ? true : filter === "On" ? isEnabled(p) : p.category === filter));
  if (q) {
    list = list
      .map((p) => ({ p, s: Math.max(score(q, p.name), score(q, p.description) * 0.6, score(q, p.category) * 0.5) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.p);
  }
  return list;
}

function renderList(): void {
  if (!host) return;
  const list = visible();
  host.replaceChildren(
    list.length
      ? h("div", { class: "list" }, ...list.map(row))
      : h("div", { class: "list" }, h("div", { class: "row" }, h("span", { class: "row-desc", text: "No plugins match." }))),
  );
}

function row(plugin: Plugin): HTMLElement {
  const on = isEnabled(plugin);
  const rating = RATING[plugin.impact];
  const dot = h("span", { class: "dot" });
  dot.style.background = rating.color;
  const ratingEl = h("span", { class: "rating" }, dot, rating.label);
  ratingEl.style.color = rating.color;
  const hasOptions = !!plugin.options && Object.keys(plugin.options).length > 0;
  const open = hasOptions && expanded.has(plugin.id);
  const settingsButton = hasOptions
    ? h(
        "button",
        {
          class: open ? "settings-toggle open" : "settings-toggle",
          attrs: { type: "button", "aria-expanded": String(open), "aria-label": `${plugin.name} settings` },
          on: {
            click: () => {
              if (expanded.has(plugin.id)) expanded.delete(plugin.id);
              else expanded.add(plugin.id);
              renderList();
            },
          },
        },
        h("span", { text: "Settings" }),
        h("span", { class: "chev", trustedHtml: CHEVRON }),
      )
    : null;
  const main = h(
    "div",
    { class: "row" },
    h(
      "div",
      { class: "row-text" },
      h("div", { class: "row-name" }, plugin.name, h("span", { class: "tag", text: plugin.category })),
      h("div", { class: "row-desc", text: plugin.description }),
      h(
        "div",
        { class: "row-meta" },
        ratingEl,
        h("span", { text: `${plugin.impactReason} · ${plugin.needsReload ? "needs a reload" : "applies instantly"}` }),
        settingsButton,
      ),
    ),
    h(
      "button",
      {
        class: "switch",
        attrs: { type: "button", role: "switch", "aria-checked": String(on), "aria-label": plugin.name },
        on: { click: () => setEnabled(plugin, !on) },
      },
      h("span"),
    ),
  );
  if (!open) return main;
  return h(
    "div",
    { class: "row-group" },
    main,
    h("div", { class: "options" }, ...Object.entries(plugin.options!).map(([key, option]) => optionControl(plugin, key, option))),
  );
}

function optionControl(plugin: Plugin, key: string, option: PluginOption): HTMLElement {
  const value = optionValue(plugin, key);
  const label = h("div", { class: "opt-text" }, h("div", { class: "opt-name", text: option.label }), option.description ? h("div", { class: "row-desc", text: option.description }) : null);
  const set = (next: unknown) => setOption(plugin, key, next);
  switch (option.type) {
    case "boolean":
      return h(
        "div",
        { class: "opt" },
        label,
        h(
          "button",
          { class: "switch small", attrs: { type: "button", role: "switch", "aria-checked": String(value), "aria-label": option.label }, on: { click: () => set(!value) } },
          h("span"),
        ),
      );
    case "number": {
      const input = h("input", { class: "opt-input num", attrs: { type: "number", "aria-label": option.label } });
      input.value = String(value);
      if (option.min !== undefined) input.min = String(option.min);
      if (option.max !== undefined) input.max = String(option.max);
      if (option.step !== undefined) input.step = String(option.step);
      input.addEventListener("change", () => {
        const n = Number(input.value);
        if (Number.isFinite(n)) set(Math.min(option.max ?? Infinity, Math.max(option.min ?? -Infinity, n)));
      });
      return h("div", { class: "opt" }, label, input);
    }
    case "select": {
      const select = h("select", { class: "opt-input", attrs: { "aria-label": option.label } });
      for (const choice of option.choices) {
        const el = h("option", { text: choice.label });
        el.value = choice.value;
        el.selected = choice.value === value;
        select.append(el);
      }
      select.addEventListener("change", () => set(select.value));
      return h("div", { class: "opt" }, label, select);
    }
    case "string": {
      const input = option.multiline
        ? h("textarea", { class: "opt-input wide", attrs: { rows: "3", placeholder: option.placeholder ?? "", "aria-label": option.label } })
        : h("input", { class: "opt-input wide", attrs: { type: "text", placeholder: option.placeholder ?? "", "aria-label": option.label } });
      input.value = String(value ?? "");
      // Saved when you leave the field (or press Enter), so typing doesn't restart the plugin per key.
      input.addEventListener("change", () => set(input.value));
      return h("div", { class: "opt stacked" }, label, input);
    }
    case "list": {
      const input = h("textarea", { class: "opt-input wide", attrs: { rows: "4", placeholder: option.placeholder ?? "One per line", "aria-label": option.label } });
      input.value = (value as string[]).join("\n");
      input.addEventListener("change", () =>
        set(
          input.value
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        ),
      );
      return h("div", { class: "opt stacked" }, label, input);
    }
  }
}
