// Real-browser uploads against the local built frontend and full built Nest backend.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const p=require('/Users/nshah/.agents/skills/browser-tools/node_modules/puppeteer-core'),{PrismaClient}=require('@prisma/client');
const root=path.resolve(__dirname,'../..'),out=process.env.INVENTORY_READINESS_OUTPUT||root+'/output/diagnostics/inventory-production-readiness',stateFile=process.env.INVENTORY_READINESS_STATE||'/tmp/inventory-four-invoices-session.json';
const tabPrefix=process.env.INVENTORY_READINESS_TAB_PREFIX||'readiness-';
const url='postgresql://invoice_review@127.0.0.1:55443/inventory_workflow_acceptance?schema=public';
const fixtures=JSON.parse(fs.readFileSync(process.env.INVENTORY_READINESS_FIXTURES||'/tmp/clinic-ocr-fixtures.json'));
const db=new PrismaClient({datasourceUrl:url});
const hash=b=>createHash('sha256').update(b).digest('hex');
async function main(){
 fs.mkdirSync(out+'/screenshots',{recursive:true});
 let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):null;
 if(!state){const branch=await db.branch.create({data:{name:'Four supplied invoices readiness '+randomUUID(),address:'ISOLATED LOCAL VALIDATION'}});const password=randomUUID();
 const permissions=['inventory:po:read','inventory:po:create','inventory:po:update','inventory:transaction:create','inventory:item:read','inventory:item:create','inventory:item:update','inventory:supplier:create','inventory:supplier:read','pharmacy:drug:read','pharmacy:drug:create','pharmacy:drug:update'];
 const user=await db.user.create({data:{branchId:branch.id,email:'four-invoices-'+randomUUID()+'@example.invalid',firstName:'Local',lastName:'Reception review',role:'RECEPTION',password:await require('bcryptjs').hash(password,4),permissions:JSON.stringify(permissions),status:'ACTIVE',isActive:true}});
 state={branchId:branch.id,userId:user.id,email:user.email,password,results:[]};fs.writeFileSync(stateFile,JSON.stringify(state,null,2),{mode:0o600});}
 const browser=await p.connect({browserURL:'http://127.0.0.1:19431'});
 try{const loginPage=await browser.newPage();await loginPage.goto('http://127.0.0.1:3106/login',{waitUntil:'domcontentloaded'});
 // Authenticate through the real login endpoint; keep the cookie in this owned test browser.
 const login=await loginPage.evaluate(async c=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:c.email,password:c.password})});const d=await r.json();return {status:r.status,role:d.user?.role};},state);assert.equal(login.status,201);
 state.login=login;
 for(let i=0;i<fixtures.length;i++){
 if(state.results[i]?.response)continue;
 const f=fixtures[i],page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1080});
 await page.bringToFront();
 await page.goto('http://127.0.0.1:3106/dashboard/inventory?area=purchases&view=intake&new='+tabPrefix+i,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('input[type=file]',{timeout:30000});await page.waitForNetworkIdle({idleTime:300,timeout:15000}).catch(()=>{});
 const before=await db.stockTransaction.count({where:{branchId:state.branchId}});
 await (await page.$('input[type=file]')).uploadFile(f.path);
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Import & Add Stock'&&!e.disabled));
 const pending=page.waitForResponse(r=>r.url().endsWith('/pharmacy/purchase-invoices/ocr/import'),{timeout:300000});pending.catch(()=>{});const started=Date.now();
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Import & Add Stock'&&!e.disabled&&e.checkVisibility()).click());console.log('UI upload started: '+f.expected.invoiceNumber);
 const res=await pending,data=await res.json();const entry={file:path.basename(f.path),expected:f.expected,seconds:Math.round((Date.now()-started)/1000),http:res.status(),response:data,errors};
 state.results[i]=entry;fs.writeFileSync(stateFile,JSON.stringify(state,null,2),{mode:0o600});
 assert(res.ok(),JSON.stringify(data));
 const draft=data.draft,mismatches=[];
 for(const field of ['invoiceNumber','netPayable'])if(String(draft?.[field])!==String(f.expected[field]))mismatches.push({field,expected:f.expected[field],actual:draft?.[field]});
 if(draft?.items?.length!==f.expected.items.length)mismatches.push({field:'rows',expected:f.expected.items.length,actual:draft?.items?.length});
 f.expected.items.forEach((line,n)=>Object.entries({freeQuantity:0,...line}).forEach(([field,value])=>{if(String(draft.items[n]?.[field])!==String(value))mismatches.push({field:`items.${n}.${field}`,expected:value,actual:draft.items[n]?.[field]});}));
 entry.mismatches=mismatches;entry.stockMovementsBefore=before;entry.stockMovementsAfter=await db.stockTransaction.count({where:{branchId:state.branchId}});
 const doc=data.sourceDocument;if(doc?.id){const original=await page.evaluate(async id=>{const r=await fetch('/api/pharmacy/purchase-invoices/documents/'+id);return {status:r.status,bytes:[...new Uint8Array(await r.arrayBuffer())]};},doc.id);entry.original={status:original.status,byteIdentical:Buffer.from(original.bytes).equals(fs.readFileSync(f.path)),sha256:hash(Buffer.from(original.bytes))};}
 await page.waitForNetworkIdle({idleTime:300,timeout:10000}).catch(()=>{});entry.url=page.url();await page.screenshot({path:out+'/screenshots/invoice-'+(i+1)+'-uploaded.png'});
 fs.writeFileSync(out+'/invoice-'+(i+1)+'-upload.json',JSON.stringify(entry,null,2));fs.writeFileSync(stateFile,JSON.stringify(state,null,2),{mode:0o600});
 console.log(JSON.stringify({invoice:f.expected.invoiceNumber,http:entry.http,seconds:entry.seconds,status:data.invoice?.status||data.automation?.status,rows:draft.items.length,mismatches,flags:draft.ocrFlags,original:entry.original,stockChange:entry.stockMovementsAfter-before,uiErrors:errors}));
 }
 }finally{await browser.disconnect();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
