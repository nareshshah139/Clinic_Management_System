// Local-only CR-09 browser regression. All patient, medicine and invoice data is synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer-core');
const output = path.resolve(__dirname, '../../output/cr09-pharmacy-billing');
fs.mkdirSync(output, { recursive: true });
const base = 'http://127.0.0.1:3029';
const names = ['Itin 12 tablet', 'Nixiper 1 Creme Rinse Shampoo 150 Gm', 'Fucibet cream', 'Bilashine 40mg Tablet'];
const quantities = [14, 5, 20, 5];
const user = { id: 'doctor-fixture', firstName: 'Test', lastName: 'Doctor', role: 'OWNER', branchId: 'synthetic', isActive: true };
const patients = ['Trina Ganguly', 'Synthetic No Match', 'Synthetic Load Error', ...Array.from({ length: 7 }, (_, i) => `Synthetic Queue ${i}`)].map((name, i) => ({ id: `patient-${i}`, name, phone: '9000000000' }));
const drugs = names.map((name, i) => ({ id: `drug-${i}`, name, price: 100, gstRate: 5, manufacturerName: 'Fixture', packSizeLabel: '1', totalStock: i === 0 ? 0 : 100 }));
const lines = i => i === 0 ? names.map((drugName, j) => ({ drugName, quantity: quantities[j] })) : [{ drugName: 'Unmatched cream', quantity: 2 }];
const queue = patients.map((patient, i) => ({ prescriptionId: `rx-${i}`, patient, doctor: { id: user.id, name: 'Test Doctor' }, createdAt: new Date().toISOString(), pendingHours: 22, isOverTwoHours: true, medications: lines(i).map(line => ({ ...line, prescribedQuantity: line.quantity, dispensedQuantity: 0, coverageStatus: 'not_started' })), linkedInvoiceIds: [], status: 'pending' }));
const requests = [], consoleErrors = [], checks = [];
let invoice, failPrescription = true, replenished = false;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4029');
  const p = url.pathname;
  let status = 200, body = {};
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const payload = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
  if (p === '/auth/me' || p === `/users/${user.id}`) body = user;
  else if (p === '/users') body = { users: [user] };
  else if (p === '/patients') body = { data: patients, patients, total: patients.length };
  else if (p.startsWith('/patients/')) body = patients.find(patient => p === `/patients/${patient.id}`) || {};
  else if (p === '/pharmacy/prescription-queue') {
    const data = queue.filter(entry => invoice?.status !== 'CONFIRMED' || entry.prescriptionId !== invoice.prescriptionId);
    body = { data, pagination: { page: 1, limit: 20, total: data.length, pages: 1 } };
  } else if (p.endsWith('/stock-check')) {
    const index = Number(p.split('/')[3].slice(3));
    body = { items: lines(index).map((line, i) => ({ drugName: line.drugName, matchedDrug: index === 0 ? drugs[i] : null, stockStatus: index !== 0 ? 'UNMATCHED' : i === 0 && !replenished ? 'OUT_OF_STOCK' : 'IN_STOCK', totalNonExpiredStock: index === 0 && (i !== 0 || replenished) ? 100 : 0, lowStock: false, nearExpiry: false, alternatives: [] })) };
  } else if (p.startsWith('/prescriptions/rx-')) {
    const index = Number(p.split('rx-')[1]);
    if (index === 2 && failPrescription) { status = 503; body = { message: 'Synthetic prescription service unavailable' }; }
    else body = { id: `rx-${index}`, visit: { patient: patients[index], doctor: user }, items: lines(index) };
  } else if (p === '/drugs') body = { data: url.searchParams.has('search') ? drugs.filter(d => d.name === url.searchParams.get('search')) : drugs };
  else if (p === '/drugs/autocomplete') body = drugs;
  else if (p.startsWith('/drugs/')) body = drugs.find(d => p === `/drugs/${d.id}`) || {};
  else if (p === '/pharmacy/packages') body = { packages: [] };
  else if (p === '/pharmacy/invoices' && req.method === 'POST') { invoice = { ...payload, id: 'invoice-fixture', invoiceNumber: 'PH-FIXTURE', status: 'DRAFT' }; body = invoice; }
  else if (p === '/pharmacy/invoices/invoice-fixture/status') { invoice.status = payload.status; body = invoice; }
  else if (p.startsWith('/pharmacy/invoices/invoice-fixture')) body = invoice;
  else if (p === '/fixture/recover') { failPrescription = false; }
  requests.push({ method: req.method, path: p, status });
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
});

