export interface DmScope {owner:string;target:string;channel:string;enabled:number;before_id?:string;done:number;head?:string;count?:number;}
interface Page {messages:any[];before?:string;oldest?:string;newest?:string;}
export interface BackfillDependencies {
 active():boolean;page(before?:string):Promise<Page>;save(messages:any[]):Promise<void>;
 checkpoint(change:{before?:string;done?:boolean;head?:string}):Promise<void>;progress():void;yield():Promise<void>;
}
/** Serial pages, bounded memory; acknowledgements precede checkpoints. A restart first catches up the gap. */
export async function backfillDm(scope:DmScope,deps:BackfillDependencies):Promise<void>{
 let cursor:string|undefined,backlog=scope.before_id,done=!!scope.done,newHead:string|undefined;
 while(deps.active()){
  const page=await deps.page(cursor);if(!deps.active())return;
  await deps.save(page.messages);if(!deps.active())return;
  newHead??=page.newest;
  if(!scope.head){backlog=page.before;done=!backlog;await deps.checkpoint({before:backlog,done,head:newHead});deps.progress();break;}
  const caughtUp=!page.before||!!page.oldest&&BigInt(page.oldest)<=BigInt(scope.head);
  if(caughtUp){await deps.checkpoint({head:newHead});deps.progress();break;}
  if(!page.before||page.before===cursor)throw Error('History cursor stalled; saved pages were kept.');
  cursor=page.before;deps.progress();await deps.yield();
 }
 if(done||!deps.active())return;
 // An interrupted first page is retried from the beginning; never skip an unacknowledged page.
 cursor=backlog;
 while(deps.active()){
  await deps.yield();if(!deps.active())return;
  const page=await deps.page(cursor);if(!deps.active())return;
  await deps.save(page.messages);if(!deps.active())return;
  await deps.checkpoint({before:page.before,done:!page.before});deps.progress();
  if(!page.before)return;if(page.before===cursor)throw Error('History cursor stalled; saved pages were kept.');cursor=page.before;
 }
}
