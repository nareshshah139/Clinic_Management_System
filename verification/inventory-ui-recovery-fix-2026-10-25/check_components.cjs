/**
 * @cc [owner:nareshshah139,label:verification] component-proof-isolation
 * The component proof MUST run against production imports and remove only its own temporary test.
 * It MUST refuse to replace a pre-existing test at the generated path.
 */
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const frontend=path.join(root,'frontend');
const owned=path.join(frontend,'__tests__/inventory/ReconciliationUiProof.generated.test.tsx');
assert(!fs.existsSync(owned),'Refuse to replace existing test');
fs.copyFileSync(path.join(__dirname,'reconciliation-ui.test.tsx'),owned,fs.constants.COPYFILE_EXCL);
try {
  const out=fs.openSync(path.join(__dirname,'component-output.txt'),'w');
  const result=spawnSync(process.execPath,[path.join(root,'node_modules/jest/bin/jest.js'),'--runInBand','--no-coverage','--runTestsByPath',owned,'--json','--outputFile='+path.join(__dirname,'component-results.json')],{cwd:frontend,stdio:['ignore',out,out]});
  fs.closeSync(out);
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
} finally {fs.unlinkSync(owned);}
