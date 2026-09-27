// Synthetic browser QA. All API requests are intercepted; no clinical data is saved.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const base = process.env.CR02_FRONTEND_URL || 'http://localhost:3027';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local frontend required');
const output = path.resolve(__dirname, '../../output/cr02-regimen');
const patient = { id: '00000000-0000-4000-8000-000000000001', name: 'CR02 SYNTHETIC PATIENT', branchId: 'test-branch', gender: 'FEMALE', dateOfBirth: '1990-01-01', phone: '' };
const doctor = { id: '00000000-0000-4000-8000-000000000002', firstName: 'Test', lastName: 'Doctor', role: 'DOCTOR', branchId: patient.branchId, isActive: true };
const visit = { id: '00000000-0000-4000-8000-000000000003', patientId: patient.id, doctorId: doctor.id, patient, doctor, history: {}, exam: {}, plan: {}, diagnosis: [] };
const medicines = [
  { id: 'fucibet', name: 'Fucibet cream', dosageForm: 'CREAM' },
  { id: 'second', name: 'Second cream', dosageForm: 'CREAM' },
  { id: 'unknown', name: 'Never prescribed cream', dosageForm: 'CREAM' },
];
const usual = { duration: 10, durationUnit: 'DAYS', dosePattern: '1-0-1', frequency: 'TWICE_DAILY', timing: 'AM/PM', instructions: 'on the rash' };
let sourceDiagnosis = 'Acne vulgaris';
let failSources = false;
const checks = [];
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-first-run'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1920, height: 1100 });
    await page.setCookie({ name: 'auth_token', value: 'synthetic-autopilot-fixture', url: base });
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (url.origin !== base) return request.abort();
      if (!url.pathname.startsWith('/api/')) return request.continue();
      const route = url.pathname.slice(4);
      let data = {};
      let status = 200;
      if (request.method() !== 'GET') { status = 409; data = { message: 'Synthetic QA never saves records' }; }
      else if (route === '/auth/me' || route === `/users/${doctor.id}`) data = doctor;
      else if (route === '/patients') data = { patients: [patient], total: 1 };
      else if (route === `/patients/${patient.id}`) data = patient;
      else if (route === '/users') data = { users: [doctor] };
      else if (route === `/visits/${visit.id}`) data = visit;
      else if (route.startsWith('/visits/patient/')) { data = { visits: [], pagination: { hasMore: false } }; if (failSources) status = 503; }
      else if (route.startsWith('/prescriptions/doctor/')) data = { prescriptions: [] };
      else if (route === '/prescriptions/templates') data = { templates: [] };
      else if (route === '/prescriptions/drugs/autocomplete') data = medicines.filter(m => m.name.toLowerCase().includes((url.searchParams.get('q') || '').toLowerCase()));
      else if (route.endsWith('/regimen-defaults')) data = route.includes('/unknown/') ? { values: {}, source: 'none' }
        : { values: { ...usual, duration: route.includes('/second/') ? 14 : 10 }, source: 'doctor' };
      else if (route === '/drugs') data = { data: medicines };
      else if (route.startsWith('/drugs/')) data = { inventoryItems: [{ currentStock: 20 }] };
      else if (route === '/billing/invoices') data = { invoices: [] };
      else if (route.endsWith('/next-appointment')) data = null;
      else data = [];
      await request.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const waitText = async text => {
      try { await page.waitForFunction(text => document.body.innerText.toLowerCase().includes(text.toLowerCase()), { timeout: 15000 }, text); }
      catch (error) { console.log('Expected', text, 'Page:', await page.evaluate(() => document.body.innerText)); throw error; }
    };
    const click = async text => {
      const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button,summary')].find(el => el.textContent.trim() === text && el.getAttribute('role') !== 'combobox' && el.getBoundingClientRect().height), text);
      assert(handle.asElement(), `Missing control: ${text}`);
      await handle.asElement().asLocator().click();
    };
    const diagnosis = async text => {
      const input = await page.$('input[placeholder="e.g., Acne vulgaris"]');
      assert(input, 'Diagnosis input');
      await input.focus();
      await input.evaluate(el => el.select());
      await page.keyboard.sendCharacter(text);
    };
    const check = label => { checks.push(label); console.log('PASS', label); };
    await page.goto(`${base}/dashboard/visits?visitId=${visit.id}`, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForSelector('[role="tab"]', { timeout: 60000 });
    await click('Prescription');
    await waitText('Diagnosis Autopilot');
    await click('Add Row');
    const select = async (index, query) => {
      const inputs = await page.$$('input[placeholder="Search medicine name..."]');
      await inputs[index].focus(); await inputs[index].evaluate(el => el.select()); await page.keyboard.sendCharacter(query);
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === 'Select' && el.getAttribute('role') !== 'combobox'), { timeout: 10000 });
      const received = page.waitForResponse(response => response.url().includes('/regimen-defaults'));
      await click('Select');
      await received;
      await page.waitForFunction(() => !document.body.innerText.includes('Loading usual values…'));
    };
    const durations = () => page.$$eval('input[placeholder="#"]', inputs => inputs.map(el => el.value));
    await select(0, 'Fucibet');
    assert.equal((await durations())[0], '10');
    assert.equal(await page.$$eval('button[aria-label^="Accept suggested"]', els => els.length), 4);
    check('Fucibet uses its 10-day usual regimen and shows four editable suggestions');
    await select(1, 'Second');
    assert.deepEqual((await durations()).slice(0, 2), ['10', '14']);
    check('Two medicines retain independent usual values');
    const durationInputs = await page.$$('input[placeholder="#"]');
    await durationInputs[2].focus(); await page.keyboard.sendCharacter('3');
    const row = await durationInputs[2].evaluateHandle(el => el.closest('tr'));
    const unit = await row.asElement().$('td:nth-child(4) [role="combobox"]');
    await unit.focus();
    await page.keyboard.press('Space');
    await page.waitForSelector('[role="option"]');
    const weekOption = await page.evaluateHandle(() => [...document.querySelectorAll('[role="option"]')].find(el => el.textContent.trim() === 'WEEKS'));
    await weekOption.asElement().click();
    await select(2, 'Fucibet');
    assert.equal((await durations())[2], '3');
    assert((await row.evaluate(el => el.innerText)).includes('WEEKS'));
    check('A typed 3-week duration survives medicine selection');
    await select(3, 'Never prescribed');
    assert.equal((await durations())[3], '');
    check('Never-prescribed medicine without defaults stays blank');
    const table = await page.evaluateHandle(() => document.querySelector('input[placeholder="Search medicine name..."]').closest('table'));
    await table.asElement().screenshot({ path: path.join(output, 'medicine-suggestions.png') });
    for (const width of [1500, 390]) {
      await page.setViewport({ width, height: 1100 });
      const durationWidths = await page.$$eval('input[placeholder="#"]', inputs => inputs.map(input => input.getBoundingClientRect().width));
      assert(durationWidths.every(value => value >= 80), `Readable duration at ${width}px`);
      await table.asElement().screenshot({ path: path.join(output, `medicine-suggestions-${width}.png`) });
    }
    check('Duration controls retain readable widths in desktop and mobile scroll containers');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks, errors }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
