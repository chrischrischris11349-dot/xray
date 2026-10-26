import {test} from "node:test";import assert from "node:assert/strict";import {build} from "esbuild";import vm from "node:vm";
test("hide-server updates publish fresh snapshots so React subscribers and restored storage update",async()=>{
 const saved=new Map([["HideServers_servers",new Set(["one"])]]);let changes=0;
 const stubs={"@api/DataStore":"export const get=async key=>globalThis.saved.get(key);export const set=(key,value)=>globalThis.saved.set(key,value);export const del=key=>globalThis.saved.delete(key);","@webpack":"export const proxyLazyWebpack=factory=>factory();","@webpack/common":"export const Flux={Store:class{emitChange(){globalThis.changed()}}},FluxDispatcher={},GuildStore={getGuild:id=>({id})},SortedGuildStore={getFlattenedGuildIds:()=>[]};"};
 const result=await build({entryPoints:["equicord/patches/HiddenServersStore.ts"],bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"hidden-fixture",setup(b){b.onResolve({filter:/.*/},args=>stubs[args.path]?{path:args.path,namespace:"stub"}:null);b.onLoad({filter:/.*/,namespace:"stub"},args=>({contents:stubs[args.path],loader:"js"}));}}]});
 const context={module:{exports:{}},Set,saved,changed:()=>changes++};vm.runInNewContext(result.outputFiles[0].text,context);const store=context.module.exports.HiddenServersStore;
 await store.load();assert.ok(store.hiddenGuilds.has("one"));assert.equal(changes,1);
 const first=store.hiddenGuilds;store.addHiddenGuild("two");assert.notEqual(store.hiddenGuilds,first);assert.equal(first.has("two"),false);assert.ok(store.hiddenGuilds.has("two"));
 const second=store.hiddenGuilds;store.removeHiddenGuild("one");assert.ok(second.has("one"));assert.equal(store.hiddenGuilds.has("one"),false);assert.ok(saved.get("HideServers_servers").has("two"));
 store.unload();await store.load();assert.ok(store.hiddenGuilds.has("two"));store.clearHidden();assert.equal(store.hiddenGuilds.size,0);assert.equal(saved.has("HideServers_servers"),false);
});
