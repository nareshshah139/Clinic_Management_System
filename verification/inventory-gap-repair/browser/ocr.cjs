const assert = require('node:assert/strict');
const fs = require('node:fs');
const {run,out} = require('./browser.cjs');
const primary = 'Confirm reviewed values & add stock';
const receiptPrimary = 'Confirm & post bill';
const configure = (page,config) => page.evaluate(async config => (await fetch('/api/audit/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)})).json(),config);
const state = page => page.evaluate(async () => (await fetch('/api/audit/state')).json());
async function labelControl(ctx,label,value) {
  await ctx.page.evaluate(({label,value}) => {
    const node=[...document.querySelectorAll('label')].find(e=>e.innerText.trim()===label||e.textContent.trim()===label||[...e.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('').trim()===label);
    const input=node?.querySelector('input,select,textarea') || (node?.htmlFor?document.getElementById(node.htmlFor):null);
    if(!input)throw new Error('Missing control '+label);
    if(input.type==='checkbox')input.click();
    else {Object.getOwnPropertyDescriptor(input.tagName==='SELECT'?HTMLSelectElement.prototype:input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
  },{label,value});
  ctx.steps.push({type:value===undefined?'control':'field-edit',label,value});
}
async function complete(ctx,label=primary) {
  await ctx.click(label);
  await ctx.page.waitForFunction(()=>{const text=document.querySelector('[aria-label="Stock status"]')?.textContent||'';return text.includes('Stock added')||text.includes('Invoice posted');});
  await ctx.read('completed');
  const saved=await state(ctx.page);
  assert.equal(saved.invoice.status,'STOCK_COMMITTED');
  return saved;
}
async function corrections(ctx,name) {
  const ids=await ctx.page.$$eval('input[id$="-batch"]',es=>es.map(e=>e.id.replace(/-batch$/,'')));
  assert.equal(ids.length,name==='multi'?2:1);
  for(const id of ids){await ctx.fill(`[id="${id}-batch"]`,'B-102');await ctx.fill(`[id="${id}-expiry-month"]`,'8');await ctx.fill(`[id="${id}-qty"]`,'10');}
  await ctx.fill('#invoice-reported-netPayable',name==='multi'?'2832':'1416');
  if(name==='multi')for(const [id,value]of Object.entries({grossAmount:'2400',taxableAmount:'2400',totalGst:'432'}))await ctx.fill('#invoice-reported-'+id,value);
}
(async()=>{
  const names=process.argv.slice(2);
  for(const name of names.length?names:['baseline','corrections','multi','missing','ambiguous','newproduct','supplier','stale','unknown','unknown-retry','reviewed','receipt','catalog','catalog-recovery','delayed-catalog','bulk','review-only','bulk-reset','bulk-adopt-local','bulk-adopt-saved']) {
    let oldRequested=false,oldResponded=false,newResponded=false;
    await run(name,async ctx=>{
      const {page,click,fill,read,snap,steps}=ctx;
      await page.waitForFunction(()=>document.body.innerText.includes('Confirm reviewed values')||document.body.innerText.includes('Confirm & post bill')||document.body.innerText.includes('Reopen review and fix products'));
      await read('before-flow');
      if(name==='baseline'||name==='corrections'||name==='multi') {
        if(name==='multi'&&process.env.INVENTORY_SKIP_VISUAL!=='1') {
          const geometry={};
          for(const [device,viewport]of Object.entries({desktop:{width:1440,height:1000},phone:{width:390,height:844}})) {
            await page.setViewport(viewport);await page.evaluate(()=>{scrollTo(0,0);for(const element of document.querySelectorAll('*'))if(element.scrollTop)element.scrollTop=0;});
            await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await snap('before-'+device);
            geometry[device]=await page.$eval('input[id$="-batch"]',e=>{let scroll=scrollY;for(let parent=e.parentElement;parent&&parent!==document.documentElement;parent=parent.parentElement)scroll+=parent.scrollTop;return {firstBatchContentTop:e.getBoundingClientRect().top+scroll,width:document.documentElement.scrollWidth,viewport:innerWidth};});
            const jump=await page.$('a[aria-label^="Edit line 1"]');
            if(jump)await jump.evaluate(e=>e.click());else await page.$eval('input[id$="-batch"]',e=>e.scrollIntoView({block:'center'}));
            ctx.diagnosticActions.push({kind:'visual-focus-proof',device,control:jump?'Edit line 1 batch':'scroll batch field'});
            await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
            geometry[device].focus=await page.evaluate(()=>{const field=document.querySelector('input[id$="-batch"]'),footer=document.querySelector('[aria-label="Invoice actions"]'),f=field.getBoundingClientRect(),r=footer.getBoundingClientRect();return {fieldTop:f.top,fieldBottom:f.bottom,footerTop:r.top,footerHeight:r.height,activeId:document.activeElement?.id,fieldId:field.id};});
            if(process.env.INVENTORY_CONFIRM_VISUAL==='1'&&device==='phone'){const focus=geometry[device].focus;assert(focus.fieldTop>=56&&focus.fieldBottom<=focus.footerTop,'Jump target is fully visible above the mobile footer');assert.equal(focus.activeId,focus.fieldId);}
            await snap('review-'+device);
          }
          fs.writeFileSync(out+'/multi-geometry.json',JSON.stringify(geometry));
          await page.setViewport({width:1440,height:1000});
        }
        if(name!=='baseline')await corrections(ctx,name);
        const saved=await complete(ctx);
        assert.equal(steps.length,name==='baseline'?1:name==='corrections'?5:11);
        return {interactions:steps.length,fieldEdits:steps.filter(s=>s.type==='field-edit').length,status:saved.invoice.status,mutations:saved.writes.filter(w=>!w.path.endsWith('/master-matches')).map(w=>({method:w.method,path:w.path}))};
      }
      if(name==='stale') {
        await fill('input[id$="-batch"]','LOCAL-CORRECTION');
        await click(primary);
        await page.waitForFunction(()=>document.body.innerText.includes('Compare with saved version'));
        assert.equal(await page.$eval('input[id$="-batch"]',e=>e.value),'LOCAL-CORRECTION');
        assert(await page.evaluate(label=>[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===label).every(b=>b.disabled),primary));
        await read('blocked-stale');
        await configure(page,{stale:false});
        await click('Compare with saved version');
        await page.waitForSelector('[aria-label="Compare with saved invoice"]');
        await click('Apply my corrections to this invoice');
        assert.equal(await page.$eval('input[id$="-batch"]',e=>e.value),'LOCAL-CORRECTION');
        const saved=await complete(ctx);
        assert.equal(saved.invoice.items[0].batchNumber,'LOCAL-CORRECTION');
        return {recovery:'stale → compare → apply local correction → confirmed stock',interactions:steps.length,status:saved.invoice.status};
      }
      if(name==='unknown'||name==='unknown-retry') {
        await configure(page,{commitBeforeFailure:name==='unknown'});
        await click(primary);
        await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Refresh stock status'&&!b.disabled));
        const text=(await read('unknown-locked')).text;
        assert(text.includes('Stock status unknown'));
        assert(!text.includes('Ready to add stock'));
        assert(!await page.evaluate(label=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===label&&!b.disabled),primary));
        if(name==='unknown'&&process.env.INVENTORY_SKIP_VISUAL!=='1') {await snap('unknown-desktop');await page.setViewport({width:390,height:844});await snap('unknown-phone');}
        await configure(page,{readbackUnavailable:false,unknownCommit:false});
        await click('Refresh stock status');
        if(name==='unknown-retry') {
          await page.waitForFunction(()=>document.body.innerText.includes('Ready to add stock'));
          const confirmed=await state(page);assert.equal(confirmed.invoice.status,'REVIEWED');
          const saved=await complete(ctx,'Add stock');assert.equal(saved.writes.filter(w=>w.path.endsWith('/commit-stock')).length,2);
          return {recovery:'unknown → authoritative reviewed → explicit retry → confirmed stock',commitAttempts:2,status:saved.invoice.status};
        }
        await page.waitForFunction(()=>document.querySelector('[aria-label="Stock status"]')?.textContent.includes('Stock added'));
        await read('recovered');
        const saved=await state(page);
        assert.equal(saved.writes.filter(w=>w.path.endsWith('/commit-stock')).length,1);
        return {recovery:'unknown → status-only refresh → confirmed stock',commitRequests:1,status:saved.invoice.status};
      }
      if(name==='reviewed') {
        await labelControl(ctx,'Reason to reopen review','Correct batch from original invoice');
        await click('Reopen review and fix products');
        await page.waitForSelector('input[id$="-batch"]:not([disabled])');
        await fill('input[id$="-batch"]','B-REVISED');
        const saved=await complete(ctx);
        assert.equal(saved.writes.find(w=>w.path.endsWith('/reopen-review')).payload.reason,'Correct batch from original invoice');
        return {reopenReasonRecorded:true,status:saved.invoice.status,interactions:steps.length};
      }
      if(name==='receipt') {
        const saved=await complete(ctx,receiptPrimary);
        await page.waitForFunction(()=>document.body.innerText.includes('0 added again'));
        assert.equal(saved.invoice.workflowReceiptId,'receipt-1');
        return {receiptRetained:true,zeroAddedWording:true,status:saved.invoice.status,interactions:steps.length};
      }
      if(name==='missing') {
        assert(!await page.evaluate(label=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===label&&!b.disabled),primary));
        await fill('#distributor-gstin','36ABCDE1234F1Z5');await fill('input[id$="-batch"]','B-102');await fill('input[id$="-expiry-year"]','2028');
        const saved=await complete(ctx);return {status:saved.invoice.status,interactions:steps.length};
      }
      if(name==='review-only') {
        await click('Confirm reviewed values & mark reviewed');
        await page.waitForFunction(()=>document.querySelector('[aria-label="Stock status"]')?.textContent.includes('Stock not added'));
        await page.waitForFunction(()=>document.body.innerText.includes('authorized')||document.body.innerText.includes('reviewed'));
        let saved=await state(page);
        for(let i=0;saved.invoice.status!=='REVIEWED'&&i<50;i++){await new Promise(r=>setTimeout(r,50));saved=await state(page);}
        assert.equal(saved.invoice.status,'REVIEWED');
        assert.equal(saved.writes.filter(w=>w.path.endsWith('/commit-stock')).length,0);
        assert.equal(saved.writes.filter(w=>w.path.endsWith('/review')).length,1);
        await read('review-only-handoff');return {reviewed:true,commitRequests:0,interactions:steps.length};
      }
      if(name==='ambiguous') {
        await click('Confirm Match');const saved=await complete(ctx);return {status:saved.invoice.status,interactions:steps.length};
      }
      if(name==='newproduct') {
        await page.waitForSelector('#product-0-new-kind');
        await page.select('#product-0-new-kind','COSMETIC');steps.push({type:'field-edit',selector:'#product-0-new-kind',value:'COSMETIC'});
        await fill('#product-0-new-category','Skin care');await click('Create new item');const saved=await complete(ctx);return {status:saved.invoice.status,interactions:steps.length};
      }
      if(name==='supplier') {
        await click('Correct saved GSTIN');await fill('#supplier-gstin-correction-reason','Verified against original synthetic invoice');
        await page.evaluate(()=>[...document.querySelectorAll('label')].find(e=>e.textContent.includes('I checked the new GSTIN against the original')).querySelector('input').click());steps.push({type:'confirmation',text:'Verified supplier GSTIN against original'});
        await click('Update saved GSTIN');const saved=await complete(ctx);return {status:saved.invoice.status,interactions:steps.length};
      }
      if(name==='catalog'||name==='catalog-recovery') {
        if(name==='catalog-recovery')await configure(page,{failAfterMasterSave:true});
        await click('Fix products on this invoice');await click('Complete Moisture Cream details');
        await page.select('#product-0-edit-kind','COSMETIC');steps.push({type:'field-edit',selector:'#product-0-edit-kind',value:'COSMETIC'});
        await fill('#product-0-edit-category','Skin care');await click('Save details and recheck invoice');
        if(name==='catalog') {const saved=await complete(ctx);return {status:saved.invoice.status,interactions:steps.length};}
        await page.waitForFunction(()=>document.body.innerText.includes('Product details saved. Invoice check could not finish.'));
        await read('catalogue-read-failed');
        assert(!await page.evaluate(label=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===label&&!b.disabled),primary));
        await configure(page,{matchesUnavailable:false});
        await click('Retry product check');
        const saved=await complete(ctx);
        assert.equal(saved.writes.filter(w=>w.path.includes('/master-records/')).length,1);
        return {masterSavedOnce:true,recovery:'saved product → failed lookup → retry lookup → confirmed stock',status:saved.invoice.status};
      }
      if(['bulk-reset','bulk-adopt-local','bulk-adopt-saved'].includes(name)) {
        await page.evaluate(()=>[...document.querySelectorAll('summary')].find(e=>e.textContent.includes('Apply GST or discount to selected rows')).click());steps.push({type:'disclosure',text:'Apply GST or discount to selected rows'});
        await labelControl(ctx,'Select line 1 for shared terms');await labelControl(ctx,'Select line 2 for shared terms');await labelControl(ctx,'Total GST %','12');await click('Preview 2 selected rows');await click('Apply to 2 selected rows');
        assert(await page.evaluate(()=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Undo shared terms')));
        if(name==='bulk-reset') {
          await click('New invoice');
          await page.waitForFunction(()=>document.querySelector('#invoice-number')?.value==='');
        } else {
          await configure(page,{stale:true});await click('Save draft');
          await page.waitForFunction(()=>document.body.innerText.includes('Compare with saved version'));
          await click('Compare with saved version');
          await click(name==='bulk-adopt-local'?'Apply my corrections to this invoice':'Use saved values');
          const expected=name==='bulk-adopt-local'?['6','6','9']:['9','9','9'];
          assert.deepEqual(await page.$$eval('input[id$="-cgst"]',es=>es.map(e=>e.value)),expected);
        }
        assert(!await page.evaluate(()=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Undo shared terms')));
        await page.evaluate(()=>{const summary=[...document.querySelectorAll('summary')].find(e=>e.textContent.includes('Apply GST or discount to selected rows'));if(!summary?.parentElement.open)summary?.click();});
        await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Preview 0 selected rows'&&e.disabled));
        assert(!await page.evaluate(()=>[...document.querySelectorAll('label')].filter(e=>e.textContent.includes('for shared terms')).some(e=>e.querySelector('input')?.checked)));
        const saved=await state(page);assert.equal(saved.writes.filter(w=>w.path.endsWith('/commit-stock')).length,0);
        await read('cleared-bulk-state');return {selectionCleared:true,undoCleared:true,commitRequests:0,adopted:name==='bulk-reset'?'new invoice':name==='bulk-adopt-local'?'local corrections':'saved values'};
      }
      if(name==='bulk') {
        const initial=await page.$$eval('input[id$="-cgst"],input[id$="-sgst"],input[id$="-igst"]',es=>es.map(e=>({id:e.id,value:e.value})));
        await page.evaluate(()=>[...document.querySelectorAll('summary')].find(e=>e.textContent.includes('Apply GST or discount to selected rows')).click());steps.push({type:'disclosure',text:'Apply GST or discount to selected rows'});
        await labelControl(ctx,'Select line 1 for shared terms');await labelControl(ctx,'Select line 2 for shared terms');
        await labelControl(ctx,'Total GST %','12');
        await click('Preview 2 selected rows');await read('bulk-preview');
        assert.deepEqual(await page.$$eval('input[id$="-cgst"],input[id$="-sgst"],input[id$="-igst"]',es=>es.map(e=>({id:e.id,value:e.value}))),initial);
        await click('Apply to 2 selected rows');
        let values=await page.$$eval('input[id$="-cgst"]',es=>es.map(e=>e.value));assert.deepEqual(values,['6','6','9']);
        const first=await page.$eval('input[id$="-cgst"]',e=>e.id);await fill(`[id="${first}"]`,'8');
        await click('Undo shared terms');values=await page.$$eval('input[id$="-cgst"]',es=>es.map(e=>e.value));assert.deepEqual(values,['8','9','9']);
        const rowIds=await page.$$eval('input[id$="-batch"]',es=>es.map(e=>e.id.replace(/-batch$/,'')));
        await labelControl(ctx,'Shared term','discount');await labelControl(ctx,'Shared discount %','10');await click('Preview 2 selected rows');
        await fill(`[id="${rowIds[2]}-batch"]`,'B-103');
        assert(await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Apply to 2 selected rows'&&b.disabled)));
        await click('Preview 2 selected rows');await click('Apply to 2 selected rows');
        const discounts=await page.evaluate(ids=>ids.map(id=>document.getElementById(id+'-discount').value),rowIds);assert.deepEqual(discounts,['10','10','0']);
        await fill(`[id="${rowIds[0]}-discount"]`,'15');await click('Undo shared terms');
        assert.deepEqual(await page.evaluate(ids=>ids.map(id=>document.getElementById(id+'-discount').value),rowIds),['15','0','0']);
        assert.equal(await page.$eval(`[id="${rowIds[2]}-batch"]`,e=>e.value),'B-103');
        const saved=await state(page);assert.equal(saved.writes.filter(w=>!w.path.endsWith('/master-matches')).length,0);
        await read('bulk-undone');return {terms:['GST','discount'],previewStockNeutral:true,selectedRowsOnly:true,undoPreservesLaterEdit:true,editedBasisBlocksApply:true,mutations:0};
      }
      if(name==='delayed-catalog') {
        await fill('input[id$="-batch"]','OLD-CATALOG');
        for(let i=0;!oldRequested&&i<100;i++)await new Promise(r=>setTimeout(r,50));
        assert(oldRequested,'Older catalogue check was issued');
        await fill('input[id$="-batch"]','NEW-CATALOG');
        for(let i=0;(!oldResponded||!newResponded)&&i<100;i++)await new Promise(r=>setTimeout(r,50));
        assert(oldResponded&&newResponded,'Both catalogue responses arrived');
        await page.waitForFunction(()=>document.body.innerText.includes('Complete Moisture Cream details'));
        assert(!await page.evaluate(label=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===label&&!b.disabled),primary));
        assert.equal(await page.$eval('input[id$="-batch"]',e=>e.value),'NEW-CATALOG');
        await read('old-response-ignored');
        await fill('input[id$="-batch"]','B-102');const saved=await complete(ctx);
        return {olderReadyIgnored:true,currentIncompleteBlocked:true,freshCheckRecovered:true,status:saved.invoice.status};
      }
    },{fixture:true,scenario:name==='catalog-recovery'?'catalog':name==='unknown-retry'?'unknown':name.startsWith('bulk-')?'bulk':name,intercept:async(req,url)=>{
      if(name!=='delayed-catalog'||!url.pathname.endsWith('/master-matches'))return;
      const payload=JSON.parse(req.postData()||'{}'),batch=payload.items?.[0]?.batchNumber;
      if(!['OLD-CATALOG','NEW-CATALOG'].includes(batch))return;
      const old=batch==='OLD-CATALOG';if(old)oldRequested=true;
      await new Promise(r=>setTimeout(r,old?1800:100));
      if(old)oldResponded=true;else newResponded=true;
      const product={id:'product-1',name:'Moisture Cream',manufacturerName:'Sample maker',packSizeLabel:'50 g',price:200,productKind:'COSMETIC',type:'consumable',category:old?'Skin care':'',requiresPrescription:false};
      return {body:{matches:payload.items.map((item,lineIndex)=>({lineIndex,ocr:item,candidates:[],recommendedAction:'REVIEW_MATCHES',matchLabel:'Same product',catalogueResolution:old?{state:'ready',product}:{state:'incomplete',product,missingFields:['category']}}))}};
    }});
  }
})();
