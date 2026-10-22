/**
 * Ctrl+K search: one box for your DMs, friends, channels (picking a voice
 * channel joins it), servers and xray's own commands. While it's switched on
 * it takes Ctrl+K from Discord's quick switcher; switched off, Ctrl+K is
 * Discord's again.
 *
 * Everything comes from Discord's stores and is gathered when the palette
 * opens, so it costs nothing while closed. Picking a result goes through
 * Discord's own router (or its "open DM" action for a friend).
 */
import { loggedIn, navigate, onStoresChanged, privateChannelActions, safeImage, stores, userView, voiceActions, whenStore } from "../discord";
import { h } from "./dom";
import { icon } from "./icons";
import type { Feature } from "./features";
import { onKey, uiRoot } from "./root";
import { rank, type Searchable } from "./search";

const SEARCH = icon("search", 17, 1.75);

type Kind = "DM" | "Friend" | "Channel" | "Server" | "xray";
const ORDER: readonly Kind[] = ["DM", "Friend", "Channel", "Server", "xray"];
const GROUP_NAMES: Record<Kind, string> = { DM: "Direct messages", Friend: "Friends", Channel: "Channels", Server: "Servers", xray: "xray" };
const PER_GROUP = 6;
const RECENT_WHEN_EMPTY = 6;

export interface PaletteResult extends Searchable {
  kind: Kind;
  subtitle: string;
  image: string | null;
  /** Shown when there's no image: an initial, or "#" for a channel. */
  glyph: string;
  round: boolean;
  run(): void;
}

let enabled = false;
let scrim: HTMLElement | undefined;
let input: HTMLInputElement | undefined;
let list: HTMLElement | undefined;
let everything: PaletteResult[] = [];
let shown: PaletteResult[] = [];
let selected = 0;
let commands: () => PaletteResult[] = () => [];

let pill: HTMLButtonElement | undefined;
let stopPillWatch: (() => void) | undefined;

export const palette: Feature = {
  id: "palette",
  name: "Search",
  description: "The search bar on top and Ctrl+K: DMs, friends, channels, servers and xray commands. Replaces Discord's quick switcher.",
  start: () => {
    enabled = true;
    mountPill();
  },
  stop: () => {
    enabled = false;
    close();
    unmountPill();
  },
};

/**
 * The search bar in the middle of the command bar, so the palette is one
 * click away and not only a shortcut. It only shows with xray's
 * theme (the shell makes room for it; see `.cmdbar` in styles.ts) and
 * while you're logged in.
 */
function mountPill(): void {
  if (pill) return;
  pill = h(
    "button",
    { class: "cmdbar", attrs: { type: "button", "aria-label": "Search Discord (Ctrl+K)" }, on: { click: () => (scrim ? close() : open()) } },
    h("span", { class: "pal-icon", trustedHtml: SEARCH }),
    h("span", { class: "cmdbar-text", text: "Search everything" }),
    h("span", { class: "kbd", text: "Ctrl K" }),
  );
  uiRoot().append(pill);
  syncPill();
  whenStore("UserStore", () => {
    if (!pill || stopPillWatch) return;
    stopPillWatch = onStoresChanged([stores.users], syncPill);
    syncPill();
  });
}

function unmountPill(): void {
  stopPillWatch?.();
  stopPillWatch = undefined;
  pill?.remove();
  pill = undefined;
}

function syncPill(): void {
  if (pill) pill.hidden = !loggedIn();
}

/** xray's commands for the palette, supplied by whoever owns them (see index.ts). */
export function setPaletteCommands(provider: () => PaletteResult[]): void {
  commands = provider;
}

export function command(title: string, subtitle: string, run: () => void): PaletteResult {
  return { kind: "xray", title, subtitle, image: null, glyph: "x", round: false, run };
}

onKey((event) => {
  if (!enabled) return false;
  if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && event.code === "KeyK") {
    if (scrim) close();
    else open();
    return true;
  }
  if (!scrim) return false;
  switch (event.key) {
    case "Escape":
      close();
      return true;
    case "ArrowDown":
      select(selected + 1);
      return true;
    case "ArrowUp":
      select(selected - 1);
      return true;
    case "Enter":
      choose(shown[selected]);
      return true;
    default:
      return false;
  }
});

function open(): void {
  everything = gather();
  input = h("input", {
    attrs: { type: "text", placeholder: "Search DMs, friends, channels, servers", "aria-label": "Search Discord", spellcheck: "false" },
    on: { input: () => render() },
  });
  list = h("div", { class: "pal-list", attrs: { role: "listbox" } });
  const dialog = h(
    "div",
    { class: "palette", attrs: { role: "dialog", "aria-label": "Search" } },
    h("div", { class: "pal-input" }, h("span", { class: "pal-icon", trustedHtml: SEARCH }), input, h("span", { class: "kbd", text: "Esc" })),
    list,
    h("div", { class: "pal-foot" }, h("span", { class: "label", text: "↑ ↓ move" }), h("span", { class: "label", text: "Enter open" }), h("span", { class: "label", text: "Esc close" })),
  );
  scrim = h("div", { class: "scrim", on: { mousedown: (event: MouseEvent) => event.target === scrim && close() } }, dialog);
  uiRoot().append(scrim);
  render();
  input.focus();
}

function close(): void {
  scrim?.remove();
  scrim = input = list = undefined;
  everything = shown = [];
}

function choose(result: PaletteResult | undefined): void {
  if (!result) return;
  close();
  result.run();
}

