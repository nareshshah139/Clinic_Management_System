// Bounded, read-only production diagnosis. Never emits credentials or patient content.
// Run: node scripts/diagnostics/prescription-search-performance.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');
const root = path.resolve(__dirname, '../..');
require(path.join(root, 'node_modules/ts-node')).register({ transpileOnly: true, project: path.join(root, 'backend/tsconfig.json') });
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const railway = '/Users/nshah/.nvm/versions/node/v22.12.0/lib/node_modules/@railway/cli/bin/railway';
const cli = args => execFileSync(railway, args, { cwd: root, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
const report = { checkedAt: new Date().toISOString(), scope: 'Deployed service methods invoked locally against production; not browser or authenticated HTTP timings', queries: [], plans: [] };
const out = path.join(root, 'output/diagnostics/prescription-search-2026-09-17');
function loadDeployed(file, commit) {
  assert.match(commit, /^[a-f0-9]{40}$/);
  const source = execFileSync('git', ['show', `${commit}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  report.sourceMatch[file] = fs.readFileSync(path.join(root, file), 'utf8') === source;
  const filename = path.join(root, file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true } }).outputText, filename);
  return mod.exports;
}
async function main() {
  const status = JSON.parse(cli(['status', '--json']));
  report.deployments = status.services.edges.flatMap(({node:s}) => s.serviceInstances.edges.map(({node:i}) => ({ service:s.name, status:i.latestDeployment?.status, commit:i.latestDeployment?.meta?.commitHash })));
  report.sourceMatch = {};
  const commit = report.deployments.find(x => x.service === 'backend').commit;
  const { PrescriptionsService } = loadDeployed('backend/src/modules/prescriptions/prescriptions.service.ts', commit);
  const { DrugService } = loadDeployed('backend/src/modules/pharmacy/drug.service.ts', commit);
  const { PatientsService } = loadDeployed('backend/src/modules/patients/patients.service.ts', commit);
  const pg = JSON.parse(cli(['variables', '--service', 'Postgres', '--environment', 'production', '--json']));
  const url = new URL(pg.DATABASE_PUBLIC_URL);
  url.searchParams.set('options', '-c default_transaction_read_only=on -c statement_timeout=5000');
  url.searchParams.set('connection_limit', '2');
  url.searchParams.set('connect_timeout', '10');
  const events = [];
  const db = new PrismaClient({ datasourceUrl: url.href, log: [{level:'query',emit:'event'}] });
  db.$on('query', e => events.push(e));
  const measure = async (kind, q, fn) => {
    events.length = 0;
    const start = performance.now();
    let result;
    try {
      const value = await fn();
      result = {kind, q, ms: +(performance.now()-start).toFixed(1), rows:Array.isArray(value)?value.length:(value.prescriptions||value.patients||value.data||[]).length, total:value.pagination?.total };
    } catch(e) {
      result = {kind,q,ms:+(performance.now()-start).toFixed(1),error:e.name,detail:(String(e.message).match(/Unknown (?:field|argument) `[^`]+`[^\n]*/)||['Query failed; inspect service schema'])[0]};
    }
    result.databaseQueries = events.length;
    result.queryDurationsMs = events.map(e=>e.duration);
    report.queries.push(result);
    console.log(JSON.stringify(result));
    if (process.argv.includes('--plans')) {
      const captured = [...events];
      for (const e of captured.filter(e => e.query.startsWith('SELECT'))) {
        const plan = await db.$queryRawUnsafe('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+e.query, ...JSON.parse(e.params));
        report.plans.push({kind,q,plan:plan[0]['QUERY PLAN']});
      }
    }
  };
  try {
    report.readOnly = await db.$queryRawUnsafe('SHOW default_transaction_read_only');
    assert.equal(report.readOnly[0].default_transaction_read_only, 'on');
    report.counts = await db.$queryRawUnsafe('SELECT (SELECT count(*)::int FROM drugs) drugs, (SELECT count(*)::int FROM prescriptions) prescriptions, (SELECT count(*)::int FROM patients) patients, (SELECT count(*)::int FROM visits) visits');
    report.indexes = await db.$queryRawUnsafe("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('drugs','prescriptions','patients','visits') ORDER BY tablename,indexname");
    report.activity = await db.$queryRawUnsafe("SELECT state,wait_event_type,count(*)::int connections FROM pg_stat_activity WHERE datname=current_database() GROUP BY state,wait_event_type");
    report.extensions = await db.$queryRawUnsafe('SELECT extname FROM pg_extension');
    const branch = await db.patient.groupBy({by:['branchId'],_count:true,orderBy:{_count:{branchId:'desc'}},take:1});
    const branchId = branch[0].branchId;
    const rx = new PrescriptionsService(db, {}), drugs = new DrugService(db), patients = new PatientsService(db);
    for (let round=0;round<2;round++) {
      await measure('db-roundtrip','select 1',()=>db.$queryRawUnsafe('SELECT 1'));
      for (const q of ['dolo','isotroin','zzzxq-no-match']) {
        await measure('prescription-autocomplete',q,()=>rx.autocompleteDrugs(q,30));
        await measure('pharmacy-fallback',q,()=>drugs.autocomplete({q,limit:30,mode:'all'},branchId));
      }
      for (const q of ['', 'acne','isotroin','zzzxq-no-match']) {
        await measure('saved-prescriptions',q,()=>rx.findAllPrescriptions({search:q,limit:20,page:1},branchId));
      }
      for (const q of ['ra','zzzxq-no-match']) {
        await measure('patient-picker',q,()=>patients.findAll({search:q,page:1,limit:10},branchId));
      }
    }
  } finally { await db.$disconnect(); }
  report.health=[];
  for (const url of ['https://backend-production-2dc6.up.railway.app/health','https://frontend-production-703e.up.railway.app/login']) {
    const start=performance.now();
    try { const r=await fetch(url,{signal:AbortSignal.timeout(10000)});await r.arrayBuffer();report.health.push({url,status:r.status,ms:+(performance.now()-start).toFixed(1)}); }
    catch { report.health.push({url,error:'Request failed'}); }
  }
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,process.argv.includes('--plans')?'plans.json':'baseline.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({counts:report.counts,deployments:report.deployments,sourceMatch:report.sourceMatch,health:report.health,readOnly:report.readOnly}));
}
main().catch(e=>{console.error(e.name+': '+String(e.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]').slice(0,500));process.exitCode=1;});
