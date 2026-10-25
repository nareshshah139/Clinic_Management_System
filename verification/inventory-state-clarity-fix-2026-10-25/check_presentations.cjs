/**
 * @cc [owner:nareshshah139,label:verification] presentation-proof-binding
 * Verification MUST execute the production presentation function and reject missing explanations,
 * writable uncertainty, or readonly mutation. The emitted finite table MUST identify its sources.
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const Module=require('node:module');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const ts=require(path.join(root,'node_modules/typescript'));
const sources=['frontend/src/components/inventory/workspace-model.ts','frontend/src/components/inventory/workflow-document-state.ts'];
const loaded=new Map();
function load(file){
 const full=path.join(root,file);
 if(loaded.has(full))return loaded.get(full).exports;
 const compiled=new Module(full,module);loaded.set(full,compiled);
 compiled.filename=full;compiled.paths=Module._nodeModulePaths(path.dirname(full));
 const parentRequire=compiled.require.bind(compiled);
 compiled.require=name=>name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(full),name+'.ts'))):parentRequire(name);
 compiled._compile(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,full);
 return compiled.exports;
}
const {workflowKinds}=load(sources[0]);
const {workflowDocumentPresentation:presentation,supportedWorkflowStatuses:statuses,workflowStatusSupported}=load(sources[1]);
const requiredPairs=[['TARGET_REVIEW','PART_REVIEWED'],['PURCHASE_ORDER','SENT'],['SUPPLIER_RETURN','CHALLAN'],['HOLD','RELEASED'],['SALES_RETURN','RELEASED'],['SHORTBOOK','ORDERED'],['QUOTATION','CONVERTED'],...['PURCHASE_ORDER','SHORTBOOK'].flatMap(kind=>['PART_RECEIVED','RECEIVED'].map(status=>[kind,status]))];
for(const [kind,status] of requiredPairs)assert(workflowStatusSupported(kind,status),`Backend-produced state must be recognized: ${kind}/${status}`);
const rows=[];
for(const kind of Object.keys(workflowKinds))for(const status of statuses)for(const write of [false,true])for(const approve of [false,true])for(const effect of [0,1,-1]){
 const document={id:'saved',kind,status,effects:[{quantityDelta:effect,heldDelta:0}],events:[],payload:{lines:[]}};
 const contexts=[{state:'new'},{state:'known',document},...['loading','load-failed'].map(state=>({state,ref:{kind:'saved',id:'saved'}})),...['create','save','transition'].map(operation=>({state:'unconfirmed',ref:{kind:'saved',id:'saved'},operation,lastKnown:document}))];
 for(const knowledge of contexts){
  const value=presentation(kind,knowledge,{write,approve});
  const unresolved=['loading','load-failed','unconfirmed'].includes(knowledge.state);
  assert(value.heading&&value.happened&&value.stockExplanation&&value.recovery,'All explanations have event, stock outcome and recovery');
  if(unresolved){assert.equal(value.stockEffect,'unknown');assert.equal(value.canMutate,false);assert.equal(value.canEdit,false);assert(value.checkLabel);assert(!/stock has not changed|no stock change|stock is unchanged/i.test([value.heading,value.happened,value.stockExplanation].join(' ')));}
  if(!write){assert.equal(value.canMutate,false);assert.equal(value.canEdit,false);}
  if(knowledge.state==='known'&&kind==='COUNT'&&status==='APPROVED')assert.equal(value.primaryLabel,'Apply approved count');
  rows.push([kind,status,+write,+approve,effect,knowledge.state,knowledge.operation||'',value.stockEffect,+value.canMutate,+value.canEdit,value.checkLabel||'',+!!(value.heading&&value.happened&&value.stockExplanation&&value.recovery)]);
 }
}
for(const kind of Object.keys(workflowKinds)){
 const value=presentation(kind,{state:'known',document:{status:'FUTURE_STATUS'}},{write:true,approve:true});
 assert.equal(value.stockEffect,'unknown');assert.equal(value.canMutate,false);assert(value.checkLabel);
}
const fingerprints=Object.fromEntries(sources.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
fs.writeFileSync(path.join(__dirname,'presentation-sources.json'),JSON.stringify(fingerprints)+'\n');
fs.writeFileSync(path.join(__dirname,'presentation-cases.tsv'),['kind\tstatus\twrite\tapprove\teffect\tknowledge\toperation\tstockEffect\tcanMutate\tcanEdit\tcheckLabel\texplanationComplete',...rows.map(row=>row.join('\t'))].join('\n')+'\n');
process.stdout.write(JSON.stringify({cases:rows.length,kinds:Object.keys(workflowKinds).length,statuses:statuses.length,result:'PASS'})+'\n');
