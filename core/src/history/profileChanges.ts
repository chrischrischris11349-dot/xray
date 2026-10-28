import type {HistoryEvent} from './model';
import type {IconName} from '../ui/icons';
export const changeKinds:Record<string,{label:string;icon:IconName;important:boolean}>={
 avatar:{label:'Photo changed',icon:'imagePlus',important:true},banner:{label:'Banner changed',icon:'imagePlus',important:true},username:{label:'Username changed',icon:'idCard',important:true},displayName:{label:'Name changed',icon:'idCard',important:true},bio:{label:'Bio changed',icon:'idCard',important:true},customStatus:{label:'Status updated',icon:'messageCircle',important:true},presence:{label:'Presence changed',icon:'info',important:false},memberAdded:{label:'Joined shared server',icon:'users',important:true},memberRemoved:{label:'Left shared server',icon:'users',important:true},messageEdited:{label:'Message edited',icon:'reply',important:false},messageDeleted:{label:'Message deleted',icon:'x',important:false}
};
export function profileArt(kind:string,id:string,hash:unknown):string|null{
 if(!['avatar','banner'].includes(kind)||!/^\d{14,20}$/.test(id)||typeof hash!=='string'||!/^(?:a_)?[a-f\d]{32}$/i.test(hash))return null;
 return `https://cdn.discordapp.com/${kind==='avatar'?'avatars':'banners'}/${id}/${hash}.${hash.startsWith('a_')?'gif':'png'}?size=256`;
}
export function changeSummary(events:HistoryEvent[],reviewedAt=0){
 const changes=events.filter(event=>changeKinds[event.kind]),fresh=changes.filter(event=>event.at>reviewedAt);
 return {fresh,important:fresh.filter(event=>changeKinds[event.kind].important),groups:Object.entries(changeKinds).flatMap(([kind,info])=>{const count=fresh.filter(event=>event.kind===kind).length;return count?[{kind,...info,count}]:[];})};
}
