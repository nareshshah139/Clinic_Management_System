// Read-only production audit. Database credentials stay in process memory.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=root+'/output/diagnostics/inventory-production-readiness';
const railway='/Users/nshah/.nvm/versions/node/v22.12.0/lib/node_modules/@railway/cli/bin/railway';
const cli=(args)=>execFileSync(railway,args,{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024});
const {PrismaClient}=require('@prisma/client');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const status=JSON.parse(cli(['status','--json']));
 const report={checkedAt:new Date().toISOString(),productionReadOnly:true,services:[]};
 for(const edge of status.services.edges){const s=edge.node,instance=s.serviceInstances.edges[0].node,d=instance.latestDeployment;
 report.services.push({name:s.name,deploymentId:d.id,status:d.status,commit:d.meta.commitHash,build:d.meta.serviceManifest.build,deploy:d.meta.serviceManifest.deploy,volumes:d.meta.volumeMounts,domains:instance.domains.serviceDomains.map(x=>x.domain)});}
 const env=JSON.parse(cli(['variables','--service','backend','--json']));
 const fe=JSON.parse(cli(['variables','--service','frontend','--json']));
 report.configuration={seedOnStartup:env.RUN_SEED_ON_STARTUP==='true',minimalBoot:env.MINIMAL_BOOT==='true',jwtConfigured:!!env.JWT_SECRET,codexHome:env.CODEX_HOME,codexAuthConfigured:!!env.CODEX_AUTH_JSON_B64,ocrModel:env.PHARMACY_PURCHASE_OCR_MODEL,frontendApiProxy:fe.NEXT_PUBLIC_API_PROXY,gmailConfigured:['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REDIRECT_URI','INVENTORY_TOKEN_KEY'].every(k=>!!env[k])};
 const pg=JSON.parse(cli(['variables','--service','Postgres','--json']));
 const db=new PrismaClient({datasourceUrl:pg.DATABASE_PUBLIC_URL});
 try{await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '15s'");
 report.readOnly=await tx.$queryRawUnsafe('SHOW transaction_read_only');
 report.databaseSize=await tx.$queryRawUnsafe('SELECT pg_database_size(current_database())::text AS bytes');
 const applied=await tx.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at');
 const local=fs.readdirSync(root+'/backend/prisma/migrations').filter(n=>fs.existsSync(root+'/backend/prisma/migrations/'+n+'/migration.sql'));
 report.migrations={applied,pending:local.filter(n=>!applied.some(a=>a.migration_name===n&&a.finished_at&&!a.rolled_back_at)),failed:applied.filter(a=>!a.finished_at&&!a.rolled_back_at),checksumMismatches:applied.filter(a=>local.includes(a.migration_name)&&a.checksum!==hash(fs.readFileSync(root+'/backend/prisma/migrations/'+a.migration_name+'/migration.sql'))).map(a=>a.migration_name)};
 report.columns=await tx.$queryRawUnsafe("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");
 report.invoiceStatuses=await tx.$queryRawUnsafe('SELECT status, count(*)::int AS count FROM pharmacy_purchase_invoices GROUP BY status');
 report.sourceFiles=await tx.$queryRawUnsafe('SELECT count(*)::int AS count, sum("sizeBytes")::text AS bytes, count(*) FILTER (WHERE octet_length(data)<>"sizeBytes")::int AS length_mismatch FROM pharmacy_purchase_invoice_documents');
 report.inventory=await tx.$queryRawUnsafe('SELECT count(*)::int AS batches,sum("currentStock")::text AS total_declared_units,count(*) FILTER (WHERE "currentStock"<0)::int AS negative_batches FROM inventory_items');
 report.connections=await tx.$queryRawUnsafe("SELECT state,count(*)::int FROM pg_stat_activity WHERE datname=current_database() GROUP BY state");
 },{timeout:60000});}finally{await db.$disconnect();}
 // A schema-only copy supports a local migration rehearsal without copying patients.
 const u=new URL(pg.DATABASE_PUBLIC_URL),dump='/tmp/inventory-production-schema.sql';
 execFileSync('/opt/homebrew/opt/postgresql@17/bin/pg_dump',['--schema-only','--no-owner','--no-privileges','--file',dump],{env:{...process.env,PGHOST:u.hostname,PGPORT:u.port,PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:u.pathname.slice(1),PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=60000'},stdio:['ignore','pipe','pipe']});
 fs.chmodSync(dump,0o600);report.schemaCopy={path:dump,sha256:hash(fs.readFileSync(dump)),dataCopied:false};
 for(const service of report.services.filter(s=>s.domains.length)){const url='https://'+service.domains[0]+(service.name==='backend'?'/health':'/login');const r=await fetch(url,{signal:AbortSignal.timeout(30000)});service.http={url,status:r.status};}
 fs.writeFileSync(out+'/production-audit.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({services:report.services.map(({name,status,commit,http,build,deploy})=>({name,status,commit,http,builder:build.builder,healthcheck:deploy.healthcheckPath})),configuration:report.configuration,migrations:report.migrations,inventory:report.inventory,sourceFiles:report.sourceFiles,schemaCopy:report.schemaCopy},null,2));
}
main().catch(e=>{console.error(String(e.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]'));process.exitCode=1;});
