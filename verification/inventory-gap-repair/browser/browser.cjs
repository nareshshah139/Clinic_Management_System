const fs = require('node:fs');
const path = require('node:path');
const repo = process.env.CMS_REPO || process.env.INVENTORY_REPO || path.resolve(__dirname,'../../..');
const pp = require(require.resolve('puppeteer-core', { paths: [repo] }));
const out = process.env.INVENTORY_PROOF_OUTPUT || path.join(__dirname,'output');
const base = process.env.INVENTORY_BASE_URL || 'http://127.0.0.1:3126';
const fixtureBase = process.env.INVENTORY_FIXTURE_URL || 'http://127.0.0.1:4036';
for(const target of [base,fixtureBase]){
  const url=new URL(target);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Browser proofs require HTTP loopback app and fixture URLs');
}
fs.mkdirSync(out,{recursive:true});
/** @cc [owner:nareshshah139] isolated-gap-browser-proof
 * Each proof MUST use synthetic authentication and an owned browser profile. Requests outside the local app MUST be blocked, and the browser MUST close after success or failure.
 */
async function run(name, action, options = {}) {
  const profile = path.join(out, 'chrome-' + name + '-' + Date.now());
  const browser = await pp.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'], userDataDir: profile });
  const page = await browser.newPage();
  const steps = [], requests = [], errors = [], diagnosticActions = [];
  const scenarioKey = (options.scenario || name) + '~' + Date.now();
  const read = async tag => {
    const state = await page.evaluate(() => ({ url: location.href, text: document.body.innerText, buttons: [...document.querySelectorAll('button')].filter(e => e.getClientRects().length).map(e => ({text: e.innerText, aria: e.getAttribute('aria-label'), disabled: e.disabled})), inputs: [...document.querySelectorAll('input,select,textarea')].filter(e => e.getClientRects().length).map(e => ({ id: e.id, type: e.type, value: e.value, aria: e.getAttribute('aria-label'), checked: e.checked, disabled: e.disabled })) }));
    fs.writeFileSync(path.join(out, name + '-' + tag + '.json'), JSON.stringify(state));
    return state;
  };
  const click = async text => {
    await page.waitForFunction(text => [...document.querySelectorAll('button')].some(e => e.textContent.trim() === text && !e.disabled), {}, text);
    await page.evaluate(text => [...document.querySelectorAll('button')].find(e => e.textContent.trim() === text && !e.disabled).click(), text);
    steps.push({ type: 'control', text });
  };
  const fill = async (selector, value) => {
    await page.$eval(selector, (e, v) => { Object.getOwnPropertyDescriptor(e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, v); e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); }, value);
    steps.push({ type: 'field-edit', selector, value });
  };
  const snap = async tag => page.screenshot({path:path.join(out, name + '-' + tag + '.png'), fullPage:false});
  let result;
  try {
    page.setDefaultTimeout(15000);
    await page.setViewport(options.viewport || {width:1440,height:1000});
    await page.setExtraHTTPHeaders({'x-audit-case': scenarioKey});
    await page.setCookie({name:'auth_token', value:'synthetic-only', url:base});
    await page.setRequestInterception(true);
    page.on('request', async req => {
      try {
        const url = new URL(req.url());
        if (url.origin !== base && !['data:', 'blob:'].includes(url.protocol)) return await req.abort();
        const reply = options.intercept && await options.intercept(req, url);
        if (reply) return await req.respond({ contentType: 'application/json', ...reply, body: JSON.stringify(reply.body) });
        if (options.fixture && url.pathname.startsWith('/api/')) {
          const response = await fetch(fixtureBase + url.pathname.slice(4) + url.search, {method:req.method(),headers:{'Content-Type':'application/json','x-audit-case':scenarioKey},...(req.postData()?{body:req.postData()}: {})});
          return await req.respond({status:response.status,contentType:'application/json',body:await response.text()});
        }
        await req.continue();
      } catch (error) { errors.push({interception:error.message});if(!req.isInterceptResolutionHandled())await req.abort().catch(()=>{}); }
    });
    page.on('pageerror', error => errors.push({page:error.message}));
    page.on('response', response => { if (response.url().includes('/api/')) requests.push({url:response.url().replace(base,''),status:response.status(),method:response.request().method(),payload:response.request().postData()}); });
    await page.goto(base + '/dashboard/inventory?' + (options.query || 'area=purchases&view=intake&invoice=bill-1'), {waitUntil:'domcontentloaded'});
    if (options.ready) await page.waitForFunction(options.ready);
    else if (!options.query) await page.waitForFunction(() => document.querySelector('#invoice-number')?.value === 'TEST-001');
    await page.evaluate(()=>{
      window.__inventoryProofTransitions=[];
      const capture=()=>{
        const entry={stock:document.querySelector('[aria-label="Stock status"]')?.textContent?.trim(),actions:[...document.querySelectorAll('[aria-label="Invoice actions"] button')].filter(e=>e.getClientRects().length).map(e=>({label:e.textContent.trim(),disabled:e.disabled})),guidance:document.querySelector('#purchase-posting-guidance')?.textContent?.trim()};
        const last=window.__inventoryProofTransitions.at(-1);
        if(JSON.stringify(last)!==JSON.stringify(entry))window.__inventoryProofTransitions.push(entry);
      };
      new MutationObserver(capture).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});capture();
    });
    result = await action({page,read,click,fill,snap,steps,requests,diagnosticActions});
    const uiTransitions=await page.evaluate(()=>window.__inventoryProofTransitions);
    fs.writeFileSync(path.join(out, name + '-result.json'), JSON.stringify({passed:true,result,steps,diagnosticActions,requests,uiTransitions,errors}));
    console.log(JSON.stringify({name,passed:true,result,interactions:steps.length}));
  } catch (error) {
    await read('failure').catch(() => {});
    fs.writeFileSync(path.join(out,name+'-result.json'),JSON.stringify({passed:false,error:error.stack,steps,requests,errors}));
    console.error(JSON.stringify({name,passed:false,error:error.message}));
    process.exitCode = 1;
  } finally {
    await browser.close();
    fs.rmSync(profile,{recursive:true,force:true});
  }
}
module.exports = {run,out,base,repo};
