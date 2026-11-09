const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const base = process.env.CLINIC_URL || 'http://127.0.0.1:3107';
const browserPath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const patient = { id: '00000000-0000-4000-8000-000000000001', firstName: 'Alexandra', lastName: 'Montgomery-Synthetic', name: 'Alexandra Montgomery-Synthetic', gender: 'FEMALE', age: 36, phone: '1234567890', branchId: 'fixture' };
const doctor = { id: '00000000-0000-4000-8000-000000000002', firstName: 'Test', lastName: 'Doctor', role: 'DOCTOR', branchId: 'fixture', isActive: true };
const visit = { id: '00000000-0000-4000-8000-000000000003', patientId: patient.id, doctorId: doctor.id, patient, doctor, complaints: [], history: {}, exam: {}, plan: {}, diagnosis: [], createdAt: '2026-11-08T09:00:00Z' };
const appointment = (id, name, slot, status) => ({ id, slot, status, patient: { name }, visitType: 'OPD' });
let appointments = [appointment('a2', 'Second Patient', '10:30-11:00', 'CHECKED_IN'), appointment('a1', 'First Patient', '09:00-09:30', 'SCHEDULED'), appointment('a3', 'Finished Patient', '11:00-11:30', 'COMPLETED'), appointment('a4', 'Cancelled Patient', '11:30-12:00', 'CANCELLED')];

async function setup(page, role = 'DOCTOR') {
  await page.setCookie({ name: 'auth_token', value: 'synthetic-fixture', url: base });
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return request.continue();
    let body = [];
    if (path === '/api/auth/me' || path === `/api/users/${doctor.id}`) body = { ...doctor, role };
    else if (path === '/api/users') body = { users: [doctor] };
    else if (path === '/api/patients') body = { patients: [patient], total: 1 };
    else if (path === `/api/patients/${patient.id}`) body = patient;
    else if (path === `/api/visits/${visit.id}`) body = visit;
    else if (path.includes('/schedule')) body = { appointments };
    else if (path.includes('/visits/patient/')) body = { visits: [visit], pagination: { hasMore: false } };
    else if (path.endsWith('/personal-history')) body = { personalHistory: null };
    else if (path.endsWith('/next-appointment')) body = null;
    else if (path === '/api/prescriptions/templates') body = { templates: [] };
    await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--no-first-run'] });
  try {
    const page = await browser.newPage();
    await setup(page);
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(`${base}/dashboard/patients`, { waitUntil: 'networkidle2', timeout: 90000 });
      await page.waitForSelector('[data-tour="patients-table"]');
      const dimensions = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth, title: document.title }));
      assert.equal(dimensions.page, dimensions.viewport, `patient page overflows at ${width}px`);
      assert.match(dimensions.title, /Patients/);
      console.log(`PASS patients ${width}px fits viewport; title ${dimensions.title}`);
    }
    await page.setViewport({ width: 1440, height: 900 });
    await page.focus('th button'); await page.keyboard.press('Enter');
    assert.equal(await page.$eval('th[aria-sort="descending"]', e => e.textContent.trim().startsWith('Patient')), true);
    console.log('PASS patient sort works with keyboard');
    await page.focus('[aria-label^="More actions for"]'); await page.keyboard.press('Enter');
    await page.waitForSelector('[role="menu"]');
    assert.match(await page.$eval('[role="menu"]', e => e.innerText), /Edit/);
    await page.keyboard.press('Escape');
    console.log('PASS patient action menu opens and closes by keyboard');
    await page.goto(`${base}/dashboard/appointments`, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForSelector('[data-appointment-block]', { timeout: 30000 });
    const blocks = await page.$$eval('[data-appointment-block]', els => els.map(e => e.innerText));
    const blockText = blocks.join('\n');
    assert(blockText.includes('First Patient') && blockText.includes('Second Patient'));
    assert(!blockText.includes('Cancelled Patient'));
    assert(await page.$('[data-appointment-block] button[aria-label*="First Patient"]'));
    console.log('PASS calendar blocks show active patients and exclude cancelled');
    assert.match(await page.title(), /Appointments/);
    await page.locator('[data-appointment-block] button[aria-label*="First Patient"]').click();
    await page.waitForSelector('[role="dialog"]');
    assert.match(await page.$eval('[role="dialog"]', e => e.innerText), /First Patient/);
    await page.keyboard.press('Escape');
    console.log('PASS calendar block opens details for the selected patient');
    appointments = [];
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.querySelector('[data-appointment-block]') === null && !document.body.innerText.includes('Loading schedule'));
    console.log('PASS calendar shows no appointment blocks when none are scheduled');
    await page.goto(`${base}/dashboard/visits?visitId=${visit.id}`, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForFunction(() => document.body.innerText.includes('Complete Visit'), { timeout: 30000 });
    const help = await page.$eval('#visit-completion-help', e => e.innerText);
    for (const section of ['vitals', 'photos', 'labs', 'prescription']) assert(help.includes(section));
    assert(help.includes('does not verify clinical completeness'));
    console.log('PASS visit explains incomplete section markers and clinical-validation limit');
    const visitOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(visitOverflow, false, 'visit page overflows at 1440px');
    await page.screenshot({ path: '/private/tmp/clinic-visit-after.png' });
    await page.locator('[data-tour="help-button"]').click();
    await page.waitForSelector('.introjs-nextbutton');
    await page.focus('.introjs-nextbutton'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('.introjs-tooltip')?.innerText.includes('2 of '), { timeout: 10000 });
    console.log('PASS doctor tour advances with keyboard');
    const reception = await browser.newPage(); await setup(reception, 'RECEPTION');
    await reception.setViewport({ width: 1440, height: 900 });
    await reception.goto(`${base}/dashboard/patients`, { waitUntil: 'networkidle2', timeout: 90000 });
    await reception.locator('[data-tour="help-button"]').click();
    await reception.waitForSelector('.introjs-nextbutton');
    await reception.locator('.introjs-nextbutton').click();
    await reception.waitForFunction(() => document.querySelector('.introjs-tooltip')?.textContent.includes('Add New Patient'), { timeout: 10000 });
    console.log('PASS receptionist tour advances with pointer');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
