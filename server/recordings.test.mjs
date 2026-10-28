import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {recordingStore} from "./recordings.mjs";
test("consented audio uploads are ordered, idempotent, bounded and finalized",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xray-recording-test-"));try{
 const store=recordingStore(dir);assert.throws(()=>store.start({}),/consent/);
 const session=store.start({consent:true});const data=Buffer.from("synthetic audio").toString("base64");
 assert.equal(store.chunk({id:session.id,index:0,data}).next,1);assert.equal(store.chunk({id:session.id,index:0,data}).next,1);
 assert.throws(()=>store.chunk({id:session.id,index:3,data}),/conflict/);assert.throws(()=>store.read({id:session.id}),/incomplete/);
 assert.equal(store.finish({id:session.id,partial:true}).complete,true);assert.equal(store.finish({id:session.id}).partial,true);assert.equal(store.list()[0].partial,true);
 assert.equal(Buffer.from(store.read({id:session.id}).data,"base64").toString(),"synthetic audio");
 assert.throws(()=>store.chunk({id:session.id,index:1,data}),/finalized/);assert.throws(()=>store.read({id:"../../outside"}),/Invalid/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test("recording quotas, abort and retention constrain persistent data",()=>{
 const dir=mkdtempSync(join(tmpdir(),"xray-recording-test-"));try{
 let now=Date.now();const store=recordingStore(dir,{maxBytes:20,totalBytes:50,now:()=>now});const pending=store.start({consent:true});store.abort({id:pending.id});assert.equal(store.list().length,0);
 const session=store.start({consent:true});assert.throws(()=>store.chunk({id:session.id,index:0,data:Buffer.alloc(21).toString("base64")}),/quota/);
 store.chunk({id:session.id,index:0,data:Buffer.alloc(10).toString("base64")});store.finish({id:session.id});assert.throws(()=>store.abort({id:session.id}),/Saved/);
 now+=8*864e5;assert.equal(store.list().length,0);assert.equal(readdirSync(dir).length,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('consented recordings retain participant associations and support exact bounded playback chunks',()=>{
 const directory=mkdtempSync(join(tmpdir(),'xray-recording-'));try{const store=recordingStore(directory),participant='223456789012345678';assert.throws(()=>store.start({consent:false}),/consent/);const row=store.start({consent:true,owner:'123456789012345678',channelId:'323456789012345678',participantIds:[participant,participant,'invalid']});const bytes=Buffer.alloc(128*1024,7);for(let index=0;index<5;index++)store.chunk({id:row.id,index,data:bytes.toString('base64')});assert.throws(()=>store.read({id:row.id,offset:0}),/incomplete/);store.finish({id:row.id});assert.deepEqual(store.list()[0].participantIds,[participant]);const first=store.read({id:row.id,offset:0}),last=store.read({id:row.id,offset:first.next});assert.equal(first.next,512*1024);assert.equal(last.next,640*1024);assert.deepEqual(Buffer.concat([Buffer.from(first.data,'base64'),Buffer.from(last.data,'base64')]),Buffer.concat(Array(5).fill(bytes)));assert.throws(()=>store.read({id:row.id,offset:-1}),/offset/);}finally{rmSync(directory,{recursive:true,force:true});}
});
