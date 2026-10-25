const assert = require('node:assert/strict');
async function click(page, text) {
  await page.waitForFunction(t => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === t && !b.disabled), {}, text);
  const handle = await page.evaluateHandle(t => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t && !b.disabled), text);
  const button = handle.asElement();
  await button.evaluate(e => e.scrollIntoView({block:'center'}));
  await button.click();
  await handle.dispose();
}
async function fill(page, selector, value) {
  const field = await page.waitForSelector(selector, {visible:true});
  await field.click({clickCount:3});
  await page.keyboard.press('Backspace');
  await field.type(String(value));
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
  s.assertions.push({label:'missing-invoice visible actions',actual:actions.filter(t=>/saved|compare|recover|stock|count/i.test(t))});
  await f.capture(s,'missing-invoice');
  const manualRecovery=await f.call('POST','/pharmacy/purchase-invoices/ocr/recover-unlinked',{recoveryId:f.randomUUID(),legacy:true,invoiceId:missing,reason:'Proof of backend recovery omitted by direct URL UI'});
  f.check(s,'missing-reference backend recovery exists',{status:manualRecovery.status,outcome:manualRecovery.body.outcome,stock:manualRecovery.body.stockOutcome},{status:201,outcome:'RETRY_REJECTED',stock:'UNVERIFIED'});
  f.check(s,'intake rejection does not alter counted stock',(await f.db.inventoryItem.findUniqueOrThrow({where:{id:item.id}})).currentStock,6);
  const priorUser=await f.db.user.create({data:{branchId:f.branch.id,email:'prior-operator@example.invalid',firstName:'Prior',lastName:'Operator',role:'PHARMACIST',password:savedUser.password,permissions:savedUser.permissions}});
  const attempt=await f.db.pharmacyPurchaseImportAttempt.create({data:{id:f.randomUUID(),branchId:f.branch.id,userId:priorUser.id,status:'RUNNING'}});
  const handoff=await f.call('POST','/pharmacy/purchase-invoices/ocr/recover-unlinked',{recoveryId:attempt.id,legacy:false,reason:'Authorized colleague tries advertised handoff'});
  f.check(s,'counterexample: colleague cannot resolve original actor attempt',handoff.status,404);
  const resolve=await f.call('POST',`/pharmacy/purchase-invoices/ocr/import-attempts/${attempt.id}/resolve`,{});
  f.check(s,'colleague cannot resolve running original attempt',resolve.status,404);
  const retained=await f.db.pharmacyPurchaseImportAttempt.findUniqueOrThrow({where:{id:attempt.id}});
  f.check(s,'failed handoff leaves original attempt unresolved',{owner:retained.userId,status:retained.status},{owner:priorUser.id,status:'RUNNING'});
  await click(f.page,'Stock');
  await click(f.page,'Counts & audit');
  await click(f.page,'Start stock count');
  await f.page.waitForSelector('[aria-label="Physical count 1"]');
  f.check(s,'missing-invoice global UI escape reaches a fresh physical count',await f.page.$eval('[aria-label="Physical count 1"]',e=>e.value),'');
};
