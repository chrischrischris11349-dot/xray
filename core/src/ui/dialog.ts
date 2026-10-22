/**
 * xray's own dialog, for plugins that need to show something (a message's
 * raw data, server info) or ask for text (a silent edit). It lives in xray's
 * shadow root like the panel, so Discord's styles and scripts can't reach it.
 * One dialog at a time; Escape or a click outside closes it.
 */
import { h } from "./dom";
import { onKey, uiRoot } from "./root";

export interface DialogAction {
  label: string;
  primary?: boolean;
  danger?: boolean;
  /** Return false to keep the dialog open. */
  run?: () => void | boolean;
}

export interface DialogOptions {
  title: string;
  /** Plain text, or rows of label/value pairs shown as a definition list. */
  body?: string | readonly (readonly [label: string, value: string])[];
  /** Text shown in a monospace, copyable block. */
  code?: string;
  actions?: readonly DialogAction[];
}

let current: { scrim: HTMLElement; stopKeys: () => void; onClose?: () => void } | undefined;

export function closeDialog(): void {
  if (!current) return;
  const { scrim, stopKeys, onClose } = current;
  current = undefined;
  stopKeys();
  scrim.remove();
  onClose?.();
}

function open(dialog: HTMLElement, onEnter?: () => void, onClose?: () => void): void {
  closeDialog();
  const scrim = h("div", { class: "scrim dialog-scrim", on: { mousedown: (event: MouseEvent) => event.target === scrim && closeDialog() } }, dialog);
  uiRoot().append(scrim);
  const stopKeys = onKey((event) => {
    if (event.key === "Escape") {
      closeDialog();
      return true;
    }
    if (event.key === "Enter" && onEnter && !event.shiftKey) {
      onEnter();
      return true;
    }
    return false;
  });
  current = { scrim, stopKeys, onClose };
}

function buttons(actions: readonly DialogAction[]): HTMLElement {
  return h(
    "div",
    { class: "dialog-actions" },
    ...actions.map((action) =>
      h("button", {
        class: action.primary ? "btn" : action.danger ? "btn danger" : "btn ghost",
        attrs: { type: "button" },
        text: action.label,
        on: { click: () => action.run?.() !== false && closeDialog() },
      }),
    ),
  );
}

export function showDialog(options: DialogOptions): void {
  const parts: (HTMLElement | null)[] = [h("div", { class: "dialog-title", text: options.title })];
  if (typeof options.body === "string") parts.push(h("div", { class: "dialog-text", text: options.body }));
  else if (options.body) {
    parts.push(
      h(
        "dl",
        { class: "dialog-facts" },
        ...options.body.flatMap(([label, value]) => [h("dt", { class: "label", text: label }), h("dd", { text: value })]),
      ),
    );
  }
  if (options.code !== undefined) parts.push(h("pre", { class: "dialog-code mono", text: options.code }));
  const actions = options.actions ?? [{ label: "Close", primary: true }];
  const copyable = options.code;
  parts.push(
    buttons(
      copyable !== undefined
        ? [{ label: "Copy", run: () => (copyText(copyable), false) }, ...actions]
        : actions,
    ),
  );
  open(h("div", { class: "dialog", attrs: { role: "dialog", "aria-label": options.title } }, ...parts.filter(Boolean)));
}

/** Shows a ready-made sheet (like the extended profile) with the dialog's Escape and click-outside behavior. */
export function showSheet(sheet: HTMLElement, onClose?: () => void): void {
  open(sheet, undefined, onClose);
}

/** Puts text on the clipboard. Failures are ignored: there's nothing useful to do about them. */
export function copyText(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {});
}

/** Asks for a line (or block) of text. Resolves to the text, or null if cancelled. */
export function promptText(options: { title: string; value?: string; placeholder?: string; confirm?: string; multiline?: boolean }): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const field = options.multiline
      ? h("textarea", { class: "dialog-input", attrs: { rows: "5", placeholder: options.placeholder ?? "", spellcheck: "true" } })
      : h("input", { class: "dialog-input", attrs: { type: "text", placeholder: options.placeholder ?? "", spellcheck: "true" } });
    field.value = options.value ?? "";
    const submit = () => {
      done(field.value);
      closeDialog();
    };
    const dialog = h(
      "div",
      { class: "dialog", attrs: { role: "dialog", "aria-label": options.title } },
      h("div", { class: "dialog-title", text: options.title }),
      field,
      buttons([
        { label: "Cancel" },
        { label: options.confirm ?? "Save", primary: true, run: () => (submit(), false) },
      ]),
    );
    open(dialog, options.multiline ? undefined : submit, () => done(null));
    field.focus();
    if (field instanceof HTMLInputElement) field.select();
  });
}

/** Asks a yes/no question. Resolves to true only if confirmed. */
export function confirmAction(title: string, text: string, confirm: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const dialog = h(
      "div",
      { class: "dialog", attrs: { role: "dialog", "aria-label": title } },
      h("div", { class: "dialog-title", text: title }),
      h("div", { class: "dialog-text", text }),
      buttons([
        { label: "Cancel" },
        { label: confirm, primary: !danger, danger, run: () => void (answer = true) },
      ]),
    );
    open(dialog, undefined, () => resolve(answer));
  });
}
