import { myId } from "../discord";
import { invoke } from "../shell/bridge";
import { serverDataEnabled } from "../shell/serverStorage";
import { formatDateTime } from "../time";
import { h } from "./dom";
import { icon } from "./icons";
export function collectorStatusControl():HTMLElement{
 const status=h("p",{class:"card-sub",attrs:{role:"status"},text:"Desktop account capture runs while XRay is connected. Files already archived on your server remain available with your PC off. New activity requires an always-on authorized collector."});
 const button=h("button",{class:"btn ghost",text:"Check collector coverage",on:{click:async()=>{const owner=myId();if(!owner||!serverDataEnabled(owner)){status.textContent="Enable server storage to check collection coverage. Desktop account sessions stop when XRay or the PC is off.";return;}
  button.disabled=true;try{const reply:any=await invoke("document_store",{ns:`bot-history.${owner}`,value:null,revision:null});if(myId()!==owner)return;const document=reply?.value?JSON.parse(reply.value):null,collector=document?.collector;
   status.textContent=collector?.state==="connected"?`VPS collector connected. Last observed event: ${collector.lastEventAt?formatDateTime(new Date(collector.lastEventAt)):"none yet"}. Coverage is limited to enabled testers in permitted installed-bot servers.`:`Desktop capture only · VPS collector ${collector?.state??"not configured"}. Personal account sessions cannot collect while your PC is off. Archived files remain on the server.`;
  }catch(error){status.textContent=`Coverage check failed: ${String((error as Error)?.message??error)}`;}finally{button.disabled=false;}
 }}});
 return h("section",{class:"card",attrs:{"aria-label":"Collection coverage"}},h("div",{class:"card-title"},h("span",{trustedHtml:icon("database",17)})," Collection coverage"),status,button);
}
