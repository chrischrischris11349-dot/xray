/** Browser clipboard first; selection-based fallback works in WebView2's shadow UI. */
export async function writeClipboard(text: string, restore?:HTMLElement|null): Promise<boolean> {
  try {await navigator.clipboard.writeText(text);return true;}catch { /* Native clipboard permission can be unavailable. */ }
  const focused=restore??document.activeElement as HTMLElement|null;
  const field=document.createElement("textarea");field.value=text;field.setAttribute("aria-label","Copy result");
  field.style.cssText="position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
  document.body.append(field);field.focus();field.select();
  try {return document.execCommand("copy");}catch{return false;}finally{field.remove();focused?.focus?.({preventScroll:true});}
}
export function pasteText(field: HTMLInputElement|HTMLTextAreaElement, text: string): void {
  if(field.readOnly || field.disabled)return;
  const from=field.selectionStart??field.value.length,to=field.selectionEnd??from;
  const limit=field.maxLength>=0?Math.max(0,field.maxLength-(field.value.length-(to-from))):text.length;
  field.setRangeText(text.slice(0,limit),from,to,"end");
  field.dispatchEvent(new Event("input",{bubbles:true,composed:true}));
}
export function installClipboard(root: ShadowRoot): void {
  root.addEventListener("paste",event=>{
    if(event.defaultPrevented || !(event as ClipboardEvent).clipboardData?.types.includes("text/plain"))return;
    const field=event.composedPath()[0];
    if(!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || !["text","search","url","email","tel","password","textarea"].includes(field.type))return;
    const text=(event as ClipboardEvent).clipboardData?.getData("text/plain");
    if(text===undefined)return;event.preventDefault();event.stopPropagation();pasteText(field,text);
  });
  // Keep native selection copy/cut local to this UI without cancelling its default action.
  for(const type of ["copy","cut"])root.addEventListener(type,event=>event.stopPropagation());
}
