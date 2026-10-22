/**
 * Right-click menus. Every context menu in Discord is one `Menu` component
 * with a `navId` ("message", "user-context", "guild-context", ...), and its
 * entries are placeholder components (item, group, separator, checkbox) that
 * Menu reads by type. Plugins add entries per navId; xray finds Menu by a
 * line of its source (an element hook, see react.ts) and the placeholder
 * types by how Menu's own source tells them apart.
 *
 * What a menu is about (the message, user, channel or server you clicked)
 * isn't in Menu's props, so xray remembers what you last right-clicked or
 * clicked and reads Discord's props for it from React: the nearest
 * `message`, `user`, `channel` and `guild` above that element.
 */
import { warn } from "../env";
import { filters, find } from "../webpack";
import { createElement, onElementByCode } from "./react";

const MENU_SOURCE = "Menu API only allows Items";
const MAX_FIBER_DEPTH = 60;

export interface MenuTarget {
  message?: any;
  channel?: any;
  user?: any;
  guild?: any;
  guildId?: string;
  /** The element you clicked. */
  element?: Element;
}

/** Gets the menu's entries (an array to push to) and what the menu is about. */
export type MenuPatch = (items: any[], target: MenuTarget) => void;

interface Markers {
  item: unknown;
  group: unknown;
  separator: unknown;
  checkbox: unknown;
}

const patches = new Map<string, Set<MenuPatch>>();
let markers: Markers | undefined;
let hooked = false;
let lastClicked: Element | undefined;
let targetFor: Element | undefined;
let target: MenuTarget = {};

function remember(event: Event): void {
  if (event.target instanceof Element) lastClicked = event.target;
}

function install(): void {
  if (hooked) return;
  hooked = true;
  window.addEventListener("contextmenu", remember, true);
  window.addEventListener("click", remember, true);
  onElementByCode([MENU_SOURCE], (props, type) => {
    const list = patches.get(props?.navId);
    if (!list?.size) return;
    if (!markers) markers = findMarkers(type);
    if (!markers) return;
    const items = toArray(props.children);
    const about = currentTarget();
    for (const patch of list) {
      try {
        patch(items, about);
      } catch (err) {
        warn(`a ${props.navId} menu patch failed`, err);
      }
    }
    return { ...props, children: items };
  });
}

function toArray(children: unknown): any[] {
  if (Array.isArray(children)) return [...children];
  return children == null ? [] : [children];
}

/**
 * Menu's source tells its entry types apart with checks like
 * `n.type===L.Dr)return t.push({type:"separator"`. Those give the export
 * names of the placeholder module, and the module is the one exporting them.
 */
function findMarkers(menu: unknown): Markers | undefined {
  const source = String(menu);
  const names: Record<string, string> = {};
  for (const [, key, kind] of source.matchAll(/===\w+\.(\w+)\)(?:return|\{)[^]*?type:"(\w+)"/g)) names[kind] ??= key;
  const keys = { item: names.customitem, group: names.groupstart, separator: names.separator, checkbox: names.checkbox };
  if (Object.values(keys).some((key) => !key)) {
    warn("couldn't read Discord's menu entry types", names);
    return undefined;
  }
  const module = find(filters.byProps(...Object.values(keys)));
  if (!module) return undefined;
  return { item: module[keys.item], group: module[keys.group], separator: module[keys.separator], checkbox: module[keys.checkbox] };
}

function fiberOf(element: Element): any {
  for (const key of Object.keys(element)) if (key.startsWith("__reactFiber$")) return (element as any)[key];
  return undefined;
}

const looksLike = {
  message: (v: any) => typeof v === "object" && v !== null && typeof v.id === "string" && "channel_id" in v && "author" in v,
  user: (v: any) => typeof v === "object" && v !== null && typeof v.id === "string" && typeof v.username === "string",
  channel: (v: any) => typeof v === "object" && v !== null && typeof v.id === "string" && typeof v.type === "number" && !("username" in v),
  guild: (v: any) => typeof v === "object" && v !== null && typeof v.id === "string" && typeof v.name === "string" && "ownerId" in v,
};

/** Reads what the last click was on, once per click. */
function currentTarget(): MenuTarget {
  if (lastClicked === targetFor) return target;
  targetFor = lastClicked;
  target = lastClicked ? aboutElement(lastClicked) : {};
  return target;
}

/**
 * What a piece of Discord's UI is about: the nearest message, user, channel
 * and server in the React props above it. Used for menus, and by plugins
 * that add buttons to Discord's own UI (like the profile popout).
 */
export function aboutElement(start: Element): MenuTarget {
  const about: MenuTarget = { element: start };
  let element: Element | null = start;
  let fiber: any;
  while (element && !(fiber = fiberOf(element))) element = element.parentElement;
  for (let depth = 0; fiber && depth < MAX_FIBER_DEPTH; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps;
    if (!props || typeof props !== "object") continue;
    for (const key of ["message", "user", "channel", "guild"] as const) {
      if (!about[key] && looksLike[key](props[key])) about[key] = props[key];
    }
    if (!about.guildId && typeof props.guildId === "string") about.guildId = props.guildId;
  }
  about.guildId ??= about.guild?.id ?? about.channel?.guild_id ?? undefined;
  return about;
}

/** Adds entries to the menus with these navIds. Returns a function that removes them. */
export function addMenuItems(navIds: string | readonly string[], patch: MenuPatch): () => void {
  install();
  const ids = typeof navIds === "string" ? [navIds] : navIds;
  for (const id of ids) {
    let list = patches.get(id);
    if (!list) patches.set(id, (list = new Set()));
    list.add(patch);
  }
  return () => ids.forEach((id) => patches.get(id)?.delete(patch));
}

export interface MenuItemProps {
  id: string;
  label: string;
  action?: () => void;
  /** "danger" draws it red, like Discord's Delete. */
  color?: "danger";
  disabled?: boolean;
  subtext?: string;
  /** Entries for a submenu. */
  children?: any[];
}

/** Entry builders. Use them inside a MenuPatch, where Discord's entry types are known. */
export const menu = {
  item(props: MenuItemProps): any {
    return markers ? createElement(markers.item, { ...props, id: `xray-${props.id}` }) : null;
  },
  checkbox(props: { id: string; label: string; checked: boolean; action: () => void; subtext?: string }): any {
    return markers ? createElement(markers.checkbox, { ...props, id: `xray-${props.id}` }) : null;
  },
  group(...children: any[]): any {
    return markers ? createElement(markers.group, null, ...children.filter(Boolean)) : null;
  },
  separator(): any {
    return markers ? createElement(markers.separator) : null;
  },
};
