/** Added descendants are already covered by their added ancestor's subtree scan. */
export function addedElementRoots(nodes: Iterable<Element>): Element[] {
  const added = new Set(nodes);
  return [...added].filter(node => {
    if (!node.isConnected) return false;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (added.has(parent)) return false;
    return true;
  });
}
