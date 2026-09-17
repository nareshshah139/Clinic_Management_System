// Local deterministic replay of deployed API retry behavior; no HTTP calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require(path.join(root, 'node_modules/ts-node')).register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'node'}});
const baseline = require(path.join(root,'output/diagnostics/prescription-search-2026-09-17/baseline.json'));
const commit = baseline.deployments.find(d=>d.service==='frontend').commit;
assert.match(commit,/^[a-f0-9]{40}$/);
const source = execFileSync('git',['show',`${commit}:frontend/src/lib/api.ts`],{cwd:root,encoding:'utf8'});
const filename=path.join(root,'frontend/src/lib/api.ts');
const mod = new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
mod._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {ApiClient}=mod.exports;
async function run(primaryHealthy){
  const requests=[],delays=[];
  const original={fetch:global.fetch,setTimeout:global.setTimeout,random:Math.random};
  try{
    Math.random=()=>0;
    global.setTimeout=(fn,ms)=>{delays.push(ms);queueMicrotask(fn);return 0;};
    global.fetch=async url=>{requests.push(url);return url.startsWith('/api/prescriptions/')&&!primaryHealthy?new Response(JSON.stringify({message:'Internal server error'}),{status:500,headers:{'Content-Type':'application/json'}}):new Response(JSON.stringify([{id:'synthetic',name:'Synthetic drug'}]),{status:200,headers:{'Content-Type':'application/json'}});};
    const api=new ApiClient();let rows;
    try{rows=await api.get('/prescriptions/drugs/autocomplete',{q:'dolo',limit:30});}
    catch{rows=await api.get('/drugs/autocomplete',{q:'dolo',limit:30,mode:'all'});}
    assert.equal(rows.length,1);
    assert.equal(requests.length,primaryHealthy?1:4);
    assert.deepEqual(delays,primaryHealthy?[]:[500,1000]);
    return {primaryHealthy,requests,delays,minBackoffMs:delays.reduce((a,b)=>a+b,0)};
  }finally{global.fetch=original.fetch;global.setTimeout=original.setTimeout;Math.random=original.random;}
}
(async()=>{
  const report={commit,scope:'Real deployed ApiClient with synthetic HTTP responses; same catch/fallback sequence as PrescriptionBuilder',cases:[await run(false),await run(true)]};
  fs.writeFileSync(path.join(root,'output/diagnostics/prescription-search-2026-09-17/client-replay.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
