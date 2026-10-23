// Node microbenchmarks of XRay-owned hot paths; not a Discord startup/FPS benchmark.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { parseHTML } from "linkedom";
await build({ entryPoints: { search: "core/src/ui/search.ts", added: "core/src/api/addedElements.ts" }, outdir: "node_modules/.cache/xray/perf", outExtension: { ".js": ".cjs" }, bundle: true, format: "cjs", platform: "node" });
const require = createRequire(import.meta.url), { rank, score } = require("../../node_modules/.cache/xray/perf/search.cjs"), { addedElementRoots } = require("../../node_modules/.cache/xray/perf/added.cjs");
function originalRank(query, items, limit) {
  const scored = [];
  for (const item of items) { const points = Math.max(score(query, item.title), item.keywords ? score(query, item.keywords) * .6 : 0); if (points > 0) scored.push({ item, points: points + (item.boost ?? 0) }); }
  return scored.sort((a,b) => b.points - a.points).slice(0,limit).map(row => row.item);
}
const items = Array.from({length:5000},(_,i)=>({title:`Café design user ${i}`,keywords:`Project room ${i%100} team channel`,boost:i%8}));
const queries = ["cafe", "design", "user 1", "project", "room 42", "team", "dgn", "missing", "channel"];
function median(fn) { const samples=[]; for(let r=0;r<7;r++){const start=performance.now(); fn();samples.push(performance.now()-start);}return +samples.sort((a,b)=>a-b)[3].toFixed(2); }
queries.forEach(q=>rank(q,items,60));
const searchBefore=median(()=>queries.forEach(q=>originalRank(q,items,60))), searchAfter=median(()=>queries.forEach(q=>rank(q,items,60)));
const {document}=parseHTML(`<html><body><main>${Array.from({length:500},(_,i)=>`<section><span class="item">${i}</span></section>`).join("")}</main></body></html>`);
const root=document.querySelector("main"), nodes=[root,...root.querySelectorAll("*")];
const scan = list => {for(const node of list) for(let watcher=0;watcher<12;watcher++) node.querySelectorAll(".item");};
const observerBefore=median(()=>scan(nodes)), observerAfter=median(()=>scan(addedElementRoots(nodes)));
const result={environment:`Node ${process.version}; synthetic workloads; medians of 7 runs`,search:{items:5000,queries:9,beforeMs:searchBefore,afterMs:searchAfter},observer:{addedNodes:nodes.length,watchers:12,beforeMs:observerBefore,afterMs:observerAfter,beforeSubtreeScans:nodes.length*12,afterSubtreeScans:12}};
writeFileSync("node_modules/.cache/xray/performance-after.json",JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2));