(async () => {
  await new Promise(resolve => server.listen(4029, '127.0.0.1', resolve));
  const browser = process.env.OBSCURA === '1'
    ? await puppeteer.connect({ browserURL: 'http://127.0.0.1:9239' })
    : await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  try {
    await page.setViewport({ width: 1500, height: 1000 });
    await page.setCookie({ name: 'auth_token', value: 'synthetic-only', url: base });
    await page.goto(`${base}/dashboard/pharmacy?section=billing`, { waitUntil: 'networkidle2', timeout: 60000 });
    const click = async text => {
      const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text), text);
      assert(handle.asElement(), `Missing button ${text}`); await handle.asElement().click();
    };
    const load = async name => {
      await page.waitForFunction(name => [...document.querySelectorAll('tr')].some(row => row.textContent.includes(name)), {}, name);
      const button = await page.evaluateHandle(name => [...(document.querySelectorAll('tr'))].find(row => row.textContent.includes(name)) && [...[...document.querySelectorAll('tr')].find(row => row.textContent.includes(name)).querySelectorAll('button')].find(button => button.textContent.trim() === 'Load'), name);
      await button.asElement().click();
    };
    await load(patients[0].name);
    await page.waitForFunction(() => document.querySelectorAll('h4').length >= 4);
    if (!process.env.BASELINE) await page.waitForFunction(() => {
      const region = document.querySelector('[aria-label="Prescription bill"]');
      return region && region.getBoundingClientRect().top >= 0 && region.getBoundingClientRect().top < 100;
    });
    const baseline = await page.evaluate(() => {
      const heading = [...document.querySelectorAll('[data-slot="card-title"]')].find(e => e.textContent.includes('New Pharmacy Invoice'));
      const bounds = heading?.getBoundingClientRect();
      return { invoiceHeadingTop: bounds?.top, viewportHeight: innerHeight, items: [...document.querySelectorAll('h4')].map(e => e.textContent), flaggedOutOfStock: document.body.innerText.includes('Out of stock') };
    });
    fs.writeFileSync(path.join(output, process.env.BASELINE ? 'baseline.json' : 'loaded.json'), JSON.stringify(baseline, null, 2));
    await page.screenshot({ path: path.join(output, process.env.BASELINE ? 'baseline.png' : 'loaded.png') });
    if (process.env.BASELINE) { console.log(JSON.stringify(baseline)); return; }
    assert(baseline.invoiceHeadingTop >= 0 && baseline.invoiceHeadingTop < baseline.viewportHeight, 'Invoice must be brought into view');
    for (const name of names) assert(baseline.items.includes(name));
    assert(baseline.flaggedOutOfStock); checks.push('Trina: four medicines loaded; invoice visible; unavailable stock flagged');
    await load(patients[1].name);
    await page.waitForFunction(() => [...document.querySelectorAll('h4')].some(e => e.textContent === 'Unmatched cream'));
    assert.equal(await page.$$eval('[data-invoice-item]', els => els.length), 1);
    assert(await page.$eval('[data-invoice-item]', el => el.textContent.includes('No match')));
    await page.screenshot({ path: path.join(output, 'unmatched.png') });
    checks.push('Second patient: unmatched medicine retained and flagged; previous patient medicines cleared');
    await load(patients[2].name);
    await page.waitForSelector('[role="alert"]');
    assert(await page.$eval('[role="alert"]', el => el.textContent.includes('Synthetic prescription service unavailable')));
    failPrescription = false;
    await click('Retry loading prescription');
    await page.waitForFunction(() => [...document.querySelectorAll('h4')].some(e => e.textContent === 'Unmatched cream'));
    checks.push('Third patient: server failure shown in bill; retry succeeds');
    // Save only after the synthetic fixture has available stock for every medicine.
    replenished = true;
    await load(patients[0].name);
    await page.waitForFunction(() => document.querySelectorAll('[data-invoice-item]').length === 4);
    await click('Print Preview');
    await page.waitForSelector('[role="dialog"]');
    await click('Confirm Invoice');
    await page.waitForFunction(() => ![...document.querySelectorAll('tr')].some(row => row.textContent.includes('Trina Ganguly')));
    assert.equal(invoice.prescriptionId, 'rx-0');
    assert.deepEqual(invoice.items.map(item => item.quantity), quantities);
    assert.deepEqual(invoice.items.map(item => item.drugId), drugs.map(d => d.id));
    checks.push('Confirmed invoice retains prescription, patient, medicine IDs and quantities; Pending refresh removes Trina');
    console.log(JSON.stringify({ checks, consoleErrors }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(output, 'failure.txt'), await page.$eval('body', el => el.innerText).catch(() => 'Page unavailable'));
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, process.env.BASELINE ? 'baseline-logs.json' : 'checks.json'), JSON.stringify({ checks, consoleErrors, requests, note: 'Real local frontend; synthetic HTTP API. Backend service behavior is verified separately by Jest.' }, null, 2));
    await page.close();
    if (process.env.OBSCURA === '1') await browser.disconnect(); else await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
