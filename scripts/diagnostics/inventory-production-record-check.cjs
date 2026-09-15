// Relevant supplier/invoice/catalog read only; no patient data or credentials are emitted.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process'),{PrismaClient}=require('@prisma/client');
const root=path.resolve(__dirname,'../..'),out=root+'/output/diagnostics/inventory-production-readiness';
const railway='/Users/nshah/.nvm/versions/node/v22.12.0/lib/node_modules/@railway/cli/bin/railway';
async function main(){const env=JSON.parse(execFileSync(railway,['variables','--service','Postgres','--json'],{encoding:'utf8'}));const db=new PrismaClient({datasourceUrl:env.DATABASE_PUBLIC_URL});let r;
try{r=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='15s'");return {
 invoices:await tx.$queryRawUnsafe('SELECT id,"branchId","invoiceNumber","distributorName","distributorGstin",status,"netPayable","stockCommittedAt","unresolvedOcrFlags","reconciliationIssues" FROM pharmacy_purchase_invoices ORDER BY "createdAt"'),
 suppliers:await tx.$queryRawUnsafe('SELECT "branchId",name,"gstNumber","isActive" FROM suppliers'),
 products:await tx.$queryRawUnsafe('SELECT name,"packSizeLabel",category,"composition1","dosageForm",strength,"requiresPrescription","isActive","isDiscontinued" FROM drugs WHERE name ILIKE \'%FOLITRAX%\' OR name ILIKE \'%EUCERIN%\' OR name ILIKE \'%PHOTOSTABLE%\' OR name ILIKE \'%TYRODIN%\'')};},{timeout:30000});}finally{await db.$disconnect();}
fs.writeFileSync(out+'/production-records.json',JSON.stringify({checkedAt:new Date().toISOString(),readOnly:true,...r},null,2));console.log(JSON.stringify(r,null,2));}
main().catch(e=>{console.error(String(e.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]'));process.exitCode=1;});
