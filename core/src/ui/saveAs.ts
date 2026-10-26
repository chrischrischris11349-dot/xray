import { invoke } from "../shell/bridge";
import { h } from "./dom";
import { showDialog } from "./dialog";
export function hasNativeSave():boolean{return typeof (window as any).__TAURI_INTERNALS__?.invoke==="function";}
export function suggestedFilename(source:string,fallback="attachment"):string{
 try{const part=new URL(source).pathname.split("/").pop();return part?decodeURIComponent(part):fallback;}catch{return fallback;}
}
export function saveAsButton(source:string,name=suggestedFilename(source)):HTMLElement{
 const button=h("button",{class:"btn ghost",attrs:{type:"button","aria-label":`Save ${name} as`},text:"Save As…",on:{click:async()=>{
  button.disabled=true;button.textContent="Saving…";
  try{const saved=await invoke("save_file_as",{name,url:source,text:null});button.textContent=saved?"Saved":"Save As…";}
  catch(error){button.textContent="Retry Save As…";showDialog({title:"Could not save file",body:String((error as Error)?.message??error)});}
  finally{button.disabled=false;}
 }}});
 return button;
}
export async function saveTextAs(name:string,text:string):Promise<boolean>{return await invoke("save_file_as",{name,text,url:null})===true;}
