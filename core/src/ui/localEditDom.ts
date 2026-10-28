/** Rendering fallback for Discord builds that memoize their message JSX. Native children stay intact. */
export function paintLocalEdit(row:Element,content:string|undefined):void {
  const original=row.querySelector<HTMLElement>('[id^="message-content-"], [class*="systemMessage_"] [class*="content_"]');
  const overlay=row.querySelector<HTMLElement>('[data-xray-edit-overlay]');
  if(content===undefined){overlay?.remove();row.querySelectorAll('[data-xray-edit-original]').forEach(node=>node.removeAttribute('data-xray-edit-original'));return;}
  if(!original?.parentElement)return;
  // JSX can already contain the override. Never hide it and wait for a sibling
  // that React may remove during reconciliation.
  if(original.hasAttribute('data-xray-local-edit')&&original.textContent===content){overlay?.remove();original.removeAttribute('data-xray-edit-original');return;}
  if(overlay?.previousElementSibling===original&&overlay.textContent===content)return;
  overlay?.remove();
  const replacement=original.ownerDocument.createElement('span');
  replacement.className=original.className;
  replacement.setAttribute('data-xray-edit-overlay','');
  replacement.title='Local edit · visible only to you';
  replacement.style.cssText='display:block;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;color:inherit';
  if(typeof getComputedStyle==='function'){const style=getComputedStyle(original);replacement.style.fontFamily=style.fontFamily;replacement.style.fontSize=style.fontSize;replacement.style.lineHeight=style.lineHeight;replacement.style.color=style.color;replacement.style.webkitTextFillColor=style.color;}
  replacement.textContent=content;
  original.setAttribute('data-xray-edit-original','');
  original.after(replacement);
}
