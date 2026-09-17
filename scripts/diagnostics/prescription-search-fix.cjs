// Real Prisma regression and query-plan proof against an existing LOCAL catalog copy.
// LOCAL_DATABASE_URL=... node scripts/diagnostics/prescription-search-fix.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
require(path.join(root,'node_modules/ts-node')).register({transpileOnly:true,project:path.join(root,'backend/tsconfig.json')});
const {PrismaClient}=require('@prisma/client');
const {PrescriptionsService}=require(path.join(root,'backend/src/modules/prescriptions/prescriptions.service'));
const {PrescriptionsController}=require(path.join(root,'backend/src/modules/prescriptions/prescriptions.controller'));
const {JwtAuthGuard}=require(path.join(root,'backend/src/shared/guards/jwt-auth.guard'));
const backendRequire=require('node:module').createRequire(path.join(root,'backend/package.json'));
const {Test}=backendRequire('@nestjs/testing');
const requestHttp=backendRequire('supertest');
const url=new URL(process.env.LOCAL_DATABASE_URL||'');
assert(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Only a local rehearsal database is allowed');
url.searchParams.set('options','-c default_transaction_read_only=on -c statement_timeout=5000');
url.searchParams.set('connection_limit','3');
const events=[];
const db=new PrismaClient({datasourceUrl:url.href,log:[{level:'query',emit:'event'}]});
db.$on('query',e=>events.push(e));
(async()=>{
  const readonly=await db.$queryRawUnsafe('SHOW default_transaction_read_only');
  assert.equal(readonly[0].default_transaction_read_only,'on');
  const branchId=process.env.SEARCH_PROOF_BRANCH||'branch-seed-1';
  const service=new PrescriptionsService(db,{});
  const report={at:new Date().toISOString(),readOnly:true,scope:'Local catalog copy, real Prisma and prescription service',queries:[],plans:[]};
  for(const q of ['dolo','isotroin','tyrodni','zzzxq-no-match']){
    events.length=0;
    const start=performance.now();
    const rows=await service.autocompleteDrugs(q,30,branchId);
    const elapsedMs=+(performance.now()-start).toFixed(1);
    const captured=[...events];
    if(q==='zzzxq-no-match')assert.equal(rows.length,0);else assert(rows.length,`No suggestions for ${q}`);
    const stored=await db.drug.findMany({where:{id:{in:rows.map(r=>r.id)}}});
    assert(stored.every(r=>r.branchId===branchId&&r.isActive&&!r.isDiscontinued));
    for(const row of rows){const source=stored.find(r=>r.id===row.id);assert.equal(row.genericName,[source.composition1,source.composition2].filter(Boolean).join(' + ')||null);assert.equal(row.form,source.dosageForm);assert.equal(row.manufacturer,source.manufacturerName);}
    report.queries.push({q,ms:elapsedMs,rows:rows.length,names:rows.slice(0,3).map(r=>r.name),databaseQueries:captured.length});
    for(const e of captured.filter(e=>e.query.includes('<->>'))){const plan=await db.$queryRawUnsafe('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+e.query,...JSON.parse(e.params));report.plans.push({q,plan:plan[0]['QUERY PLAN']});}
  }
  assert.equal((await service.autocompleteDrugs('dolo',30,'missing-branch-for-search-proof')).length,0);
  assert.equal((await service.autocompleteDrugs('  ',30,branchId)).length,0);
  assert((await service.autocompleteDrugs('dolo',1,branchId)).length<=1);
  await assert.rejects(()=>service.autocompleteDrugs('dolo',30,''));
  const controller=new PrescriptionsController(service);
  const request={user:{branchId,id:'read-only-proof',role:'DOCTOR'}};
  assert((await controller.autocompleteDrugs('dolo',request,1)).length<=1);
  // Exercise Nest parameter binding and JSON serialization with a local-only auth fixture.
  // This does not sign in to production or bypass its authentication.
  const moduleRef=await Test.createTestingModule({controllers:[PrescriptionsController],providers:[{provide:PrescriptionsService,useValue:service}]})
    .overrideGuard(JwtAuthGuard).useValue({canActivate:context=>{context.switchToHttp().getRequest().user=request.user;return true;}}).compile();
  const app=moduleRef.createNestApplication({logger:false});
  try {
    await app.init();
    const start=performance.now();
    const response=await requestHttp(app.getHttpServer()).get('/prescriptions/drugs/autocomplete').query({q:'dolo',limit:1,branchId:'ignored-client-branch'}).expect(200);
    assert.equal(response.body.length,1);
    assert.equal(response.body[0].manufacturer,response.body[0].manufacturerName);
    report.http={status:response.status,rows:response.body.length,ms:+(performance.now()-start).toFixed(1),scope:'Local Nest HTTP with fixture auth and real read-only database'};
  } finally { await app.close(); }
  const out=path.join(root,'output/diagnostics/prescription-search-2026-09-17');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'local-fix-proof.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({queries:report.queries,http:report.http,branchIsolation:true,legacyFields:true,controllerScope:true},null,2));
})().catch(e=>{console.error(e.name+': '+String(e.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]'));process.exitCode=1;}).finally(()=>db.$disconnect());
