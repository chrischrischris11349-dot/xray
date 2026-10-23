/** Retain identical rows so unrelated store updates don't reload media or erase DOM state. */
export class StableRows {
  private rows = new Map<string, { signature: string; node: HTMLElement }>();
  get(key: string, signature: string, create: () => HTMLElement): HTMLElement {
    const old = this.rows.get(key);
    if (old?.signature === signature) return old.node;
    const node = create(); this.rows.set(key, { signature, node }); return node;
  }
  retain(keys: ReadonlySet<string>): void { for (const key of this.rows.keys()) if (!keys.has(key)) this.rows.delete(key); }
  clear(): void { this.rows.clear(); }
}

export function reconcileChildren(parent: HTMLElement, desired: readonly HTMLElement[]): void {
  let cursor = parent.firstChild;
  for (const node of desired) {
    if (node === cursor) cursor = cursor.nextSibling;
    else parent.insertBefore(node, cursor);
  }
  while (cursor) { const next = cursor.nextSibling; parent.removeChild(cursor); cursor = next; }
}
