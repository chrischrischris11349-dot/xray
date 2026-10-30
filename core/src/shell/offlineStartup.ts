import {onAction} from '../api/flux';
import {myId,whenStore,onStoresChanged} from '../discord';
import {storage} from '../env';
import {copyServerArchive,queueLocalMedia} from './offline';
import {serverDataEnabled} from './serverStorage';
let installed=false,scheduled:string|undefined;
/** One bounded, resumable copy from the user's existing VPS archive, never Discord search. */
export function installOfflineBackups(){
 if(installed)return;installed=true;
 const schedule=()=>{const owner=myId();if(!owner||scheduled===owner)return;scheduled=owner;
  setTimeout(()=>{if(myId()!==owner)return;void queueLocalMedia(owner,[]).catch(()=>{});const key=`xray.offline.initial-copy.v1:${owner}`;
   if(!serverDataEnabled(owner)||storage?.getItem(key)==='complete')return;
   void copyServerArchive(owner,true).then(result=>{if(myId()===owner&&result?.complete)storage?.setItem(key,'complete');}).catch(()=>{});
  },2500);
 };
 onAction('CONNECTION_OPEN',()=>{scheduled=undefined;schedule();});onAction('LOGOUT',()=>{scheduled=undefined;});
 whenStore('UserStore',store=>{onStoresChanged([store],schedule);schedule();});
}
