import { invoke } from "../shell/bridge";
import { h } from "./dom";
import { showDialog } from "./dialog";
export function hasNativeSave():boolean{return typeof (window as any).__TAURI_INTERNALS__?.invoke==="function";}
export function suggestedFilename(source:string,fallback="attachment"):string{
 try{const part=new URL(source).pathname.split("/").pop();return part?decodeURIComponent(part):fallback;}catch{return fallback;}
}
export function saveAsButton(source:string,name=suggestedFilename(source)):HTMLElement{
 const local=source.startsWith('blob:'),picker=(window as any).showSaveFilePicker;const label=local&&typeof picker!=='function'?'Download copy':'Save As…';
 const button=h("button",{class:"btn ghost",attrs:{type:"button","aria-label":`Save ${name} as`},text:label,on:{click:async()=>{
  button.disabled=true;button.textContent="Saving…";
  try{if(local){if(typeof picker==='function'){const handle=await picker.call(window,{suggestedName:name}),file=await fetch(source),stream=await handle.createWritable();await file.body!.pipeTo(stream);button.textContent='Saved';}else{const link=document.createElement('a');link.href=source;link.download=name;link.click();button.textContent='Download started';}return;}const saved=await invoke("save_file_as",{name,url:source,text:null});button.textContent=saved?"Saved":label;}
  catch(error){if((error as Error)?.name==='AbortError'){button.textContent=label;return;}button.textContent="Retry Save As…";showDialog({title:"Could not save file",body:String((error as Error)?.message??error)});}
  finally{button.disabled=false;}
 }}});
 return button;
}
export async function saveTextAs(name:string,text:string):Promise<boolean>{return await invoke("save_file_as",{name,text,url:null})===true;}
