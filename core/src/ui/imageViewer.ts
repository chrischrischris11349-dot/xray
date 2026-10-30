import { h } from "./dom";
import { onKey, uiRoot } from "./root";
import { hasNativeSave,saveAsButton,suggestedFilename } from "./saveAs";
const archiveImages=new Map<string,number>();
const archiveDownloads=new Map<string,string>();
/** Called only for an authenticated native archive response, never report text. */
export function registerArchiveImage(url:string,download?:string):void {
  if(download)archiveDownloads.set(url,download);
  for(const [key,expiry]of archiveImages)if(expiry<Date.now())archiveImages.delete(key);
  if(url.startsWith("blob:")){if(archiveImages.size>=500)archiveImages.delete(archiveImages.keys().next().value!);archiveImages.set(url,Number.POSITIVE_INFINITY);return;}
  try{const value=new URL(url),expiry=Number(value.searchParams.get("expires"));if(value.protocol==="https:"&&!value.username&&!value.password&&/^\/media\/file\/[a-f0-9]{64}$/.test(value.pathname)&&expiry>Date.now()&&expiry<=Date.now()+3601_000){if(archiveImages.size>=500)archiveImages.delete(archiveImages.keys().next().value!);archiveImages.set(url,expiry);}}catch{}
}
export function forgetArchiveImage(url:string):void{archiveImages.delete(url);archiveDownloads.delete(url);}

export function viewerUrl(value: unknown): string | null {
  if(typeof value!=="string")return null;
  if((archiveImages.get(value)??0)>Date.now())return value;
  if(value.length<8_000_000 && /^data:image\/(png|jpeg|webp|gif);base64,[a-z\d+/=]+$/i.test(value))return value;
  try {const u=new URL(value);return u.protocol==="https:" && !u.username && !u.password && /^(cdn\.discordapp\.com|media\.discordapp\.net|images-ext-[12]\.discordapp\.net|media\.tenor\.com|c\.tenor\.com|media\d*\.giphy\.com|i\.giphy\.com)$/.test(u.hostname)?u.href:null;}catch{return null;}
}
let dismiss:(()=>void)|undefined;
export function showImage(value: string, name="Image"): void {
  const url=viewerUrl(value);if(!url)return;
  dismiss?.();
  const previous=(uiRoot().activeElement ?? document.activeElement) as HTMLElement|null;
  const dialog=h("dialog",{attrs:{"aria-label":name}});
  dialog.style.cssText="width:min(1100px,92vw);max-height:90vh;padding:16px;border:1px solid var(--line,#444);border-radius:10px;background:var(--raised,#22262a);color:var(--text,#eee)";
  const image=h("img",{attrs:{src:url,alt:name,referrerpolicy:"no-referrer"}});
  image.style.cssText="display:block;max-width:100%;max-height:72vh;object-fit:contain;margin:auto";
  const status=h("p",{attrs:{role:"status"},text:name});
  image.onerror=()=>{image.hidden=true;status.textContent="Image unavailable or expired. The original message remains open.";};
  const close=()=>{stop();dialog.remove();dismiss=undefined;previous?.focus?.({preventScroll:true});};
  const stop=onKey(e=>{if(e.key!=="Escape")return false;close();return true;},true);
  dismiss=close;
  const button=h("button",{class:"btn",attrs:{type:"button"},text:"Close image",on:{click:close}});
  dialog.addEventListener("cancel",e=>{e.preventDefault();close();});
  dialog.addEventListener("click",e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if((e as MouseEvent).clientX<r.left || (e as MouseEvent).clientX>r.right || (e as MouseEvent).clientY<r.top || (e as MouseEvent).clientY>r.bottom)close();}});
  const viewport=h("div",{},image);viewport.style.cssText="max-height:72vh;overflow:auto";
  let actual=false;
  const zoom=h("button",{class:"btn ghost",attrs:{type:"button"},text:"Actual size",on:{click:()=>{actual=!actual;image.style.maxWidth=actual?"none":"100%";image.style.maxHeight=actual?"none":"72vh";zoom.textContent=actual?"Fit image":"Actual size";}}});
  const download=archiveDownloads.get(url)??url;
  dialog.append(status,viewport,h("div",{class:"dialog-actions"},zoom,...(hasNativeSave()&&(download.startsWith("https:")||download.startsWith('blob:'))?[saveAsButton(download,url.startsWith("blob:")?"photo.png":suggestedFilename(url,"photo.png"))]:[]),button));uiRoot().append(dialog);
  try {dialog.showModal();button.focus();}catch{close();}
}
export function imageLink(link: HTMLAnchorElement, url: string, name: string): void {
  link.addEventListener("click",event=>{if(event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey)return;event.preventDefault();showImage(url,name);});
}
