const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const puppeteer = require('puppeteer-core');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'output/inventory-visits-repair');
const session = JSON.parse(fs.readFileSync(path.join(output, 'local-session.json')));
assert(session.syntheticOnly && session.ready && !session.stopped);
assert.equal(session.frontend, 'http://localhost:3002');
assert.match(session.databaseUrl, /^postgresql:\/\/nshah@127\.0\.0\.1:55457\/pstack_acceptance_[a-f0-9]{32}$/);
const db = new PrismaClient({ datasourceUrl: session.databaseUrl });
const f = session.fixture;
const report = { checkedAt: new Date().toISOString(), syntheticOnly: true, normalAuthentication: true, build: session.build, checks: [] };
let browser, context;
const clickText = async (page, text) => {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(element => element.offsetWidth && element.textContent.trim() === text && !element.disabled), {}, text);
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(element => element.offsetWidth && element.textContent.trim() === text && !element.disabled), text);
  await handle.asElement().focus();
  await page.keyboard.press('Enter');
};
/**
 * @cc [owner:nareshshah139,label:verification] real-checkout-recovery
 * The browser sends checkout to the real isolated backend before a response is dropped. Reload
 * and retry must reuse that committed invoice; starting a new invoice must clear its patient/Rx.
 */
async function main() {
  const login = await fetch(session.frontend + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: f.users.doctor.email, password: f.password }) });
  assert.equal(login.status, 201);
  const token = (await login.json()).access_token;
  const readRx = await fetch(session.frontend + '/api/prescriptions?visitId=' + f.visitId, { headers: { Authorization: 'Bearer ' + token } });
  let rx = (await readRx.json()).prescriptions[0];
  if (!rx) {
    const created = await fetch(session.frontend + '/api/prescriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ visitId: f.visitId, patientId: f.patientId, doctorId: f.users.doctor.id, items: [{ drugName: 'Synthetic audit cream', drugId: f.drugId, inventoryItemId: f.inventoryItemId, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 2, durationUnit: 'DAYS', quantity: 2 }] }) });
    assert.equal(created.status, 201);
    rx = await created.json();
  }
  const second = await db.patient.create({ data: { name: 'Synthetic second billing patient ' + randomUUID().slice(0, 8), gender: 'FEMALE', phone: '0000000002', branchId: f.branchId } });
  const before = await db.inventoryItem.findUniqueOrThrow({ where: { id: f.inventoryItemId } });
  browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9318', defaultViewport: null });
  context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1500, height: 1100 });
  await page.goto(session.frontend + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-identifier');
  await page.type('#login-identifier', f.users.pharmacist.email);
  await page.type('#login-password', f.password);
  await page.click('button[type=submit]');
  await page.waitForFunction(() => !location.pathname.includes('login'));
  await page.goto(session.frontend + '/dashboard/pharmacy?tab=billing&patientId=' + f.patientId + '&prescriptionId=' + rx.id + '&doctorId=' + f.users.doctor.id, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('tr')].some(row => row.innerText.includes('Synthetic audit cream') && row.querySelector('input[type=number]')));
  const cdp = await page.createCDPSession();
  let dropped = false, firstPayload;
  cdp.on('Fetch.requestPaused', async event => {
    if (!dropped && event.responseStatusCode === 201) {
      dropped = true;
      firstPayload = JSON.parse(event.request.postData);
      await cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'ConnectionClosed' });
    } else await cdp.send('Fetch.continueRequest', { requestId: event.requestId });
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/pharmacy/invoices/checkout', requestStage: 'Response' }] });
  await clickText(page, 'Print Preview');
  await clickText(page, 'Confirm Invoice');
  await page.waitForFunction(() => document.body.innerText.includes('Error Confirming Invoice'));
  assert(dropped);
  assert.equal(firstPayload.prescriptionId, rx.id);
  const committed = await db.pharmacyInvoice.findFirstOrThrow({ where: { branchId: f.branchId, checkoutRequestKey: firstPayload.requestKey } });
  assert.equal(committed.status, 'CONFIRMED');
  await cdp.send('Fetch.disable');
  await page.reload({ waitUntil: 'domcontentloaded' });
  const retryResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/pharmacy/invoices/checkout'));
  await clickText(page, 'Retry pending checkout');
  const response = await retryResponse;
  assert.equal(response.status(), 201);
  assert.equal((await response.json()).id, committed.id);
  assert.equal(JSON.parse(response.request().postData()).requestKey, firstPayload.requestKey);
  assert.equal(await db.pharmacyInvoice.count({ where: { branchId: f.branchId, checkoutRequestKey: firstPayload.requestKey } }), 1);
  const once = await db.inventoryItem.findUniqueOrThrow({ where: { id: f.inventoryItemId } });
  assert.equal(once.currentStock, before.currentStock - 2);
  assert.equal(once.heldStock, before.heldStock);
  report.checks.push('Lost committed checkout response survives reload and retries one invoice/stock deduction');
  await page.keyboard.press('Escape');
  await clickText(page, 'Start a new invoice');
  assert.equal(await page.$eval('#patient', element => element.value), '');
  assert(!new URL(page.url()).searchParams.has('prescriptionId'));
  await page.type('#patient', second.name);
  await page.waitForFunction(name => [...document.querySelectorAll('div.font-medium')].some(element => element.textContent === name), {}, second.name);
  const patientOption = await page.evaluateHandle(name => [...document.querySelectorAll('div.font-medium')].find(element => element.textContent === name), second.name);
  await patientOption.asElement().click();
  await page.type('#drugSearch', 'Synthetic audit cream');
  await page.waitForFunction(() => [...document.querySelectorAll('[role=button]')].some(element => element.innerText.includes('Synthetic audit cream')));
  const drug = await page.evaluateHandle(() => [...document.querySelectorAll('[role=button]')].find(element => element.innerText.includes('Synthetic audit cream')));
  await drug.asElement().focus();
  await page.keyboard.press('Enter');
  await clickText(page, 'Print Preview');
  const nextResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/pharmacy/invoices/checkout'));
  await clickText(page, 'Confirm Invoice');
  const next = await nextResponse;
  assert.equal(next.status(), 201);
  const nextPayload = JSON.parse(next.request().postData());
  assert.equal(nextPayload.patientId, second.id);
  assert(!nextPayload.prescriptionId);
  assert.notEqual((await next.json()).id, committed.id);
  await page.screenshot({ path: path.join(output, 'billing-new-patient-confirmed.png'), fullPage: false });
  report.checks.push('Start a new invoice clears prescription context and successfully bills another patient');
  report.outcome = 'VERIFIED';
}
main().catch(error => { report.outcome = 'NOT VERIFIED'; report.error = error.message; process.exitCode = 1; }).finally(async () => { await context?.close().catch(() => {}); await browser?.disconnect(); await db.$disconnect(); fs.writeFileSync(path.join(output, 'billing-browser-acceptance.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); });
