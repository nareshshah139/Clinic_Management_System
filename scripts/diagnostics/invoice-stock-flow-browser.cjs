const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const before = process.argv.includes('--before');
const newInvoice = process.argv.includes('--new');
const base = 'http://127.0.0.1:3126';
const output = path.resolve(__dirname, '../../output/invoice-stock-flow');

/**
 * @cc [owner:nareshshah139] invoice-stock-browser-proof
 * The local synthetic invoice check MUST fail unless the primary completion action reaches
 * STOCK_COMMITTED through one review and one commit. It MUST NOT use clinic authentication.
 */
async function verifyPurchaseFlow() {
  const chrome = !process.argv.includes('--obscura');
  const browser = chrome
    ? await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] })
    : await puppeteer.connect({ browserWSEndpoint: 'ws://127.0.0.1:9224/devtools/browser', protocolTimeout: 15000 });
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    if (chrome) await page.setViewport({ width: 1440, height: 1000 });
    await page.setCookie({ name: 'auth_token', value: 'synthetic-only', url: base });
    const target = newInvoice ? `new=stock-proof-${Date.now()}` : 'invoice=bill-1';
    await page.goto(`${base}/dashboard/inventory?area=purchases&view=intake&${target}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (newInvoice) {
      await page.waitForSelector('a[href="#distributor-name"]');
      await page.click('a[href="#distributor-name"]');
      const values = {
        '#distributor-name': 'Sample Distributors', '#distributor-gstin': '36ABCDE1234F1Z5',
        '#distributor-dl': 'DL-TEST-42',
        '#invoice-number': 'TEST-NEW', '#invoice-date': '2026-11-03', '#goods-date': '2026-11-03',
        'input[id$="-product"]': 'Moisture Cream', 'input[id$="-pack-size"]': '50 g',
        'input[id$="-unit"]': 'Tube', 'input[id$="-hsn"]': '3304', 'input[id$="-batch"]': 'B-NEW',
        'input[id$="-expiry-month"]': '8', 'input[id$="-expiry-year"]': '2028',
        'input[id$="-qty"]': '10', 'input[id$="-free-qty"]': '2',
        'input[id$="-rate"]': '120', 'input[id$="-mrp"]': '200',
      };
      for (const [selector, value] of Object.entries(values)) {
        await page.$eval(selector, (input, value) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }, value);
      }
    } else {
      await page.waitForFunction(() => document.querySelector('#invoice-number')?.value === 'TEST-001');
      await page.evaluate(() => document.querySelector('button[aria-label="Confirm line 1 batch checked"]')?.click());
    }
    const initialWrites = await page.evaluate(async () => (await fetch('/api/test-writes')).json());
    if (!before) {
      await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Refresh Matches').click());
      await page.waitForFunction(() => [...document.querySelectorAll('label')].some(label => label.textContent.includes('I verified the invoice against the original')));
      await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent.includes('I verified the invoice against the original')).querySelector('input').click());
    }
    const label = before ? 'Save corrections' : 'Save & add stock';
    await page.waitForFunction(label => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === label && !button.disabled), {}, label);
    if (chrome) {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: path.join(output, newInvoice ? 'new-desktop.png' : 'desktop.png') });
      await page.setViewport({ width: 390, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The invoice must fit the phone viewport');
      await page.screenshot({ path: path.join(output, newInvoice ? 'new-mobile.png' : 'mobile.png') });
      await page.evaluate(() => {
        const options = [...document.querySelectorAll('[aria-label="Invoice actions"] summary')].find(summary => summary.textContent === 'More options');
        if (options) options.parentElement.open = true;
      });
      assert(await page.evaluate(() => {
        const panel = document.querySelector('[aria-label="Invoice actions"] details[open] > div');
        if (!panel) return true;
        const bounds = panel.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth;
      }), 'More options must stay within the phone viewport');
      await page.screenshot({ path: path.join(output, newInvoice ? 'new-mobile-options.png' : 'mobile-options.png') });
      await page.evaluate(() => document.querySelectorAll('[aria-label="Invoice actions"] details').forEach(details => { details.open = false; }));
    }
    await page.evaluate(label => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label).click(), label);
    await page.waitForFunction(before => before
      ? document.body.innerText.includes('saved. Stock not added.')
      : document.querySelector('[aria-label="Stock status"]')?.textContent.includes('Stock added'), {}, before);
    const result = await page.evaluate(async count => {
      const invoice = await (await fetch('/api/pharmacy/purchase-invoices/bill-1')).json();
      const writes = (await (await fetch('/api/test-writes')).json()).slice(count);
      return {
        invoiceStatus: invoice.status,
        draftSaves: writes.filter(write => write.path.includes('/drafts')).length,
        reviewRequests: writes.filter(write => write.path.endsWith('/review')).length,
        stockCommitRequests: writes.filter(write => write.path.endsWith('/commit-stock')).length,
      };
    }, initialWrites.length);
    fs.writeFileSync(path.join(output, before ? 'before.json' : newInvoice ? 'new-after.json' : 'after.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
    assert.equal(result.invoiceStatus, 'STOCK_COMMITTED', 'Completing a received bill must update stock');
    assert.equal(result.draftSaves, 1);
    assert.equal(result.reviewRequests, 1);
    assert.equal(result.stockCommitRequests, 1);
  } finally {
    if (chrome) await browser.close(); else browser.disconnect();
  }
}

verifyPurchaseFlow().catch(error => { console.error(error.stack); process.exitCode = 1; });
