// Paged, explicitly enrolled DM archives. Independent of the rolling observation log.
import {attachmentUrl} from './history-media.mjs';
const ID=/^\d{14,20}$/;
function id(value){if(typeof value!=='string'||!ID.test(value))throw Error('Invalid archive ID');return value;}
function clean(raw){
 id(raw?.id);id(raw?.channel);id(raw?.author);
 const out={id:raw.id,channel:raw.channel,author:raw.author};
 for(const field of ['content','sentAt','editedAt'])if(typeof raw[field]==='string'){
  if(raw[field].length>(field==='content'?4000:80))throw Error('Archive text exceeds its limit');out[field]=raw[field];
 }
 for(const field of ['images','videos','audio','downloads'])if(Array.isArray(raw[field])){if(raw[field].length>20)throw Error('Too many archive attachments');out[field]=raw[field].map(source=>{const url=attachmentUrl(source);if(!url)throw Error('Invalid archive attachment');return url.href;});}
 if(Array.isArray(raw.files)){if(raw.files.length>20||raw.files.some(name=>typeof name!=='string'||name.length>256))throw Error('Invalid archive filenames');out.files=raw.files;}
 return out;
}
export function messageArchive(db,{maxBytes=500*1024*1024,onMedia=()=>{}}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw Error('Invalid DM archive byte quota');
 db.exec(`CREATE TABLE IF NOT EXISTS dm_archive_scopes(owner TEXT NOT NULL,target TEXT NOT NULL,channel TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,before_id TEXT,done INTEGER NOT NULL DEFAULT 0,head TEXT,PRIMARY KEY(owner,target,channel));
 CREATE TABLE IF NOT EXISTS dm_archive_messages(owner TEXT NOT NULL,channel TEXT NOT NULL,id TEXT NOT NULL,author TEXT NOT NULL,value TEXT NOT NULL,bytes INTEGER NOT NULL,PRIMARY KEY(owner,channel,id));
 CREATE INDEX IF NOT EXISTS dm_archive_author ON dm_archive_messages(owner,author,id DESC);
 CREATE INDEX IF NOT EXISTS dm_archive_page ON dm_archive_messages(owner,author,length(id) DESC,id DESC);
 CREATE INDEX IF NOT EXISTS dm_archive_channel ON dm_archive_messages(owner,author,channel);
 CREATE TABLE IF NOT EXISTS dm_archive_usage(owner TEXT PRIMARY KEY,bytes INTEGER NOT NULL);`);
 db.exec('CREATE TABLE IF NOT EXISTS dm_archive_deletions(owner TEXT NOT NULL,channel TEXT NOT NULL,id TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(owner,channel,id));');
 const scope=(owner,target,channel)=>db.prepare('SELECT * FROM dm_archive_scopes WHERE owner=? AND target=? AND channel=?').get(owner,target,channel);
 function status({owner,target}){id(owner);if(target!==undefined)id(target);return {scopes:db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM dm_archive_messages m WHERE m.owner=s.owner AND m.author=s.target AND m.channel=s.channel) count FROM dm_archive_scopes s WHERE owner=? ${target?'AND target=?':''} ORDER BY channel`).all(...(target?[owner,target]:[owner])),bytes:db.prepare('SELECT bytes FROM dm_archive_usage WHERE owner=?').get(owner)?.bytes??0,maxBytes};}
 function configure({owner,target,channels,enabled}){id(owner);id(target);if(typeof enabled!=='boolean'||!Array.isArray(channels)||!channels.length||channels.length>64)throw Error('Choose 1–64 known conversations');channels.forEach(id);
  if(db.prepare('SELECT COUNT(*) n FROM dm_archive_scopes WHERE owner=?').get(owner).n+channels.filter(channel=>!scope(owner,target,channel)).length>256)throw Error('Archive conversation limit reached');
  db.exec('BEGIN');try{for(const channel of new Set(channels))db.prepare('INSERT INTO dm_archive_scopes(owner,target,channel,enabled) VALUES(?,?,?,?) ON CONFLICT(owner,target,channel) DO UPDATE SET enabled=excluded.enabled').run(owner,target,channel,+enabled);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}return status({owner,target});
 }
 function ingest({owner,target,channel,messages,mode}){id(owner);id(target);id(channel);if(!scope(owner,target,channel)?.enabled)throw Error('Live archive is not enabled for this conversation');if(!['history','live'].includes(mode)||!Array.isArray(messages)||messages.length>25)throw Error('Invalid archive batch');
  const rows=messages.map(clean);if(rows.some(row=>row.author!==target||row.channel!==channel))throw Error('Archive batch does not match the selected person/conversation');
  let used=db.prepare('SELECT bytes FROM dm_archive_usage WHERE owner=?').get(owner)?.bytes??0;const media=[];
  db.exec('BEGIN');try{for(const row of rows){
   const old=db.prepare('SELECT value,bytes FROM dm_archive_messages WHERE owner=? AND channel=? AND id=?').get(owner,channel,row.id),previous=old?JSON.parse(old.value):null;
   // Historical pages cannot overwrite a newer live observation or undo a deletion.
   const newer=mode==='live'&&!previous?.deleted&&(!previous?.editedAt||row.editedAt&&Date.parse(row.editedAt)>=Date.parse(previous.editedAt));
   const value=previous?{...previous,...(newer?row:{})}:{...row,firstSavedAt:Date.now(),...(row.content!==undefined?{firstContent:row.content}:{})};
   const deletion=db.prepare('SELECT at FROM dm_archive_deletions WHERE owner=? AND channel=? AND id=?').get(owner,channel,row.id);if(deletion){value.deleted=true;value.deletedAt=deletion.at;}
   // Saved attachments remain evidence even if a later edit removes them. Rotated
   // signatures replace URLs for the same pathname rather than adding duplicates.
   for(const field of ['images','videos','audio','downloads']){
    const links=new Map([...(previous?.[field]??[]),...(row[field]??[])].map(source=>[new URL(source).pathname,source]));
    if(links.size>20)throw Error('Saved attachment history exceeds 20 files of one media type; earlier data was kept.');value[field]=[...links.values()];
   }
   value.files=[...new Set([...(previous?.files??[]),...(row.files??[])])];if(value.files.length>20)throw Error('Saved filename history exceeds its limit; earlier data was kept.');
   const text=JSON.stringify(value),bytes=Buffer.byteLength(text);used+=bytes-(old?.bytes??0);if(used>maxBytes)throw Error('Message archive quota reached; earlier saved messages were kept. Free server storage or raise its quota before resuming.');
   db.prepare('INSERT INTO dm_archive_messages VALUES(?,?,?,?,?,?) ON CONFLICT(owner,channel,id) DO UPDATE SET value=excluded.value,bytes=excluded.bytes').run(owner,channel,row.id,target,text,bytes);media.push(value);
  }db.prepare('INSERT INTO dm_archive_usage VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET bytes=excluded.bytes').run(owner,used);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
  for(const row of media)onMedia(owner,row);return {saved:rows.length};
 }
 function checkpoint({owner,target,channel,before,done,head}){id(owner);id(target);id(channel);if(!scope(owner,target,channel)?.enabled)throw Error('Archive is not enabled');if(before!==undefined&&before!==null)id(before);if(head!==undefined)id(head);if(done!==undefined&&typeof done!=='boolean')throw Error('Invalid completion state');
  // Cursor updates are monotone so two open clients cannot move progress backwards.
  const s=scope(owner,target,channel),next=before&&(!s.before_id||BigInt(before)<BigInt(s.before_id))?before:s.before_id,newHead=head&&(!s.head||BigInt(head)>BigInt(s.head))?head:s.head;
  db.prepare('UPDATE dm_archive_scopes SET before_id=?,done=?,head=? WHERE owner=? AND target=? AND channel=?').run(next,s.done||done?1:0,newHead,owner,target,channel);return status({owner,target});
 }
 function deleted({owner,channel,ids}){id(owner);id(channel);if(!Array.isArray(ids)||ids.length>100)throw Error('Invalid deleted message batch');ids.forEach(id);let changed=0;
  if(!db.prepare('SELECT 1 FROM dm_archive_scopes WHERE owner=? AND channel=? AND enabled=1 LIMIT 1').get(owner,channel))return {changed};
  db.exec('BEGIN');try{for(const message of ids){
   if(!db.prepare('SELECT 1 FROM dm_archive_deletions WHERE owner=? AND channel=? AND id=?').get(owner,channel,message)){
    if(db.prepare('SELECT COUNT(*) n FROM dm_archive_deletions WHERE owner=?').get(owner).n>=10000)throw Error('Deletion-marker quota reached; earlier saved data was kept.');
    db.prepare('INSERT INTO dm_archive_deletions VALUES(?,?,?,?)').run(owner,channel,message,Date.now());
   }
   const row=db.prepare('SELECT value,author,bytes FROM dm_archive_messages WHERE owner=? AND channel=? AND id=?').get(owner,channel,message);if(!row||!scope(owner,row.author,channel)?.enabled)continue;const value=JSON.parse(row.value);if(value.deleted)continue;value.deleted=true;value.deletedAt=Date.now();const text=JSON.stringify(value),bytes=Buffer.byteLength(text);db.prepare('UPDATE dm_archive_messages SET value=?,bytes=? WHERE owner=? AND channel=? AND id=?').run(text,bytes,owner,channel,message);db.prepare('UPDATE dm_archive_usage SET bytes=bytes+? WHERE owner=?').run(bytes-row.bytes,owner);changed++;
  }db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}return {changed};
 }
 function page({owner,target,before,filter="all"}){id(owner);id(target);if(before!==undefined)id(before);if(!['all','text','media'].includes(filter))throw Error('Invalid archive filter');const selected=filter==='text'?"AND length(trim(COALESCE(json_extract(value,'$.content'),'')))>0":filter==='media'?"AND (COALESCE(json_array_length(json_extract(value,'$.images')),0)+COALESCE(json_array_length(json_extract(value,'$.videos')),0)+COALESCE(json_array_length(json_extract(value,'$.audio')),0)+COALESCE(json_array_length(json_extract(value,'$.downloads')),0))>0":'';const rows=db.prepare(`SELECT value,id FROM dm_archive_messages WHERE owner=? AND author=? ${selected} ${before?'AND (length(id)<length(?) OR (length(id)=length(?) AND id<?))':''} ORDER BY length(id) DESC,id DESC LIMIT 11`).all(...(before?[owner,target,before,before,before]:[owner,target]));
  const messages=[];let bytes=0,last;for(const row of rows.slice(0,10)){const size=Buffer.byteLength(row.value);if(messages.length&&bytes+size>1300000)break;messages.push(JSON.parse(row.value));bytes+=size;last=row.id;}return {messages,next:rows.length>messages.length?last:null};}
 return {status,configure,ingest,checkpoint,deleted,page,restoreMedia(){for(const row of db.prepare('SELECT owner,value FROM dm_archive_messages').iterate())onMedia(row.owner,JSON.parse(row.value));}};
}
