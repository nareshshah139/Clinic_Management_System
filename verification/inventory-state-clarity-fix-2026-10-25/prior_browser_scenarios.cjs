const assert = require('node:assert/strict');
async function click(page, text) {
 for(let attempt=0;attempt<3;attempt++) {
  await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===t&&!b.disabled),{},text);
  const handle=await page.evaluateHandle(t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t&&!b.disabled),text);
  try {
   const button=handle.asElement();
   if(!button)continue;
   await button.evaluate(e=>e.scrollIntoView({block:'center'}));
   await button.click();return;
  } catch(error) {
   if(attempt===2||!/Node is detached from document/.test(error.message))throw error;
  } finally {await handle.dispose();}
 }
 throw Error('Button did not remain mounted: '+text);
}
async function fill(page, selector, value) {
  const field = await page.waitForSelector(selector, {visible:true});
  await field.click({clickCount:3});
  await page.keyboard.press('Backspace');
  await field.type(String(value));
}
async function fillLabel(page, text, value) {
  await page.waitForFunction(t => [...document.querySelectorAll('label')].some(label => [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim() === t && label.querySelector('input,textarea')), {}, text);
  const handle = await page.evaluateHandle(t => [...document.querySelectorAll('label')].find(label => [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim() === t).querySelector('input,textarea'), text);
  const field = handle.asElement();
  await field.click({clickCount:3});
  await page.keyboard.press('Backspace');
  await field.type(String(value));
  await handle.dispose();
}
async function until(read, predicate) {
  for (let i=0;i<100;i++) {
    const value=await read();
    if (predicate(value)) return value;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('Expected persisted state did not appear');
}
/**
 * @cc [owner:nareshshah139,label:verification] reconciliation-ui-evidence
 * The proof probe MUST click mounted production controls and compare persisted counts with literal
 * expected values. Missing-invoice and colleague recovery MUST remain checked against durable outcomes.
 */
exports.stock = async (f,s) => {
  const savedUser=await f.db.user.findUniqueOrThrow({where:{id:f.user.id}});
  await f.db.user.update({where:{id:f.user.id},data:{permissions:JSON.stringify([...JSON.parse(savedUser.permissions),'pharmacy:compliance:audit'])}});
  const item=await f.db.inventoryItem.create({data:{branchId:f.branch.id,name:'Reconciliation UI proof',batchNumber:'PROOF',currentStock:5,heldStock:0,costPrice:1,sellingPrice:2,mrp:2,type:'MEDICINE',unit:'PIECES',status:'ACTIVE'}});
  await f.page.goto(f.base+`/dashboard/inventory?area=stock&view=list&item=${item.id}`,{waitUntil:'networkidle0'});
  await click(f.page,'Count this batch');
  await f.page.waitForSelector('[aria-label="Physical count 1"]');
  const firstId=new URL(f.page.url()).searchParams.get('document');
  assert(firstId,'Count editor URL contains document identity');
  await fill(f.page,'[aria-label="Physical count 1"]',5);
  const movement=await f.call('POST','/inventory/adjustments',{operationId:f.randomUUID(),itemId:item.id,adjustmentQuantity:1,reason:'Concurrent receipt during count proof'},{'Idempotency-Key':f.randomUUID()});
  assert.equal(movement.status,201);
  await click(f.page,'Submit count');
  await f.page.waitForFunction(()=>document.body.innerText.toLowerCase().includes('stock changed'));
  f.check(s,'stale observation does not overwrite concurrent stock',(await f.db.inventoryItem.findUniqueOrThrow({where:{id:item.id}})).currentStock,6);
  f.check(s,'stale count remains draft',(await f.db.inventoryWorkflowDocument.findUniqueOrThrow({where:{id:firstId}})).status,'DRAFT');
  await f.capture(s,'stale-count');
  await click(f.page,'Start fresh count');
  await f.page.waitForFunction(old=>new URL(location.href).searchParams.get('document')!==old,{},firstId);
  await f.page.waitForSelector('[aria-label="Physical count 1"]');
  f.check(s,'fresh count clears old physical observation',await f.page.$eval('[aria-label="Physical count 1"]',e=>e.value),'');
  const freshId=new URL(f.page.url()).searchParams.get('document');
  const fresh=await f.db.inventoryWorkflowDocument.findUniqueOrThrow({where:{id:freshId}});
  f.check(s,'fresh count snapshots current stock',fresh.payload.lines[0].systemStock,6);
  f.check(s,'fresh count retains source identity',fresh.sourceId,firstId);
  await fill(f.page,'[aria-label="Physical count 1"]',6);
  await click(f.page,'Submit count');
  await until(()=>f.db.inventoryWorkflowDocument.findUniqueOrThrow({where:{id:freshId}}),d=>d.status==='POSTED');
  const posted=await f.db.inventoryItem.findUniqueOrThrow({where:{id:item.id}});
  f.check(s,'posted count has verified quantity and held safety',{q:posted.currentStock,h:posted.heldStock},{q:6,h:0});
  const detail=await f.call('GET',`/inventory/workspace/stock/${item.id}`);
  f.check(s,'independent ledger after count',{status:detail.body.ledger?.status,expected:detail.body.ledger?.expectedStock,difference:detail.body.ledger?.difference,quantity:detail.body.ledger?.checkpoint?.quantity,document:detail.body.ledger?.checkpoint?.documentId},{status:'RECONCILED',expected:6,difference:0,quantity:6,document:freshId});
  await f.capture(s,'posted-count');
  await f.page.goto(f.base+`/dashboard/inventory?area=stock&view=COUNT&document=${firstId}`,{waitUntil:'networkidle0'});
  await click(f.page,'Start fresh count');
  await f.page.waitForFunction(id=>new URL(location.href).searchParams.get('document')===id,{},freshId);
  f.check(s,'recount replay opens existing posted child',new URL(f.page.url()).searchParams.get('document'),freshId);
  await click(f.page,'Start fresh count');
  await f.page.waitForFunction(old=>new URL(location.href).searchParams.get('document')!==old,{},freshId);
  await f.page.waitForSelector('[aria-label="Physical count 1"]');
  f.check(s,'posted count can start another blank count',await f.page.$eval('[aria-label="Physical count 1"]',e=>e.value),'');
  await f.capture(s,'fresh-count');
  const missing=f.randomUUID();
  await f.page.goto(f.base+`/dashboard/inventory?area=purchases&view=intake&invoice=${missing}`,{waitUntil:'networkidle0'});
  await f.page.waitForFunction(()=>document.body.innerText.includes('not found') || document.body.innerText.includes('Not found'));
  const actions=await f.page.$$eval('button',buttons=>buttons.map(b=>b.textContent.trim()));
  f.check(s,'fresh missing-invoice URL exposes unlinked recovery action',actions.includes('Recover legacy or missing invoice'),true);
  await f.capture(s,'missing-invoice');
  f.page.once('dialog', dialog => dialog.accept('Recover missing invoice from its direct UI link'));
  await click(f.page,'Recover legacy or missing invoice');
  await f.page.waitForSelector('[aria-label="Rejected uncertain import"]');
  const rejectedMissing=await f.db.pharmacyPurchaseImportAttempt.findMany({where:{branchId:f.branch.id,status:'RETRY_REJECTED'}});
  const missingOutcome=rejectedMissing.filter(row=>row.result?.historicalInvoiceIds?.includes(missing));
  f.check(s,'UI missing-reference recovery records uncertain historical stock',missingOutcome.map(row=>({status:row.status,stock:row.result.stockOutcome})),[{status:'RETRY_REJECTED',stock:'UNVERIFIED'}]);
  f.check(s,'intake rejection does not alter counted stock',(await f.db.inventoryItem.findUniqueOrThrow({where:{id:item.id}})).currentStock,6);
  await f.page.click('a[href="/dashboard/inventory?area=stock&view=COUNT"]');
  await click(f.page,'Start stock count');
  await f.page.waitForSelector('[aria-label="Physical count 1"]');
  f.check(s,'rejected intake UI link reaches a fresh physical count',await f.page.$eval('[aria-label="Physical count 1"]',e=>e.value),'');
  const priorUser=await f.db.user.create({data:{branchId:f.branch.id,email:'prior-operator@example.invalid',firstName:'Prior',lastName:'Operator',role:'PHARMACIST',password:savedUser.password,permissions:savedUser.permissions}});
  const attempt=await f.db.pharmacyPurchaseImportAttempt.create({data:{id:f.randomUUID(),branchId:f.branch.id,userId:priorUser.id,status:'RUNNING'}});
  const oldEndpoint=await f.call('POST',`/pharmacy/purchase-invoices/ocr/import-attempts/${attempt.id}/resolve`,{});
  f.check(s,'original owner endpoint remains actor scoped',oldEndpoint.status,404);
  await f.page.goto(f.base+`/dashboard/inventory?area=purchases&view=intake&new=${f.randomUUID()}`,{waitUntil:'networkidle0'});
  await click(f.page,'Recover interrupted import');
  await fillLabel(f.page,'Import attempt ID','mistyped-reference');
  await fillLabel(f.page,'Recovery reason','Correct a mistyped recovery reference');
  await click(f.page,'Recover import outcome');
  await f.page.waitForFunction(()=>document.body.innerText.includes('valid') && document.body.innerText.includes('attempt'));
  f.check(s,'invalid recovery reference is editable',await f.page.$$eval('label',labels=>[...labels].find(label=>label.textContent.trim()==='Import attempt ID').querySelector('input').disabled),false);
  await fillLabel(f.page,'Import attempt ID',attempt.id);
  await fillLabel(f.page,'Recovery reason','Authorized colleague recovers interrupted import');
  await click(f.page,'Recover import outcome');
  const recovered=await until(()=>f.db.pharmacyPurchaseImportAttempt.findUniqueOrThrow({where:{id:attempt.id}}),row=>row.status==='NO_STOCK_WRITTEN');
  f.check(s,'colleague UI recovery preserves owner and fences unfinished work',{owner:recovered.userId,status:recovered.status},{owner:priorUser.id,status:'NO_STOCK_WRITTEN'});
  const audit=await f.db.auditLog.findMany({where:{entityId:attempt.id,action:'DELEGATED_RECOVERY'}});
  f.check(s,'colleague UI recovery is audited without stock effects',audit.map(row=>({actor:row.userId,owner:JSON.parse(row.newValues).originalActorId,stockEffect:JSON.parse(row.newValues).stockEffect})),[{actor:f.user.id,owner:priorUser.id,stockEffect:0}]);
  await f.capture(s,'delegated-recovered');
  const orphan=await f.db.pharmacyPurchaseImportAttempt.update({where:{id:'aa000000-0000-4000-8000-000000000001'},data:{branchId:f.branch.id,userId:priorUser.id}});
  await f.page.goto(f.base+`/dashboard/inventory?area=purchases&view=intake&attempt=${orphan.id}`,{waitUntil:'networkidle0'});
  await fillLabel(f.page,'Recovery reason','Recover missing linked invoice for colleague');
  await click(f.page,'Recover import outcome');
  await f.page.waitForSelector('[aria-label="Rejected uncertain import"]');
  const rejected=await f.db.pharmacyPurchaseImportAttempt.findUniqueOrThrow({where:{id:orphan.id}});
  f.check(s,'delegated missing-invoice recovery keeps history unverified',{status:rejected.status,stock:rejected.result.stockOutcome,owner:rejected.userId},{status:'RETRY_REJECTED',stock:'UNVERIFIED',owner:priorUser.id});
  await f.capture(s,'delegated-rejected');
  await f.page.click('a[href="/dashboard/inventory?area=stock&view=COUNT"]');
  await click(f.page,'Start stock count');
  await f.page.waitForSelector('[aria-label="Physical count 1"]');
  f.check(s,'delegated rejection offers a working UI reconciliation path',await f.page.$eval('[aria-label="Physical count 1"]',e=>e.value),'');
  f.check(s,'all intake recovery actions preserve existing inventory',(await f.db.inventoryItem.findUniqueOrThrow({where:{id:item.id}})).currentStock,6);
};
