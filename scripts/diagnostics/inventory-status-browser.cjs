// Synthetic local fixture only. Run with inventory-simplicity-fixtures.cjs and frontend port 3126.
const puppeteer = require('puppeteer-core'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const out = path.resolve(__dirname, '../../output/inventory-status');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const page = await browser.newPage(), errors = [], checks = [], contrast = [];
  page.on('pageerror', e => errors.push(e.message));
  const base = 'http://127.0.0.1:3126';
  const checkState = async tone => {
    await page.waitForFunction(tone => document.querySelector('[aria-label="Line 1 checks"] li')?.dataset.reviewState === tone, {}, tone);
    checks.push('Line check state: ' + tone);
  };
  const fill = async value => {
    await page.$eval('input[id$="-batch"]', (el, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  };
  const confirm = () => page.$eval('button[aria-label="Confirm line 1 batch checked"]', el => el.click());
  const capture = async (state, width, dark) => {
    await page.setViewport({ width, height: 1000 });
    await page.evaluate(dark => { document.documentElement.classList.toggle('dark', dark); document.querySelector('#purchase-review-checklist').scrollIntoView({ block: 'start' }); }, dark);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    const pairs = await page.evaluate(() => {
      const ctx = document.createElement('canvas').getContext('2d');
      const rgb = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const lum = color => rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
      const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
      return [...document.querySelectorAll('span[data-review-state]')].filter(el => el.getClientRects().length).map(el => { const s = getComputedStyle(el); return { state: el.dataset.reviewState, text: ratio(s.color, s.backgroundColor), border: ratio(s.borderTopColor, s.backgroundColor) }; });
    });
    assert(pairs.every(p => p.text >= 4.5 && p.border >= 3), JSON.stringify(pairs));
    contrast.push({ state, width, dark, minText: Math.min(...pairs.map(p => p.text)), minBorder: Math.min(...pairs.map(p => p.border)) });
    await page.screenshot({ path: `${out}/${state}-${width}-${dark ? 'dark' : 'light'}.png` });
  };
  try {
    await page.setCookie({ name: 'auth_token', value: 'synthetic-only', url: base });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(base + '/dashboard/inventory?area=purchases&view=intake&invoice=bill-1', { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[id$="-batch"]');
    await checkState('warning');
    await fill(''); await checkState('error');
    assert(await page.$eval('input[id$="-batch"]', el => el.getAttribute('aria-invalid') === 'true'));
    for (const width of [1440, 390]) await capture('needs-correction', width, false);
    await fill('B-VERIFIED'); await checkState('warning'); await confirm(); await checkState('success');
    for (const width of [1440, 390]) await capture('checked', width, false);
    await capture('checked', 390, true);
    await fill('B-EDITED'); await checkState('warning');
    assert(await page.evaluate(() => document.querySelector('[aria-label="Line 1 checks"]').textContent.includes('Changed — check again')));
    await capture('changed', 390, true);
    assert.deepEqual(errors, []);
    const result = { synthetic: true, checks, contrast, errors, passed: true };
    fs.writeFileSync(out + '/verification.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
