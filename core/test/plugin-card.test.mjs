import {test} from "node:test";
import assert from "node:assert/strict";
import {build} from "esbuild";
import {mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {createRequire} from "node:module";
const out=resolve("node_modules/.cache/xray/plugin-card.test.cjs");mkdirSync(resolve("node_modules/.cache/xray"),{recursive:true});
const mocks={
 "@api/Notices":"export const showNotice=()=>{}",
 "@api/PluginManager":"export const hasAnyVisibleSettings=()=>false,isPluginEnabled=()=>false,pluginRequiresRestart=()=>false,startDependenciesRecursive=()=>({failures:[],restartNeeded:false}),startPlugin=()=>true,stopPlugin=()=>true;",
 "@api/Settings":"export const Settings={plugins:{Example:{enabled:false}}};",
 "@components/Icons":"const icon=name=>props=>({type:'svg',glyph:name,props});export const CogWheel=icon('Settings'),InfoIcon=icon('Info'),EquicordIcon=icon('Equicord'),VencordIcon=icon('Vencord'),UserIcon=icon('User'),PluginIcon=icon('Plugin');",
 "@components/settings/AddonCard":"export const AddonCard=props=>({type:'card',...props});",
 "@utils/css":"export const classNameFactory=prefix=>suffix=>prefix+suffix;",
 "@utils/Logger":"export class Logger{error(){}}",
 "@webpack/common":"export const React={createElement(type,props,...children){return typeof type==='function'?type({...props,children}):{type,props,children}}};export const showToast=()=>{};",
 "~plugins":"export const PluginMeta={Example:{folderName:'src/plugins/example',userPlugin:false}};",
 "./PluginModal":"export const openPluginModal=()=>{}"
};
await build({stdin:{contents:`import {PluginCard} from './equicord/patches/PluginCard.tsx';import {PluginMeta} from '~plugins';export const render=(folderName,userPlugin=false,isModified=false)=>{Object.assign(PluginMeta.Example,{folderName,userPlugin});return PluginCard({plugin:{name:'Example',description:'Fixture',isModified},onRestartNeeded(){}});};`,resolveDir:process.cwd()},outfile:out,bundle:true,platform:"node",format:"cjs",jsx:"transform",jsxFactory:"React.createElement",plugins:[{name:"card-fixture",setup(b){b.onResolve({filter:/^(@|~|\.\/PluginModal$)/},args=>{if(args.path in mocks)return{path:args.path,namespace:"fixture"};});b.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:mocks[args.path],loader:"js"}));}}]});
const {render}=createRequire(import.meta.url)(out);
test("plugin cards use bundled vector origins and keep accessible source labels",()=>{
 for(const [folder,user,modified,glyph,label]of [["src/equicordplugins/example",false,false,"Equicord","Equicord Plugin"],["src/plugins/example",false,false,"Vencord","Vencord Plugin"],["src/userplugins/example",true,false,"User","User Plugin"],["src/plugins/example",false,true,"Plugin","Modified Vencord Plugin"]]){
  const card=render(folder,user,modified);assert.equal(card.sourceBadge.type,"svg");assert.equal(card.sourceBadge.glyph,glyph);assert.equal(card.sourceBadge.props["aria-label"],label);assert.equal(card.sourceBadge.props.width,22);assert.equal(card.sourceBadge.props.src,undefined);assert.equal(card.tooltip,label);
 }
});
test("unknown plugin origins get a bundled fallback without a remote image",()=>{const card=render("unknown");assert.equal(card.sourceBadge.type,"svg");assert.equal(card.sourceBadge.glyph,"Plugin");assert.equal(card.sourceBadge.props["aria-label"],"Plugin");});
