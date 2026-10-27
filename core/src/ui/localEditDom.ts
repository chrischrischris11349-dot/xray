/** Rendering fallback for Discord builds that memoize their message JSX. Native children stay intact. */
export function paintLocalEdit(row:Element,content:string|undefined):void {
  const original=row.querySelector<HTMLElement>('[id^="message-content-"], [class*="systemMessage_"] [class*="content_"]');
  const overlay=row.querySelector<HTMLElement>('[data-xray-edit-overlay]');
  if(content===undefined){overlay?.remove();row.querySelectorAll('[data-xray-edit-original]').forEach(node=>node.removeAttribute('data-xray-edit-original'));return;}
  if(!original?.parentElement)return;
  if(overlay?.previousElementSibling===original&&overlay.textContent===content)return;
  overlay?.remove();
  const replacement=original.ownerDocument.createElement('span');
  replacement.className=original.className;
  replacement.setAttribute('data-xray-edit-overlay','');
  replacement.title='Local edit · visible only to you';
  replacement.style.cssText='display:block;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;color:inherit';
  replacement.textContent=content;
  original.setAttribute('data-xray-edit-original','');
  original.after(replacement);
}
