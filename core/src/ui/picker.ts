/**
 * The plugin picker: every plugin xray can run, xray's own and Equicord's,
 * in one searchable list with a switch each, plus a few starting points.
 * It opens by itself the first time you log in with Equicord present, and
 * any time from Ctrl+K ("Choose plugins") or the panel.
 *
 * Nothing changes until you press Apply. xray's plugins switch on and off
 * right away; Equicord's are read when Discord starts, so if any of those
 * changed, Apply reloads Discord.
 */
import { onAction } from "../api/flux";
import { loggedIn } from "../discord";
import { isEnabled, plugins, setEnabled } from "../plugins/manager";
import type { Plugin } from "../plugins/types";
import { markPluginsPicked, pickedPlugins } from "../settings";
import { h } from "./dom";
import { uiRoot } from "./root";
import { score } from "./search";

type Source = "xray" | "Equicord";

interface Choice {
  key: string;
  /** The plugin's own id (xray) or name (Equicord). */
  id: string;
  name: string;
  description: string;
  source: Source;
  /** On right now. */
  current: boolean;
  /** On by default in its own mod. */
  byDefault: boolean;
  apply: (on: boolean) => void;
}

/**
 * Equicord plugins switched on by "Recommended", on top of Equicord's own
 * defaults: well-known, light ones, weighted toward profiles and right-click
 * menus on people, which is what xray is asked for most.
 */
const RECOMMENDED = new Set([
  "BetterGifAltText", "CallTimer", "ClearURLs", "CopyUserMention", "CopyUserURLs", "FixYoutubeEmbeds",
  "FullUserInChatbox", "ImageZoom", "JumpTo", "MemberCount", "MentionAvatars", "MessageLinkEmbeds",
  "MessageLinkTooltip", "MessageLogger", "MoreUserTags", "MutualGroupDMs", "NoF1", "PermissionsViewer",
  "PlatformIndicators", "ReplyTimestamp", "ReverseImageSearch", "ServerInfo", "ShowConnections",
  "ShowHiddenChannels", "TypingIndicator", "TypingTweaks", "UserVoiceShow", "ValidReply", "ValidUser",
  "ViewIcons", "WhoReacted",
]);
/** xray plugins kept by "Just the basics". */
const BASICS = new Set(["voiceBar", "fakeDeafen", "declutter", "accountDetails"]);

type Filter = "All" | "On" | Source;

let open = false;

/** Shows the picker once, the first time you're logged in with Equicord present. */
export function offerPickerOnFirstRun(): void {
  if (pickedPlugins() || !equicord()) return;
  const show = () => {
    if (!pickedPlugins() && loggedIn()) showPicker();
  };
  if (loggedIn()) show();
  else {
    const stop = onAction("CONNECTION_OPEN", () => {
      stop();
      // Let Discord draw its first screen before covering it.
      window.setTimeout(show, 1500);
    });
  }
}

