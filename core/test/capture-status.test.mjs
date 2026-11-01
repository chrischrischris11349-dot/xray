import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
const output=await build({entryPoints:['core/src/voice/captureStatus.ts'],bundle:true,write:false,format:'cjs',platform:'node'});
function fixture(){const scope={module:{exports:{}}};vm.runInNewContext(output.outputFiles[0].text,scope);return scope.module.exports;}
function track(){const value=new EventTarget();Object.assign(value,{readyState:'live',contentHint:'motion',getSettings:()=>({width:1280,height:720,frameRate:30})});return value;}
test('capture status reports the selected live source and clears after cancellation or stop',()=>{const api=fixture(),source=track();api.observeScreenCapture({getVideoTracks:()=>[source]});assert.equal(api.screenCaptureStatus().settings.frameRate,30);source.readyState='ended';source.dispatchEvent(new Event('ended'));assert.equal(api.screenCaptureStatus(),null);});
test('replacement detaches the previous source and an old ended event cannot clear a new capture',()=>{const api=fixture(),first=track(),second=track();let removed=0;const original=first.removeEventListener.bind(first);first.removeEventListener=(...args)=>{removed++;original(...args);};api.observeScreenCapture({getVideoTracks:()=>[first]});api.observeScreenCapture({getVideoTracks:()=>[second]});assert.equal(removed,1);first.dispatchEvent(new Event('ended'));assert.equal(api.screenCaptureStatus().content,'motion');second.dispatchEvent(new Event('ended'));assert.equal(api.screenCaptureStatus(),null);});
