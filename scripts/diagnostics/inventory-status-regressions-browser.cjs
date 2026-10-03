// Synthetic local fixture only; no clinic records or external OCR requests.
const puppeteer = require('puppeteer-core'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const out = path.resolve(__dirname, '../../output/inventory-status-fixes');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const page = await browser.newPage(), errors = [], checks = [], writes = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.method() !== 'GET' && r.url().includes('/api/')) writes.push(new URL(r.url()).pathname); });
  const base = 'http://127.0.0.1:3126';
  const fill = async (selector, value) => {
    await page.$eval(selector, (el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  };
  const state = async (field, tone) => {
    await page.waitForFunction((field, tone) => [...document.querySelectorAll('[aria-label="Line 1 checks"] li')].some(el => el.querySelector('p')?.textContent.toLowerCase().includes(field) && el.dataset.reviewState === tone), {}, field, tone);
    checks.push(`${field}: ${tone}`);
  };
  const confirm = async field => { await page.$eval(`button[aria-label="Confirm line 1 ${field} checked"]`, el => { if (el.disabled) throw Error('Check is disabled'); el.click(); }); };
  const save = async () => {
    const response = page.waitForResponse(r => r.url().includes('/purchase-invoices/drafts/') && r.request().method() !== 'GET' && r.status() === 200);
    await page.evaluate(() => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Save corrections').click());
    await response;
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === 'Save corrections' && !el.disabled));
  };
  const finalCheck = async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('label')].some(el => el.textContent.includes('I verified the invoice against the original') && el.querySelector('input[type=checkbox]')));
    await page.evaluate(() => [...document.querySelectorAll('label')].find(el => el.textContent.includes('I verified the invoice against the original')).querySelector('input').click());
  };
  const pending = async field => {
    await page.waitForFunction(field => document.querySelector(`input[id$="-${field}"]`)?.className.includes(field === 'batch' ? 'border-amber-600' : 'border-red-600'), {}, field);
    assert(await page.evaluate(() => document.querySelector('#purchase-review-checklist').textContent.includes('1 check to finish') && !document.querySelector('#purchase-review-checklist').textContent.includes('No outstanding OCR checks') && ![...document.querySelectorAll('label')].some(el => el.textContent.includes('I verified the invoice against the original'))));
  };
  const capture = async (name, width) => {
    await page.setViewport({ width, height: 1000 });
    await page.evaluate(() => document.querySelector('#purchase-review-checklist').scrollIntoView({ block: 'start' }));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
    await page.screenshot({ path: `${out}/${name}-${width}.png` });
  };
  try {
    await page.setCookie({ name: 'auth_token', value: 'synthetic-only', url: base });
    await page.goto(base + '/dashboard/inventory?area=purchases&view=intake&invoice=bill-1', { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[id$="-ocr-flags"]');
    await fill('input[id$="-ocr-flags"]', 'uncertain_batch, uncertain_expiry');
    await fill('input[id$="-expiry-month"]', '13'); await state('expiry', 'error');
    assert(await page.$eval('button[aria-label="Confirm line 1 expiry checked"]', el => el.disabled));
    await capture('invalid-expiry', 1440);
    await fill('input[id$="-expiry-month"]', '12'); await confirm('expiry'); await state('expiry', 'success');
    await confirm('batch'); await save(); await finalCheck();
    await fill('input[id$="-expiry-year"]', ''); await state('expiry', 'error'); await pending('expiry-year');
    await capture('invalid-expiry-year', 390);
    await fill('input[id$="-expiry-year"]', '2029'); await confirm('expiry'); await state('expiry', 'success');
    await fill('input[id$="-batch"]', 'B-CHANGED'); await state('batch', 'warning'); await pending('batch');
    await save(); await page.reload({ waitUntil: 'networkidle2' }); await state('batch', 'warning'); await pending('batch');
    checks.push('Pending batch check survives save and reload');
    await confirm('batch'); await save(); await finalCheck();
    assert(await page.$eval('input[id$="-batch"]', el => el.className.includes('border-emerald-600')));
    await capture('verified', 390);
    assert(!writes.some(p => /review$|commit-stock$|process$/.test(p)), 'Unexpected stock or approval call');
    assert.deepEqual(errors, []);
    const result = { synthetic: true, passed: true, checks, errors, stockWrites: 0 };
    fs.writeFileSync(out + '/verification.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
