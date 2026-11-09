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
  const counted='[aria-label="Batches to count"] input[inputmode="numeric"]';
  await f.page.waitForSelector(counted,{visible:true});
  const countUrl=new URL(f.page.url());
  const countId=countUrl.searchParams.get('document');
  assert(countId,'Count sheet URL contains document identity');
  f.check(s,'Count this batch opens the CR-31 count sheet',countUrl.searchParams.get('view'),'COUNT');
  await fill(f.page,counted,4);
  await until(()=>f.db.inventoryWorkflowDocument.findUniqueOrThrow({where:{id:countId}}),d=>d.payload.lines[0].physicalStock===4&&!!d.payload.lines[0].capturedAt);
  const movement=await f.call('POST','/inventory/adjustments',{operationId:f.randomUUID(),itemId:item.id,adjustmentQuantity:1,reason:'Concurrent receipt during count proof'},{'Idempotency-Key':f.randomUUID()});
  assert.equal(movement.status,201);
  await f.page.click('button[aria-label="Sign off count"]');
  await f.page.waitForSelector('[role="dialog"] textarea',{visible:true});
  await f.page.type('[role="dialog"] textarea','One unit missing from the shelf');
  await click(f.page,'Sign off and send for approval');
  const signed=await until(()=>f.db.inventoryWorkflowDocument.findUniqueOrThrow({where:{id:countId}}),d=>d.status==='AWAITING_APPROVAL');
  f.check(s,'signed count waits for approval and leaves stock untouched',{status:signed.status,stock:(await f.db.inventoryItem.findUniqueOrThrow({where:{id:item.id}})).currentStock},{status:'AWAITING_APPROVAL',stock:6});
  f.check(s,'signed count keeps the stock it observed',signed.payload.lines[0].systemStock,5);
  await f.capture(s,'signed-count');
  const doctorPassword='Synthetic-Recovery-Doctor-2026';
  await f.db.user.create({data:{branchId:f.branch.id,email:'count-approver@example.invalid',firstName:'Count',lastName:'Approver',role:'DOCTOR',password:await f.req('bcryptjs').hash(doctorPassword,4),permissions:'[]'}});
  const login=await fetch(f.base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'count-approver@example.invalid',password:doctorPassword})});
  assert.equal(login.status,201);
  const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const approve=await fetch(f.base+`/api/inventory/workspace/reconciliation/counts/${countId}/approve`,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({version:signed.version,requestKey:f.randomUUID(),reason:'Physical count signed by the counter'})});
  assert(approve.ok,`Doctor approval returned ${approve.status}`);
  const approved=await until(()=>f.db.inventoryWorkflowDocument.findUniqueOrThrow({where:{id:countId}}),d=>d.status==='POSTED');
  f.check(s,'doctor approval posts the count',approved.status,'POSTED');
  f.check(s,'approved difference applies to today\'s stock and keeps the concurrent receipt',(await f.db.inventoryItem.findUniqueOrThrow({where:{id:item.id}})).currentStock,5);
  await f.page.goto(f.base+`/dashboard/inventory?area=stock&view=COUNT&document=${countId}`,{waitUntil:'networkidle0'});
  await f.page.waitForFunction(()=>/Approved by Count Approver/.test(document.body.innerText));
  f.check(s,'the counter sees the decision and has no approve control',await f.page.$$eval('button',b=>b.some(x=>x.textContent.trim()==='Approve and adjust stock')),false);
  await f.capture(s,'approved-count');
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
  f.check(s,'intake rejection does not alter counted stock',(await f.db.inventoryItem.findUniqueOrThrow({where:{id:item.id}})).currentStock,5);
  await f.page.click('a[href="/dashboard/inventory?area=stock&view=COUNT"]');
  await click(f.page,'Count an item');
  await f.page.waitForSelector('[role="dialog"] input[placeholder="Item name, batch, or rack"]',{visible:true});
  f.check(s,'rejected intake UI link reaches an on-demand stock count',await f.page.$eval('[role="dialog"] input[placeholder="Item name, batch, or rack"]',e=>e.value),'');
  await f.page.keyboard.press('Escape');
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
  await click(f.page,'Count an item');
  await f.page.waitForSelector('[role="dialog"] input[placeholder="Item name, batch, or rack"]',{visible:true});
  f.check(s,'delegated rejection offers a working UI reconciliation path',await f.page.$eval('[role="dialog"] input[placeholder="Item name, batch, or rack"]',e=>e.value),'');
  f.check(s,'all intake recovery actions preserve existing inventory',(await f.db.inventoryItem.findUniqueOrThrow({where:{id:item.id}})).currentStock,5);
};
