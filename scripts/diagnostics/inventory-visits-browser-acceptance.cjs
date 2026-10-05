const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'output/inventory-visits-repair');
const session = JSON.parse(fs.readFileSync(path.join(output, 'local-session.json'), 'utf8'));
assert(session.syntheticOnly && session.ready && !session.stopped);
assert.equal(session.frontend, 'http://localhost:3002');
const fixture = session.fixture;
const report = { checkedAt: new Date().toISOString(), browser: 'Isolated Chrome after Obscura interaction failure', normalAuthentication: true, syntheticOnly: true, build: session.build, checks: [] };
let browser;
const contexts = [];
const openVisit = async () => {
  const context = await browser.createBrowserContext();
  contexts.push(context);
  const page = await context.newPage();
  await page.setViewport({ width: 1500, height: 1100 });
  await page.goto(session.frontend + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login-identifier');
  await page.type('#login-identifier', fixture.users.doctor.email);
  await page.type('#login-password', fixture.password);
  await page.click('button[type=submit]');
  await page.waitForFunction(() => !location.pathname.includes('login'));
  await page.goto(session.frontend + '/dashboard/visits?visitId=' + fixture.visitId, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="bpm"]');
  await page.focus('button[id$="trigger-vitals"]');
  await page.keyboard.press('Enter');
  return page;
};
/**
 * @cc [owner:nareshshah139,label:safety] real-browser-local-clears
 * Browser acceptance uses real login and controls on the synthetic localhost app; persisted
 * clearing is checked through a fresh browser context and the backend response, without mocks.
 */
async function main() {
  const login = await fetch(session.frontend + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: fixture.users.doctor.email, password: fixture.password }) });
  assert.equal(login.status, 201);
  const token = (await login.json()).access_token;
  const read = async () => {
    const response = await fetch(session.frontend + '/api/visits/' + fixture.visitId, { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(response.status, 200);
    return response.json();
  };
  const before = await read();
  const seed = await fetch(session.frontend + '/api/visits/' + fixture.visitId, { method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ version: before.version, vitals: { heartRate: 80 } }) });
  assert.equal(seed.status, 200);
  browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9318', defaultViewport: null });
  const page = await openVisit();
  await page.waitForFunction(() => document.querySelector('input[placeholder="bpm"]').value === '80');
  await page.focus('input[placeholder="bpm"]');
  await page.keyboard.press('Home');
  await page.keyboard.down('Shift');
  await page.keyboard.press('End');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Backspace');
  assert.equal(await page.$eval('input[placeholder="bpm"]', element => element.value), '');
  const savedResponse = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith('/visits/' + fixture.visitId));
  const button = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === 'Save Draft'));
  await button.asElement().focus();
  await page.keyboard.press('Enter');
  const response = await savedResponse;
  assert.equal(response.status(), 200);
  const payload = JSON.parse(response.request().postData());
  assert.equal(payload.vitals.heartRate, null);
  const persisted = await read();
  assert(persisted.vitals.heartRate == null);
  assert.equal(persisted.vitals.weight, 60);
  report.checks.push({ name: 'Clear heart rate with actual input and Save Draft sends null and preserves weight', outcome: 'VERIFIED' });
  await page.close();
  const reopened = await openVisit();
  assert.equal(await reopened.$eval('input[placeholder="bpm"]', element => element.value), '');
  assert.equal(await reopened.$eval('input[placeholder="kg"]', element => element.value), '60');
  const idleMutations = [];
  reopened.on('request', request => { if (['POST', 'PATCH', 'DELETE'].includes(request.method()) && request.url().includes('/visits/' + fixture.visitId)) idleMutations.push(request.method()); });
  const idleBefore = await read();
  await new Promise(resolve => setTimeout(resolve, 10000));
  const idleAfter = await read();
  assert.deepEqual(idleMutations, []);
  assert.equal(idleAfter.version, idleBefore.version);
  assert.equal(idleAfter.updatedAt, idleBefore.updatedAt);
  await reopened.screenshot({ path: path.join(output, 'visit-clear-reopened.png'), fullPage: false });
  report.checks.push({ name: 'Fresh authenticated browser context reopens cleared value and performs no idle save', outcome: 'VERIFIED' });
  report.outcome = 'VERIFIED';
}
main().catch(error => { report.outcome = 'NOT VERIFIED'; report.error = error.message; process.exitCode = 1; }).finally(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  if (browser) await browser.disconnect();
  fs.writeFileSync(path.join(output, 'browser-acceptance.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