export function showPicker(): void {
  if (open) return;
  open = true;
  const choices = gather();
  const wanted = new Map(choices.map((c) => [c.key, c.current]));
  let query = "";
  let filter: Filter = "All";

  const count = h("span", { class: "pk-count" });
  const list = h("div", { class: "pk-list", attrs: { role: "list" } });
  const render = () => {
    const q = query.trim();
    let shown = choices.filter((c) => (filter === "All" ? true : filter === "On" ? wanted.get(c.key) : c.source === filter));
    if (q) {
      shown = shown
        .map((c) => ({ c, s: Math.max(score(q, c.name), score(q, c.description) * 0.6) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((r) => r.c);
    }
    list.replaceChildren(...(shown.length ? shown.map(row) : [h("div", { class: "pk-empty", text: "No plugins match." })]));
    const on = [...wanted.values()].filter(Boolean).length;
    count.textContent = `${on} of ${choices.length} on`;
  };
  const row = (choice: Choice) => {
    const on = wanted.get(choice.key)!;
    const toggle = h(
      "button",
      {
        class: "switch small",
        attrs: { type: "button", role: "switch", "aria-checked": String(on), "aria-label": choice.name },
        on: {
          click: () => {
            wanted.set(choice.key, !wanted.get(choice.key));
            render();
          },
        },
      },
      h("span"),
    );
    return h(
      "div",
      { class: "pk-row", attrs: { role: "listitem" } },
      h(
        "div",
        { class: "pk-text" },
        h("div", { class: "pk-name" }, choice.name, h("span", { class: choice.source === "xray" ? "pk-src xray" : "pk-src", text: choice.source })),
        choice.description ? h("div", { class: "pk-desc", text: choice.description }) : null,
      ),
      toggle,
    );
  };

  const preset = (label: string, pick: (c: Choice) => boolean) =>
    h("button", {
      class: "chip-filter",
      attrs: { type: "button" },
      text: label,
      on: {
        click: () => {
          for (const c of choices) wanted.set(c.key, pick(c));
          render();
        },
      },
    });
  const filters = h(
    "div",
    { class: "chips", attrs: { role: "tablist", "aria-label": "Show" } },
    ...(["All", "On", "xray", "Equicord"] as Filter[]).map((f) =>
      h("button", {
        class: f === filter ? "chip-filter on" : "chip-filter",
        attrs: { type: "button", role: "tab", "aria-selected": String(f === filter) },
        text: f,
        on: {
          click: (event: Event) => {
            filter = f;
            (event.currentTarget as HTMLElement).parentElement?.querySelectorAll(".chip-filter").forEach((chip) => {
              chip.classList.toggle("on", chip.textContent === f);
              chip.setAttribute("aria-selected", String(chip.textContent === f));
            });
            render();
          },
        },
      }),
    ),
  );
  const search = h("input", {
    class: "plugin-search",
    attrs: { type: "search", placeholder: `Search ${choices.length} plugins`, "aria-label": "Search plugins", spellcheck: "false" },
    on: {
      input: (event: Event) => {
        query = (event.target as HTMLInputElement).value;
        render();
      },
    },
  });

  const close = () => {
    scrim.remove();
    open = false;
    markPluginsPicked();
  };
  const apply = () => {
    let reload = false;
    for (const c of choices) {
      const on = wanted.get(c.key)!;
      if (on === c.current) continue;
      c.apply(on);
      if (c.source === "Equicord") reload = true;
    }
    close();
    if (reload) location.reload();
  };

  const dialog = h(
    "div",
    { class: "picker", attrs: { role: "dialog", "aria-label": "Choose your plugins" } },
    h(
      "div",
      { class: "pk-head" },
      h("div", { class: "pk-title", text: "Choose your plugins" }),
      h("div", { class: "pk-sub", text: "Everything xray can run, its own and Equicord's. Switch on what you want; you can change it any time from Ctrl+K." }),
    ),
    h(
      "div",
      { class: "pk-presets" },
      h("span", { class: "pk-presets-label", text: "Start from" }),
      preset("Recommended", (c) => c.byDefault || (c.source === "Equicord" && RECOMMENDED.has(c.id))),
      preset("Just the basics", (c) => (c.source === "xray" ? BASICS.has(c.id) : c.byDefault)),
      preset("What I have now", (c) => c.current),
    ),
    h("div", { class: "plugin-tools" }, search, filters),
    list,
    h(
      "div",
      { class: "pk-foot" },
      count,
      h("span", { class: "pk-spacer" }),
      h("button", { class: "btn ghost", attrs: { type: "button" }, text: "Not now", on: { click: close } }),
      h("button", { class: "btn", attrs: { type: "button" }, text: "Apply", on: { click: apply } }),
    ),
  );
  const scrim = h("div", { class: "scrim pk-scrim" }, dialog);
  uiRoot().append(scrim);
  render();
  search.focus();
}

function gather(): Choice[] {
  const choices: Choice[] = plugins.map((plugin: Plugin) => ({
    key: `xray:${plugin.id}`,
    id: plugin.id,
    name: plugin.name,
    description: plugin.description,
    source: "xray" as const,
    current: isEnabled(plugin),
    byDefault: plugin.enabledByDefault,
    apply: (on: boolean) => setEnabled(plugin, on),
  }));
  const eq = equicord();
  if (eq) {
    for (const plugin of Object.values(eq.plugins) as any[]) {
      // Required and hidden ones are internal, and the *API ones are libraries
      // that switch on by themselves when a plugin needs them.
      if (!plugin?.name || plugin.required || plugin.hidden || /API$/.test(plugin.name)) continue;
      choices.push({
        key: `eq:${plugin.name}`,
        id: plugin.name,
        name: plugin.name,
        description: typeof plugin.description === "string" ? plugin.description : "",
        source: "Equicord",
        current: eq.isEnabled(plugin.name),
        byDefault: plugin.enabledByDefault === true,
        apply: (on: boolean) => {
          (eq.settings[plugin.name] ??= {}).enabled = on;
        },
      });
    }
  }
  return choices.sort((a, b) => a.name.localeCompare(b.name));
}

function equicord(): { plugins: Record<string, unknown>; settings: Record<string, { enabled?: boolean }>; isEnabled: (name: string) => boolean } | undefined {
  const vencord = (window as any).Vencord;
  const manager = vencord?.Plugins;
  const settings = vencord?.Settings?.plugins;
  if (!manager?.plugins || !settings || typeof manager.isPluginEnabled !== "function") return undefined;
  return { plugins: manager.plugins, settings, isEnabled: (name) => manager.isPluginEnabled(name) };
}
