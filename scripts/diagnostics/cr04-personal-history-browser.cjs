const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
// Run against a local frontend with every API request replaced by synthetic fixtures.
const output = path.resolve(__dirname, '../../output/cr04-personal-history');
fs.mkdirSync(output, { recursive: true });
const patient = { id: '00000000-0000-4000-8000-000000000001', name: 'SYNTHETIC CR04 PATIENT', gender: 'FEMALE', age: 36, phone: '', branchId: 'synthetic' };
const doctor = { id: '00000000-0000-4000-8000-000000000002', firstName: 'Test', lastName: 'Doctor', role: 'DOCTOR', branchId: 'synthetic', isActive: true };
const id = '00000000-0000-4000-8000-000000000003';
const visit = { id, patientId: patient.id, doctorId: doctor.id, patient, doctor, complaints: [], history: {}, exam: {}, plan: {}, diagnosis: [], createdAt: new Date().toISOString() };
const value = 'Diet: vegetarian. Sleep: 6 hours.\nOccupation: teacher. Habits: no tobacco. Products: sunscreen daily.';
const checks = [];
const report = message => { checks.push(message); console.log(new Date().toISOString(), message); };
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1100 });
  await page.setCookie({ name: 'auth_token', value: 'synthetic-browser-fixture', url: 'http://localhost:3000' });
  const errors = [];
  page.on('dialog', dialog => dialog.accept());
  page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return request.continue();
    const p = url.pathname.slice(4);
    let body = {};
    if (p === '/auth/me' || p === `/users/${doctor.id}`) body = doctor;
    else if (p === '/users') body = { users: [doctor] };
    else if (p === '/patients') body = { patients: [patient], total: 1 };
    else if (p === `/patients/${patient.id}`) body = patient;
    else if (p === `/visits/${id}`) {
      if (request.method() === 'PATCH') {
        const patch = JSON.parse(request.postData());
        Object.assign(visit, { ...patch, history: { ...visit.history, ...patch.history }, plan: { ...visit.plan, ...patch.treatmentPlan }, exam: { ...visit.exam, ...patch.examination } });
      }
      body = visit;
    } else if (p.endsWith('/personal-history')) body = { personalHistory: visit.history.personalHistory ?? null };
    else if (p.startsWith('/visits/patient/')) body = { visits: [visit], pagination: { hasMore: false } };
    else if (p.endsWith('/next-appointment')) body = null;
    else if (p === '/prescriptions/templates') body = { templates: [] };
    else if (p.startsWith('/prescriptions/doctor/')) body = { prescriptions: [] };
    else if (p === '/billing/invoices') body = { invoices: [] };
    else if (p === '/drugs') body = { drugs: [] };
    else body = [];
    await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const button = async text => {
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(e => e.textContent.trim() === text && e.getBoundingClientRect().height), text);
    assert(handle.asElement(), `Button missing: ${text}`);
    await handle.asElement().asLocator().click();
  };
  const preview = async () => {
    await button('Print Preview');
    await page.waitForSelector('#pagedjs-container .pagedjs_page', { timeout: 30000 });
  };
  const personalField = async () => {
    await page.waitForSelector('#personal-history');
    const tab = await page.evaluateHandle(() => [...document.querySelectorAll('[role="tab"]')].find(e => e.textContent.trim() === 'Prescription'));
    await tab.asElement().click();
    await page.waitForSelector('#personal-history', { visible: true });
  };
  try {
    await page.goto(`http://localhost:3000/dashboard/visits?visitId=${id}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await personalField();
    await page.type('#personal-history', value);
    await page.$eval('#personal-history', el => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(output, 'editor.png') });
    await button('Save Draft');
    await page.waitForFunction(() => document.body.innerText.includes('Saved'));
    assert.equal(visit.history.personalHistory, value);
    report('Personal history entered and included in Save Draft payload');
    await preview();
    await page.waitForFunction(() => document.querySelector('#pagedjs-container [data-personal-history]')?.textContent.includes('sunscreen daily.'));
    const standard = await page.$eval('#pagedjs-container [data-personal-history]', el => {
      const [label, text] = el.firstElementChild.children;
      return { label: label.textContent, labelY: label.getBoundingClientRect().top, textY: text.getBoundingClientRect().top };
    });
    assert.equal(standard.label, 'Personal history');
    assert(standard.textY > standard.labelY);
    await page.screenshot({ path: path.join(output, 'standard-preview.png') });
    report('Standard print preview has a separate Personal history heading');
    const checkbox = await page.evaluateHandle(() => [...document.querySelectorAll('label')].find(el => el.textContent.trim() === 'Space-optimized layout')?.querySelector('input'));
    await checkbox.asElement().asLocator().click();
    await page.waitForFunction(() => document.querySelector('#pagedjs-container [data-personal-history]')?.firstElementChild.classList.contains('flex'));
    const inline = await page.$eval('#pagedjs-container [data-personal-history]', el => {
      const [label, text] = el.firstElementChild.children;
      return { labelY: label.getBoundingClientRect().top, textY: text.getBoundingClientRect().top };
    });
    assert(Math.abs(inline.labelY - inline.textY) < 2);
    await page.screenshot({ path: path.join(output, 'optimized-preview.png') });
    report('Space-optimized preview places heading and text on the same line');
    report('Closing preview');
    await button('Close');
    report('Opening new visit');
    await page.goto(`http://localhost:3000/dashboard/visits?patientId=${patient.id}&doctorId=${doctor.id}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await personalField();
    await page.waitForFunction(value => document.querySelector('#personal-history')?.value === value, {}, value);
    report('New visit editor loads saved patient personal history');
    await page.$eval('#personal-history', el => el.select());
    await page.keyboard.press('Backspace');
    await preview();
    assert.equal(await page.$('#pagedjs-container [data-personal-history]'), null);
    assert.equal(await page.$eval('#pagedjs-container', el => el.textContent.includes('Personal history')), false);
    await page.screenshot({ path: path.join(output, 'blank-preview.png') });
    report('Blank personal history produces no print heading');
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks, errors, note: 'Actual local frontend and Chromium pagination; isolated synthetic API responses. Persistence and carry-forward service separately covered by Jest.' }, null, 2));
    console.log(JSON.stringify({ checks, errors }, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') });
    fs.writeFileSync(path.join(output, 'failure.txt'), await page.$eval('body', el => el.innerText));
    throw error;
  } finally { await page.close({ runBeforeUnload: false }); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
