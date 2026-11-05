const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const baseline = process.argv.includes('--baseline');
const base = process.env.CLINIC_URL || 'http://127.0.0.1:3105';
const stamp = '2026-11-05T09:00:00.000Z';
const user = { id: 'language-user', role: 'OWNER', firstName: 'Language', lastName: 'Check', branchId: 'fixture-branch', metadata: {} };
const prescription = {
  prescriptionId: 'language-rx', patient: { id: 'language-patient', name: 'Sample Patient' },
  doctor: { id: 'language-doctor', name: 'Sample Doctor' }, createdAt: stamp,
  pendingHours: 1, isOverTwoHours: false, status: 'pending', linkedInvoiceIds: [],
  medications: [{ drugName: 'Sample cream', prescribedQuantity: 1, dispensedQuantity: 0, coverageStatus: 'not_started' }],
};
const session = { id: 'language-chat', title: 'Agentic Pharmacy', status: 'ACTIVE', hasContent: true, messages: [], proposals: [], createdAt: stamp, updatedAt: stamp };
const responses = {
  '/api/auth/me': user,
  '/api/users/language-user': user,
  '/api/pharmacy/dashboard': { todaySales: 0, todayInvoices: 0, totalDrugs: 1, lowStockDrugs: 0, packagesCount: 0 },
  '/api/pharmacy/prescription-queue': { data: [prescription], pagination: { total: 1, page: 1, limit: 8, pages: 1 } },
  '/api/pharmacy/prescription-queue/language-rx/stock-check': { items: [{ drugName: 'Sample cream', matchedDrug: { id: 'cream', name: 'Sample cream' }, stockStatus: 'IN_STOCK', totalNonExpiredStock: 10, lowStock: false, nearExpiry: true, alternatives: [], batches: [{ id: 'batch', batchNumber: 'B-TEST', currentStock: 10, expiryDate: '2026-11-30T23:59:59.999Z', stockStatus: 'IN_STOCK', storageLocation: 'Shelf A' }] }] },
  '/api/pharmacy/agent/status': { configured: true },
  '/api/pharmacy/agent/sessions': { data: [session] },
  '/api/pharmacy/agent/sessions/language-chat': session,
  '/api/pharmacy/partner-sales/today-summary': { date: '2026-11-05', partnerCount: 0, submittedCount: 0, missingCount: 0, totalQuantity: 0, grossAmount: 0, netAmount: 0, discrepancyCount: 0, stockCommittedCount: 0 },
  '/api/pharmacy/partner-sales/missing': { missingPartners: [] },
  '/api/pharmacy/partner-sales': { data: [], sales: [], total: 0, pagination: { total: 0, page: 1, totalPages: 1 } },
};

async function main() {
  assert(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
  const browser = process.env.CHROME_PATH
    ? await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-first-run'] })
    : await puppeteer.connect({ browserWSEndpoint: process.env.OBSCURA_CDP_URL || 'ws://127.0.0.1:9227/devtools/browser', protocolTimeout: 30000 });
  const page = await browser.newPage();
  const errors = [];
  try {
    await page.setViewport({ width: 1440, height: 1100 });
    await page.setCookie({ name: 'auth_token', value: 'synthetic-language-check', url: base });
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.origin === base && url.pathname.startsWith('/api/')) {
        const body = responses[url.pathname] ?? { data: [], users: [], appointments: [], missingPartners: [], total: 0 };
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      } else if (url.origin === base || url.protocol === 'data:') await request.continue();
      else await request.abort();
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/dashboard/pharmacy?section=counter`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.body.innerText.includes('Sample Patient'), { timeout: 60000 });
    await page.waitForFunction(() => document.body.innerText.includes('B-TEST'), { timeout: 30000 });
    const output = path.resolve(__dirname, '../../output/language-check');
    fs.mkdirSync(output, { recursive: true });
    const text = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.join(output, baseline ? 'before.txt' : 'after.txt'), text);
    await page.screenshot({ path: path.join(output, baseline ? 'before.png' : 'after.png'), fullPage: true });
    if (baseline) {
      assert.match(text, /HITL/);
      assert.match(text, /FEFO/);
    } else {
      assert.match(text, /Pharmacist review/);
      assert.match(text, /05 Nov 2026, 02:30 pm/);
      assert.match(text, /30 Nov 2026/);
      assert.doesNotMatch(text, /\bHITL\b|\bFEFO\b|Agentic Pharmacy/);
      const clippedExpiry = await page.evaluate(() => [...document.querySelectorAll('p')].some(element =>
        element.textContent === '30 Nov 2026' && getComputedStyle(element).textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth));
      assert.equal(clippedExpiry, false, 'The full expiry date is readable');
    }
    await page.goto(`${base}/dashboard/pharmacy`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => /Open.*assistant/i.test(button.textContent)), { timeout: 30000 });
    if (baseline) {
      assert.match(await page.evaluate(() => document.body.innerText), /Agentic Pharmacy/);
    } else {
      const launcher = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find(button => /Open.*assistant/i.test(button.textContent)));
      assert(launcher.asElement(), 'Pharmacy assistant launcher is visible');
      await launcher.asElement().click();
      await page.waitForFunction(() => document.body.innerText.includes('New chat'), { timeout: 30000 });
      const assistantText = await page.evaluate(() => document.body.innerText);
      assert.match(assistantText, /Pharmacy AI assistant/);
      assert.doesNotMatch(assistantText, /Agentic Pharmacy|DB updates|Codex offline/);
      assert.doesNotMatch(await page.evaluate(() => [...document.querySelectorAll('textarea')].map(input => input.placeholder).join('\n')), /Codex/);
      await page.screenshot({ path: path.join(output, 'assistant.png'), fullPage: true });
      await page.setViewport({ width: 390, height: 844 });
      const mobileTitle = await page.evaluate(() => {
        const title = [...document.querySelectorAll('h3')].find(element => element.textContent === 'Pharmacy AI assistant');
        if (!title) return false;
        title.scrollIntoView({ block: 'start' });
        return title.clientWidth > 0 && title.scrollWidth <= title.clientWidth;
      });
      assert.equal(mobileTitle, true, 'The assistant title is readable on mobile');
      await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    }
    assert.deepEqual(errors, [], 'No page runtime errors');
    console.log(`${baseline ? 'Baseline' : 'Updated'} pharmacy wording and date checks passed.`);
  } finally {
    await page.close();
    if (process.env.CHROME_PATH) await browser.close();
    else browser.disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
