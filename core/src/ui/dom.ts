type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: any) => void>>;
  /** Markup from a constant in xray's own source. Never pass anything Discord or a user supplied. */
  trustedHtml?: string;
}

/** Builds an element. Text goes in as text, so nothing from Discord is parsed as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.attrs) for (const [name, value] of Object.entries(props.attrs)) el.setAttribute(name, value);
  if (props.on) for (const [type, listener] of Object.entries(props.on)) el.addEventListener(type, listener as EventListener);
  if (props.trustedHtml !== undefined) el.innerHTML = props.trustedHtml;
  if (props.text !== undefined) el.textContent = props.text;
  for (const child of children) if (child) el.append(child);
  return el;
}
