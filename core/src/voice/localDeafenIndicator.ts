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
 ctx.css('.xray-self-deafen{display:inline-flex;align-items:center;justify-content:center;flex:0 0 16px;width:16px;height:16px;margin-inline-start:4px;vertical-align:middle;line-height:0;color:var(--interactive-active,#fafafc)}.xray-self-deafen svg{display:block;width:14px;height:14px;flex:none}.xray-self-deafen-icons{display:flex!important;align-items:center!important;flex-wrap:nowrap!important}.xray-self-deafen-icons>.xray-self-deafen{margin-inline-start:0}.xray-self-deafen-layout{position:relative!important;padding-inline-end:24px!important}.xray-self-deafen-layout>.xray-self-deafen{position:absolute;inset-inline-end:8px;top:50%;transform:translateY(-50%);margin:0}');
 const clearLayout=(row:Element)=>{
  for(const element of [row,...row.querySelectorAll('.xray-self-deafen-icons,.xray-self-deafen-layout')])element.classList.remove('xray-self-deafen-icons','xray-self-deafen-layout');
 };
 const draw=(row:Element)=>{
  // Discord's row: voiceUser > content > [avatar, name, icons]. The mark joins the
  // icon strip (which spaces items with gap) or, with no strip, sits where native
  // icons would: vertically centered, 8px in from the row's edge.
  // The watcher sees both the draggable wrapper and its nested voice row.
  // Anchor once to the actual participant, never to a block below the name.
  row=row.querySelector('[class*="voiceUser_"]')??row.closest('[class*="voiceUser_"]')??row;
  const old=row.querySelector('.xray-self-deafen'),me=myId();
  if(!active()||!me||userId(row)!==me){old?.remove();clearLayout(row);return;}
  const name=row.querySelector('[class*="username_"],[class*="name_"]');
  const icons=row.querySelector('[class*="icons_"],[class*="voiceUserIcons_"]');
  const holder=icons??name?.closest('[class*="content_"]')??name?.parentElement;
  if(!holder)return;
  clearLayout(row);holder.classList.add(icons?'xray-self-deafen-icons':'xray-self-deafen-layout');
  if(old){if(old.parentElement!==holder)holder.append(old);return;}
  const label='Fake Deafen active locally · audio unchanged';const mark=document.createElement('span');mark.className='xray-self-deafen';mark.title=label;mark.setAttribute('role','img');mark.setAttribute('aria-label',label);mark.innerHTML=icon('headphoneOff',14);holder.append(mark);
 };
 ctx.watch(ROWS,draw);
 ctx.watch('#channels [class*="username_"],#channels [class*="icons_"]',element=>{const row=element.closest('[class*="voiceUser_"],[class*="draggable_"]');if(row)draw(row);});
 ctx.onStop(subscribe(()=>document.querySelectorAll(ROWS).forEach(draw)));
 ctx.onStop(()=>{document.querySelectorAll('.xray-self-deafen').forEach(node=>node.remove());document.querySelectorAll(ROWS).forEach(clearLayout);});
}
