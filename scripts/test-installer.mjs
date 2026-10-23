// Isolated NSIS test: writes only into the repository's ignored cache; never installs XRay.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const cache = resolve("node_modules/.cache/xray/installer-test"); mkdirSync(cache, { recursive:true });
const compiler = join(process.env.LOCALAPPDATA, "tauri/NSIS/makensis.exe");
const catalog = JSON.parse(readFileSync("src-tauri/windows/plugin-catalog.json", "utf8")).plugins;
for (const [type, label] of [[0,"recommended"], [1,"minimal"], [2,"all"], [3,"keep"]]) {
  const directory = join(cache, label); mkdirSync(directory, { recursive:true });
  const ini = join(directory,"installer-plugins.ini");
  if(type === 3) writeFileSync(ini,"existing choices");
  const source = `Unicode true
!include MUI2.nsh
!include LogicLib.nsh
Name "XRay installer selection test"
OutFile "${join(cache, `${label}.exe`)}"
RequestExecutionLevel user
SilentInstall silent
Var XRaySeedDirectory
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_LANGUAGE "English"
Function .onInit
  SetCurInstType ${type}
  StrCpy $XRaySeedDirectory "${directory}"
FunctionEnd
Section "Test only" XRAY_TEST
  SectionIn 1 2 3 4 RO
  Call XRayWriteSelection
SectionEnd
!include "${resolve("src-tauri/windows/generated/plugins.nsh")}"
`;
  const input = join(cache, `${label}.nsi`); writeFileSync(input,"\uFEFF"+source);
  execFileSync(compiler,["/V2",input],{stdio:"pipe"});
  execFileSync(join(cache,`${label}.exe`),["/S"],{stdio:"pipe",timeout:20000});
  const text = readFileSync(ini,"utf8");
  if(type === 3) assert.equal(text,"existing choices");
  else {
    const entries = Object.fromEntries(text.split(/\r?\n/).filter(line=>line.includes("=")).map(line=>line.split("=")));
    assert.equal(Object.keys(entries).length,catalog.length);
    for(const plugin of catalog) assert.equal(entries[plugin.key], type===2 || (type===0?plugin.recommended:plugin.minimal) ? "1" : "0",plugin.key);
  }
  console.log(`NSIS ${label}: passed (${catalog.length} choices)`);
}
