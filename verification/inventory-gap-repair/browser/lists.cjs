const assert = require('node:assert/strict');
const {run} = require('./browser.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const cases = [
  {name:'purchase-list', query:'area=purchases&view=register', route:'/api/pharmacy/purchase-invoices', loading:'Loading invoices', retry:'Retry invoices', empty:'No invoices match these filters.', search:'input[placeholder="Invoice number or supplier"]', body: search => ({data: search ? [{id:'invoice-'+search,invoiceNumber:search,distributorName:'Synthetic supplier',invoiceDate:'2026-11-01',status:'DRAFT',netPayable:120}] : [],pagination:{total:search?1:0,page:1,pages:1}})},
  {name:'loss-list', query:'area=stock&view=LOSS', route:'/api/inventory/workspace/documents', loading:'Loading records', retry:'Retry records', empty:'No loss & breakage match these filters.', search:'section label input:not([type="date"])', body:search => ({rows:search?[{id:'loss-'+search,kind:'LOSS',reference:search,status:'DRAFT',totalAmount:1,version:1,createdAt:'2026-11-01',payload:{lines:[]}}]:[],total:search?1:0,page:1,totalPages:1})},
  {name:'supplier-list', query:'area=purchases&view=suppliers', route:'/api/inventory/workspace/suppliers', loading:'Loading suppliers', retry:'Retry suppliers', empty:'No suppliers yet.', body:() => []},
];
(async () => {
  for (const item of cases) {
    let mode = 'error';
    await run(item.name, async ({page,read,click,fill,requests}) => {
      await page.waitForFunction(t=>document.body.innerText.includes(t),{},item.loading);
      await read('loading');
      assert(!await page.evaluate(t=>document.body.innerText.includes(t),item.empty));
      await page.waitForFunction(()=>document.body.innerText.includes('Synthetic read failure'));
      await read('error');
      mode = 'ready';
      await click(item.retry);
      await page.waitForFunction(t=>document.body.innerText.includes(t),{},item.empty);
      assert(!await page.evaluate(()=>document.body.innerText.includes('Synthetic read failure')));
      await read('empty-after-retry');
      if (item.search) {
        await fill(item.search,'OLD');
        await page.waitForFunction(t=>document.body.innerText.includes(t),{},item.loading);
        await fill(item.search,'NEW');
        await page.waitForFunction(()=>document.body.innerText.includes('NEW'));
        await delay(950);
        const text=await page.evaluate(()=>document.body.innerText);
        assert(text.includes('NEW'));
        assert(!text.includes('OLD'));
        await read('latest-filter-only');
      }
      return {loading:true,error:true,retry:true,empty:true,lateFilterIgnored:!!item.search,requests:requests.length};
    },{fixture:true,query:item.query,intercept:async(req,url)=>{
      if(url.pathname==='/api/inventory/workspace/capabilities') return {body:{itemWrite:true,itemCreate:true,supplierCreate:true,supplierUpdate:true,kinds:{LOSS:{read:true,write:true},COUNT:{read:true,write:true},CORRECTION:{read:true,write:true}}}};
      if(url.pathname!==item.route || req.method()!=='GET') return;
      const search=url.searchParams.get('search')||'';
      const error = mode === 'error';
      await delay(error?700:search==='OLD'?900:100);
      if(error)return {status:503,body:{message:'Synthetic read failure'}};
      return {status:200,body:item.body(search)};
    }});
  }
  await run('stock-mobile', async({page,read,snap})=>{
    await page.waitForSelector('input[placeholder="Type a product name or scan a barcode"]');
    await page.waitForFunction(()=>document.body.innerText.includes('Moisture Cream'));
    const geometry=await page.$eval('input[placeholder="Type a product name or scan a barcode"]',e=>({inputWidth:e.getBoundingClientRect().width,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth}));
    assert(geometry.inputWidth>=280);
    assert(geometry.documentWidth<=geometry.viewport);
    await read('state');
    if(process.env.INVENTORY_SKIP_VISUAL!=='1'){await snap('phone');await page.setViewport({width:1440,height:1000});await snap('desktop');}
    return geometry;
  },{fixture:true,query:'area=stock&view=list',viewport:{width:390,height:844}});
})();
