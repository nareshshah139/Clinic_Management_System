// Reviewer actions use actual UI controls. Payment terms and physical stock units below are local test assumptions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const p=require('/Users/nshah/.agents/skills/browser-tools/node_modules/puppeteer-core');
const root=path.resolve(__dirname,'../..'),out=process.env.INVENTORY_READINESS_OUTPUT||root+'/output/diagnostics/inventory-production-readiness';
const tabPrefix=process.env.INVENTORY_READINESS_TAB_PREFIX||'readiness-';
const fixtures=JSON.parse(fs.readFileSync('/tmp/purchase-ocr-originals-manifest.json'));
const index=Number(process.argv[2]||0),mode=process.argv[3]||'correct';
async function main(){const b=await p.connect({browserURL:'http://127.0.0.1:19431'});try{
 const page=(await b.pages()).find(x=>x.url().includes('new='+tabPrefix+index));assert(page,'Uploaded invoice tab absent');await page.bringToFront();await page.setViewport({width:1440,height:1080});page.on('dialog',d=>d.accept());
 const click=async text=>{await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()===t&&!e.disabled&&e.checkVisibility()),{timeout:12000},text);await page.evaluate(t=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===t&&!e.disabled&&e.checkVisibility()).click(),text);};
 const fill=async(sel,v)=>page.$eval(sel,(e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(v));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},v);
 const idle=()=>page.waitForNetworkIdle({idleTime:350,timeout:15000}).catch(()=>{});
 if(mode==='correct'){
 await fill('#distributor-gstin',fixtures[index].expected.distributorGstin);
 await page.click('#bill-type');await page.waitForSelector('[role=option]');await page.evaluate(()=>[...document.querySelectorAll('[role=option]')].find(e=>e.textContent==='Cash').click());
 const ids=await page.$$eval('input[id$="-product"]',es=>es.map(e=>e.id.replace(/-product$/,'')));
 for(let n=0;n<ids.length;n++){await fill(`[id="${ids[n]}-unit"]`,index===1?'Strip':index===3?'Tube':'Pack');await fill(`[id="${ids[n]}-batch"]`,fixtures[index].expected.items[n].batchNumber);}
 // Confirm only the fields explicitly checked for these fixtures. Completeness checks are never cleared.
 const labels=await page.$$eval('button',es=>es.filter(e=>e.checkVisibility()&&!e.disabled&&/^Confirm .* checked$/.test(e.textContent.trim())).map(e=>e.textContent.trim()));
 for(const t of labels){if(/bill type|supplier GSTIN|product|stock unit|batch|pack size|expiry|MRP|paid quantity|free quantity|rate|HSN/i.test(t))await click(t);}
 const supplierCheck=await page.evaluateHandle(()=>[...document.querySelectorAll('label')].find(e=>e.textContent.includes('I checked the supplier name and GSTIN'))?.querySelector('input'));
 if(supplierCheck.asElement()){await supplierCheck.asElement().click();await click('Save verified supplier');await idle();}
 await click('Refresh Matches');await idle();
 }
 if(mode==='products'){
 const kinds=await page.$$eval('select[id$="-new-kind"]',es=>es.map(e=>e.id));
 for(const id of kinds){await page.select('#'+id,index===1?'MEDICINE':'COSMETIC');
 if(index===1){const prefix=id.replace(/kind$/,''),n=Number(id.match(/product-(\d+)/)[1]);
 // Composition/form/strength cross-checked against Ipca's published Folitrax product list.
 // Category and prescription-required are conservative local test catalog choices.
 for(const [key,value] of Object.entries({category:'Antimetabolite',composition1:'Methotrexate',dosageForm:'Tablet',strength:[5,7.5,10][n]+' mg'}))await fill('#'+prefix+key,value);
 await page.select('#'+prefix+'prescription','true');}
 const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/master-confirmations'),{timeout:20000});response.catch(()=>{});
 await page.$eval('#'+id,e=>e.closest('section').querySelector('button').click());const res=await response;assert(res.ok(),await res.text());await idle();}
 }
 if(mode==='save'){
 const resPromise=page.waitForResponse(r=>r.url().endsWith('/process')&&r.request().method()==='POST',{timeout:30000});resPromise.catch(()=>{});await click('Save & Process');const r=await resPromise;const data=await r.json();assert(r.ok(),JSON.stringify(data));fs.writeFileSync(out+'/invoice-'+(index+1)+'-processed.json',JSON.stringify(data,null,2));await idle();
 }
 if(mode==='commit'){
 const checkbox=await page.evaluateHandle(()=>[...document.querySelectorAll('label')].find(e=>e.textContent.includes('I checked the supplier, product matches'))?.querySelector('input'));assert(checkbox.asElement(),'Human review checkbox absent');await checkbox.asElement().click();
 const pending=page.waitForResponse(r=>r.url().endsWith('/commit-stock')&&r.request().method()==='POST',{timeout:30000});pending.catch(()=>{});await click('Review & Add stock');const r=await pending,data=await r.json();assert(r.ok(),JSON.stringify(data));fs.writeFileSync(out+'/invoice-'+(index+1)+'-committed.json',JSON.stringify(data,null,2));await idle();
 }
 const view=await page.evaluate(()=>({text:document.querySelector('main')?.innerText,buttons:[...document.querySelectorAll('main button')].filter(e=>e.checkVisibility()).map(e=>({text:e.textContent.trim(),disabled:e.disabled})),selects:[...document.querySelectorAll('main select[id]')].map(e=>({id:e.id,options:[...e.options].map(o=>({v:o.value,t:o.text}))}))}));fs.writeFileSync(out+'/invoice-'+(index+1)+'-review-ui.json',JSON.stringify(view,null,2));await page.screenshot({path:out+'/screenshots/invoice-'+(index+1)+'-'+mode+'.png'});
 console.log(JSON.stringify({index,mode,buttons:view.buttons.filter(x=>/Confirm|Create|Match|Save|Review|stock|product/i.test(x.text)),selects:view.selects.filter(x=>x.id!=='saved-purchase-supplier')},null,2));
 }finally{await b.disconnect();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
