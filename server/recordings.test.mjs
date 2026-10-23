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