function select(index: number): void {
  if (!list || !shown.length) return;
  selected = (index + shown.length) % shown.length;
  list.querySelectorAll(".result").forEach((el, i) => el.classList.toggle("sel", i === selected));
  list.querySelectorAll(".result")[selected]?.scrollIntoView({ block: "nearest" });
}

function render(): void {
  if (!list || !input) return;
  const query = input.value.trim();
  const groups = new Map<Kind, PaletteResult[]>();
  if (query) {
    for (const result of rank(query, everything, 60)) {
      const group = groups.get(result.kind) ?? [];
      if (group.length < PER_GROUP) groups.set(result.kind, [...group, result]);
    }
  } else {
    groups.set("DM", everything.filter((r) => r.kind === "DM").slice(0, RECENT_WHEN_EMPTY));
    groups.set("xray", everything.filter((r) => r.kind === "xray"));
  }
  shown = ORDER.flatMap((kind) => groups.get(kind) ?? []);
  selected = 0;
  let index = 0;
  const sections = ORDER.filter((kind) => groups.get(kind)?.length).map((kind) =>
    h(
      "div",
      {},
      h("div", { class: "label group", text: GROUP_NAMES[kind] }),
      ...groups.get(kind)!.map((result) => resultRow(result, index++)),
    ),
  );
  list.replaceChildren(...(sections.length ? sections : [h("div", { class: "empty", text: `Nothing matches “${query}”.` })]));
}

function resultRow(result: PaletteResult, index: number): HTMLElement {
  const glyph = result.image
    ? h("img", { class: result.round ? "glyph round" : "glyph", attrs: { src: result.image, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } })
    : h("span", { class: result.round ? "glyph round" : "glyph", text: result.glyph });
  return h(
    "button",
    {
      class: index === selected ? "result sel" : "result",
      attrs: { type: "button", role: "option" },
      on: { click: () => choose(result), mouseenter: () => select(index) },
    },
    glyph,
    h("span", { class: "result-text" }, h("span", { class: "result-title", text: result.title }), result.subtitle ? h("span", { class: "result-sub", text: result.subtitle }) : null),
    h("span", { class: "kind", text: result.kind }),
  );
}

/** Collects everything searchable from Discord's stores. Runs once per open. */
function gather(): PaletteResult[] {
  const results: PaletteResult[] = [...safely(commands)];
  const dmUsers = new Set<string>();

  const dmIds: string[] = safely(() => stores.privateChannelSort?.getPrivateChannelIds?.() ?? []);
  dmIds.forEach((id, recency) => {
    const channel = stores.channels?.getChannel?.(id);
    if (!channel) return;
    const recipients: string[] = channel.recipients ?? [];
    recipients.forEach((r) => dmUsers.add(r));
    const isGroup = recipients.length !== 1;
    const user = !isGroup ? userView(recipients[0]) : null;
    const title = user?.name ?? (channel.name || recipients.map((r) => userView(r)?.name ?? "").filter(Boolean).join(", ") || "Group");
    results.push({
      kind: "DM",
      title,
      subtitle: isGroup ? `Group · ${recipients.length + 1} people` : "Direct message",
      image: user?.avatar ?? null,
      glyph: title.slice(0, 1).toUpperCase(),
      round: true,
      // Recent conversations rank a little higher.
      boost: Math.max(0, 8 - recency * 0.1),
      run: () => navigate(`/channels/@me/${id}`),
    });
  });

  const friendIds: string[] = safely(() => stores.relationships?.getFriendIDs?.() ?? []);
  for (const id of friendIds) {
    if (dmUsers.has(id)) continue;
    const user = userView(id);
    if (!user) continue;
    results.push({
      kind: "Friend",
      title: user.name,
      subtitle: "Friend",
      image: user.avatar,
      glyph: user.name.slice(0, 1).toUpperCase(),
      round: true,
      run: () => privateChannelActions()?.openPrivateChannel?.(id),
    });
  }

  const guilds: any[] = safely(() => Object.values(stores.guilds?.getGuilds?.() ?? {}));
  for (const guild of guilds) {
    const icon = guild.icon ? safeImage(`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=64`) : null;
    results.push({
      kind: "Server",
      title: guild.name,
      subtitle: "Server",
      image: icon,
      glyph: guild.name.slice(0, 1).toUpperCase(),
      round: false,
      run: () => navigate(`/channels/${guild.id}`),
    });
    const selectable: any[] = safely(() => stores.guildChannels?.getChannels?.(guild.id)?.SELECTABLE ?? []);
    for (const entry of selectable) {
      const channel = entry?.channel;
      if (!channel?.name) continue;
      results.push({
        kind: "Channel",
        title: channel.name,
        keywords: guild.name,
        subtitle: guild.name,
        image: null,
        glyph: "#",
        round: false,
        run: () => navigate(`/channels/${guild.id}/${channel.id}`),
      });
    }
    // Voice channels: picking one joins it, like clicking it in the channel list.
    const vocal: any[] = safely(() => stores.guildChannels?.getChannels?.(guild.id)?.VOCAL ?? []);
    for (const entry of vocal) {
      const channel = entry?.channel;
      if (!channel?.name) continue;
      results.push({
        kind: "Channel",
        title: channel.name,
        keywords: `${guild.name} voice`,
        subtitle: `Voice · ${guild.name}`,
        image: null,
        glyph: "♪",
        round: false,
        run: () => {
          const voice = voiceActions();
          if (voice?.selectVoiceChannel) voice.selectVoiceChannel(channel.id);
          else navigate(`/channels/${guild.id}/${channel.id}`);
        },
      });
    }
  }
  return results;
}

function safely<T>(read: () => T): T {
  try {
    return read();
  } catch {
    return [] as unknown as T;
  }
}
