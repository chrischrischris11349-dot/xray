import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
const output=await build({entryPoints:['core/src/voice/captureConstraints.ts'],bundle:true,write:false,format:'cjs',platform:'node'});
const scope={module:{exports:{}}};vm.runInNewContext(output.outputFiles[0].text,scope);
const {boundedCaptureOptions,enforceCaptureBudget}=scope.module.exports;
const plain=value=>JSON.parse(JSON.stringify(value));

test('an over-budget native source is constrained once before sharing, without copying frames or audio',async()=>{
 const actual={width:3840,height:2160,frameRate:144};let calls=0;
 const track={readyState:'live',getSettings:()=>({...actual}),getConstraints:()=>({resizeMode:'crop-and-scale'}),async applyConstraints(value){calls++;for(const key of ['width','height','frameRate'])actual[key]=value[key].max;}};
 const stream={getVideoTracks:()=>[track],getAudioTracks:()=>{throw Error('Audio must not be touched');}};
 const options=boundedCaptureOptions({video:true,audio:true},30,720);
 assert.equal(await enforceCaptureBudget(stream,options),stream);assert.deepEqual(actual,{width:1280,height:720,frameRate:30});assert.equal(calls,1);
 await enforceCaptureBudget(stream,options);assert.equal(calls,1,'an already bounded source is not reconfigured');
});
test('post-picker limits preserve stricter existing constraints and leave caller settings intact',async()=>{
 const original={frameRate:{max:15,ideal:10},resizeMode:'none'};let received;
 const track={readyState:'live',getSettings:()=>({width:3840,height:2160,frameRate:15}),getConstraints:()=>({...original}),async applyConstraints(value){received=value;}};
 const options=boundedCaptureOptions({video:true},60,720);
 await enforceCaptureBudget({getVideoTracks:()=>[track]},options);
 assert.deepEqual(plain(received.frameRate),{max:15,ideal:10});assert.equal(received.resizeMode,'none');assert.deepEqual(original.frameRate,{max:15,ideal:10});assert.equal(options.video.frameRate.max,60);
});
test('normal-budget capture does not reconfigure the source',async()=>{
 const track={readyState:'live',getSettings:()=>({width:1280,height:720,frameRate:30}),applyConstraints:()=>assert.fail('unnecessary reconfiguration')};
 const source={getVideoTracks:()=>[track]};assert.equal(await enforceCaptureBudget(source,boundedCaptureOptions({video:true},30,720)),source);
});
test('an unsupported resize preserves the approved stream and actual capture settings',async()=>{
 const track={readyState:'live',getSettings:()=>({width:3840,height:2160,frameRate:60}),applyConstraints:async()=>{throw Error('unsupported');},stop:()=>assert.fail('must not end an approved share')};
 const source={getVideoTracks:()=>[track]};assert.equal(await enforceCaptureBudget(source,boundedCaptureOptions({video:true},30,720)),source);assert.equal(track.getSettings().width,3840);
});
test('ended, unsupported and explicitly disabled sources stay untouched',async()=>{
 const ended={readyState:'ended',applyConstraints:()=>assert.fail('ended source')};
 await enforceCaptureBudget({getVideoTracks:()=>[ended]},boundedCaptureOptions({video:true},30,720));
 const disabled={getVideoTracks:()=>assert.fail('video disabled')};assert.equal(await enforceCaptureBudget(disabled,{video:false}),disabled);
});
