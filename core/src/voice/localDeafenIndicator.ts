import {myId} from '../discord';
import {aboutElement} from '../api/menus';
import {icon} from '../ui/icons';
const ROWS='#channels [class*="voiceUser_"],#channels [class*="draggable_"]';
type Context={css(value:string):void;watch(selector:string,draw:(element:Element)=>void):void;onStop(stop:()=>void):void};
function userId(row:Element):string|undefined{
 const user=aboutElement(row).user;if(typeof user?.id==='string')return user.id;
 // Some voice rows pass only userId rather than a full user. Match only the
 // bounded nearest React ancestry, never the channel's other participants.
 for(let element:Element|null=row,parents=0;element&&parents<3;element=element.parentElement,parents++){
  const key=Object.keys(element).find(key=>key.startsWith('__reactFiber$'));let fiber=key?(element as any)[key]:undefined;
  for(let depth=0;fiber&&depth<12;depth++,fiber=fiber.return){const props=fiber.memoizedProps;const id=props?.user?.id??props?.userId??props?.voiceState?.userId??props?.voiceState?.user_id;if(typeof id==='string')return id;}
 }return undefined;
}
/** An explicit local decoration; never modifies Discord's real voice stores. */
export function installLocalDeafenIndicator(ctx:Context,active:()=>boolean,subscribe:(draw:()=>void)=>()=>void):void{
 ctx.css('.xray-self-deafen{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;margin-left:5px;vertical-align:middle;color:var(--interactive-active,#fafafc)}.xray-self-deafen svg{width:14px;height:14px}');
 const draw=(row:Element)=>{
  const old=row.querySelector('.xray-self-deafen'),me=myId();
  if(!active()||!me||userId(row)!==me){old?.remove();return;}
  if(old)return;const label='Fake Deafen active locally · audio unchanged';const mark=document.createElement('span');mark.className='xray-self-deafen';mark.title=label;mark.setAttribute('role','img');mark.setAttribute('aria-label',label);mark.innerHTML=icon('headphoneOff',14);
  const name=row.querySelector('[class*="username_"],[class*="name_"]');const holder=row.querySelector('[class*="icons_"]')??name?.parentElement??row;holder.append(mark);
 };
 ctx.watch(ROWS,draw);ctx.onStop(subscribe(()=>document.querySelectorAll(ROWS).forEach(draw)));
 ctx.onStop(()=>document.querySelectorAll('.xray-self-deafen').forEach(node=>node.remove()));
}
