import assert from "node:assert/strict";import {test} from "node:test";
import {recordingTrackOwner,includeRecordingTrack} from "../src/voice/recordingSelection";
const one="300760994454437890",two="300760994454437891",members=new Set([one,two]);
const receiver=(ssrc=123)=>({getStats:async()=>new Map([["audio",{type:"inbound-rtp",kind:"audio",ssrc}]])}) as any;
test("participant selection uses an explicit receiver identity and excludes unselected audio",async()=>{
 const id=await recordingTrackOwner(receiver(),[{getUserIdBySsrc:(ssrc:number)=>ssrc===123?one:undefined}],members);
 assert.equal(id,one);assert.equal(includeRecordingTrack(id,new Set([one])),true);assert.equal(includeRecordingTrack(id,new Set([two])),false);assert.equal(includeRecordingTrack(undefined,new Set([one])),false);assert.equal(includeRecordingTrack(undefined,null),true);
});
test("unknown, conflicting and failed receiver identities cannot leak into selected-person recordings",async()=>{
 assert.equal(await recordingTrackOwner(receiver(),[{getUserIdBySsrc:()=>"999"}],members),undefined);
 assert.equal(await recordingTrackOwner(receiver(),[{getUserIdBySsrc:()=>one},{getUserIdBySsrc:()=>two}],members),undefined);
 assert.equal(await recordingTrackOwner({getStats:async()=>{throw Error("closed");}} as any,[],members),undefined);
});
