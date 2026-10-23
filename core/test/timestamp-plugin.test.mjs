import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import vm from "node:vm";

test("RealtimeTimestamps shares the clock selector and always returns plain strings", async () => {
  const result = await build({ entryPoints:["equicord/plugins/realtimeTimestamps/index.tsx"], bundle:true, write:false, platform:"node", format:"cjs", plugins:[{
    name:"timestamp-runtime-fixture", setup(b) {
      b.onResolve({filter:/^@/},args=>({path:args.path,namespace:"fixture"}));
      b.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:args.path==="@api/Settings" ? `export const definePluginSettings=definitions=>{const values=Object.fromEntries(Object.entries(definitions).map(([k,v])=>[k,v.default]));return {definitions,store:new Proxy(values,{set(o,k,v){if(o[k]!==v){o[k]=v;definitions[k].onChange?.(v);}return true;}})};};` : args.path==="@utils/types" ? "export const OptionType={SELECT:1,BOOLEAN:2};export default x=>x;" : "export const moment=()=>({format:pattern=>pattern});export const useEffect=()=>{};export const useReducer=()=>[0,()=>{}];"}));
    }
  }] });
  let clock="12h";
  const context={module:{exports:{}},window:{__xray:{timeFormat:()=>clock,setTimeFormat:value=>{clock=value;}}},setInterval(){},clearInterval(){}};
  vm.runInNewContext(result.outputFiles[0].text,context);
  const plugin=context.module.exports.default;
  plugin.settings.store.format="HH:mm:ss";clock="12h";plugin.start();
  assert.equal(plugin.settings.store.format,"h:mm:ss A");
  assert.equal(plugin.renderCozy(new Date()),"h:mm:ss A");
  plugin.settings.store.format="HH:mm:ss";
  assert.equal(clock,"24h");assert.equal(plugin.renderCompact(new Date()),"HH:mm:ss");
  plugin.settings.store.showInCompact=false;assert.equal(plugin.renderCompact(new Date()),"HH:mm");
  plugin.settings.store.showInTooltip=false;assert.match(plugin.renderTooltip(new Date()),/HH:mm$/);
  delete context.window.__xray;
  plugin.settings.store.format="h:mm:ss A";assert.equal(plugin.renderCozy(new Date()),"h:mm:ss A");
  plugin.stop();
});
