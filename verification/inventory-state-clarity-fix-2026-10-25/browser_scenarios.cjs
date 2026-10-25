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
 * @cc [owner:nareshshah139,label:verification] clarity-browser-outcome
 * A lost response MUST be injected only after the real stock command completes; evidence MUST
 * compare persisted stock with visible uncertainty and recovery on the mounted production UI.
 */
exports.stock = async (f,s) => {
 const item=await f.db.inventoryItem.create({data:{branchId:f.branch.id,name:'Clarity proof batch',batchNumber:'CLARITY',currentStock:5,heldStock:0,costPrice:1,sellingPrice:2,mrp:2,type:'MEDICINE',unit:'PIECES',status:'ACTIVE'}});
 const created=await f.call('POST','/inventory/workspace/documents',{kind:'LOSS',requestKey:f.randomUUID(),reference:'Clarity lost response',payload:{reason:'Damaged unit observed during proof',date:'2026-10-25',lines:[{id:f.randomUUID(),inventoryId:item.id,name:item.name,unit:'PIECES',quantity:1}]}});
 assert.equal(created.status,201,JSON.stringify(created.body));
 const id=created.body.id;
 const url=f.base+`/dashboard/inventory?area=stock&view=LOSS&document=${id}`;
 await f.page.goto(url,{waitUntil:'networkidle0'});
 await f.page.evaluate((id)=>{
   const realFetch=window.fetch.bind(window);
   window.__restoreClarityFetch=()=>{window.fetch=realFetch;};
   let lost=false;
   window.fetch=async (...args)=>{
     const url=String(args[0]);
     if(lost && url.includes('/inventory/workspace/documents/'+id) && (!args[1]?.method || args[1].method==='GET')) throw new TypeError('Injected readback unavailable');
     const response=await realFetch(...args);
     if(url.includes('/inventory/workspace/documents/'+id+'/transition') && response.ok){lost=true;throw new TypeError('Injected response lost after commit');}
     return response;
   };
 },id);
 await click(f.page,'Post stock loss');
 await until(()=>f.db.inventoryWorkflowDocument.findUniqueOrThrow({where:{id}}),d=>d.status==='POSTED');
 await f.page.waitForFunction(()=>/could not be confirmed|could not confirm|not confirmed|Check saved status/.test(document.body.innerText));
 const text=await f.page.$eval('body',e=>e.innerText);
 f.check(s,'real stock loss committed before response fault',(await f.db.inventoryItem.findUniqueOrThrow({where:{id:item.id}})).currentStock,4);
 await f.capture(s,'unknown-loss');
 f.check(s,'unknown result never claims no stock change',/Draft • no stock change|Stock has not changed/.test(text),false);
 f.check(s,'unknown result exposes explicit status check',text.includes('Check saved status'),true);
 f.check(s,'unknown result blocks stock command',await f.page.$$eval('button',buttons=>buttons.some(b=>b.textContent.trim()==='Post stock loss'&&!b.disabled)),false);
 await f.page.evaluate(()=>window.__restoreClarityFetch());
 await click(f.page,'Check saved status');
 await f.page.waitForFunction(()=>!/Check saved status/.test(document.body.innerText));
 f.check(s,'status check retains exact posted document',new URL(f.page.url()).searchParams.get('document'),id);
 f.check(s,'status check does not duplicate loss',(await f.db.inventoryItem.findUniqueOrThrow({where:{id:item.id}})).currentStock,4);
 await f.capture(s,'recovered-loss');
 await f.page.setRequestInterception(true);
 const block=req=>req.url().includes('/inventory/workspace/documents/'+id)&&req.method()==='GET'?req.abort('failed'):req.continue();
 f.page.on('request',block);
 await f.page.goto(url,{waitUntil:'networkidle0'});
 await f.page.waitForFunction(()=>/Retry loading/.test(document.body.innerText));
 f.check(s,'failed existing load never looks unsaved',await f.page.$eval('body',e=>e.innerText.includes('Unsaved draft')),false);
 f.check(s,'failed existing load blocks save',await f.page.$$eval('button',buttons=>buttons.some(b=>b.textContent.trim()==='Save draft'&&!b.disabled)),false);
 await f.capture(s,'failed-load');
 f.page.off('request',block);await f.page.setRequestInterception(false);
 await click(f.page,'Retry loading');
 await f.page.waitForFunction(()=>!document.body.innerText.includes('Retry loading'));
 f.check(s,'retry preserves stock',(await f.db.inventoryItem.findUniqueOrThrow({where:{id:item.id}})).currentStock,4);
};
