// Restore only the live schema and migration metadata into a new local database.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=root+'/output/diagnostics/inventory-production-readiness';
const audit=JSON.parse(fs.readFileSync(out+'/production-audit.json'));
const name='inventory_production_rehearsal_'+randomUUID().replaceAll('-','').slice(0,12);
assert.match(name,/^inventory_production_rehearsal_[a-f0-9]{12}$/);
const args=['-X','-q','-h','127.0.0.1','-p','55443','-U','invoice_review','-v','ON_ERROR_STOP=1'];
const psql=(db,extra)=>execFileSync('/opt/homebrew/opt/postgresql@17/bin/psql',[...args,'-d',db,...extra],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:10*1024*1024});
const quote=v=>v===null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
function main(){
 psql('postgres',['-c',`CREATE DATABASE "${name}"`]);
 psql(name,['-f',audit.schemaCopy.path]);
 for(const m of audit.migrations.applied){psql(name,['-c',`INSERT INTO _prisma_migrations (id,checksum,migration_name,started_at,finished_at,rolled_back_at,applied_steps_count) VALUES (${quote(randomUUID())},${quote(m.checksum)},${quote(m.migration_name)},${quote(m.finished_at)},${quote(m.finished_at)},${quote(m.rolled_back_at)},1)`]);}
 const url=`postgresql://invoice_review@127.0.0.1:55443/${name}?schema=public`;
 const release=JSON.parse(fs.readFileSync(out+'/release-candidate.json')).directory;
 const env={...process.env,DATABASE_URL:url};const report={checkedAt:new Date().toISOString(),database:name,source:'Live production schema only; historical patient/invoice rows not copied',pending:audit.migrations.pending,release};
 const start=Date.now();report.deployOutput=execFileSync(root+'/node_modules/.bin/prisma',['migrate','deploy','--schema',release+'/backend/prisma/schema.prisma'],{cwd:release,env,encoding:'utf8',stdio:['ignore','pipe','pipe']});report.migrationMilliseconds=Date.now()-start;
 report.secondDeploy=execFileSync(root+'/node_modules/.bin/prisma',['migrate','deploy','--schema',release+'/backend/prisma/schema.prisma'],{cwd:release,env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.match(report.secondDeploy,/No pending migrations/);
 const diff=execFileSync(root+'/node_modules/.bin/prisma',['migrate','diff','--from-url',url,'--to-schema-datamodel',root+'/backend/prisma/schema.prisma','--script'],{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:10*1024*1024});
 fs.writeFileSync(out+'/production-schema-drift.sql',diff);report.emptySchemaDiff=/empty migration/i.test(diff);report.diffFile='production-schema-drift.sql';
 fs.writeFileSync(out+'/migration-rehearsal.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}try{main()}catch(e){console.error(e.message);if(e.stderr)console.error(e.stderr.toString());process.exitCode=1;}
