const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const base = process.env.CLINIC_URL || 'http://127.0.0.1:3107';
const browserPath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const patient = { id: '00000000-0000-4000-8000-000000000001', firstName: 'Alexandra', lastName: 'Montgomery-Synthetic', name: 'Alexandra Montgomery-Synthetic', gender: 'FEMALE', age: 36, phone: '1234567890', branchId: 'fixture' };
const doctor = { id: '00000000-0000-4000-8000-000000000002', firstName: 'Test', lastName: 'Doctor', role: 'DOCTOR', branchId: 'fixture', isActive: true };
const visit = { id: '00000000-0000-4000-8000-000000000003', patientId: patient.id, doctorId: doctor.id, patient, doctor, complaints: [], history: {}, exam: {}, plan: {}, diagnosis: [], createdAt: '2026-11-08T09:00:00Z' };
const appointment = (id, name, slot, status, calendar) => ({ id, slot, status, calendar, patient: { name }, visitType: 'OPD' });
let appointments = [appointment('a2', 'Second Patient', '10:30-11:00', 'CHECKED_IN', 'CONFIRMED'), appointment('a1', 'First Patient', '09:00-09:30', 'SCHEDULED', 'SCHEDULED'), appointment('a3', 'Finished Patient', '11:00-11:30', 'COMPLETED', 'CONFIRMED'), appointment('a4', 'Cancelled Patient', '11:30-12:00', 'CANCELLED', 'CONFIRMED')];

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
    await page.waitForSelector('[aria-label^="First Patient, "]', { timeout: 30000 });
    const column = calendar => page.$eval(`section[data-calendar="${calendar}"]`, e => e.textContent);
    const scheduled = await column('SCHEDULED');
    const confirmed = await column('CONFIRMED');
    assert(scheduled.includes('First Patient') && !scheduled.includes('Second Patient'));
    assert(confirmed.includes('Second Patient') && confirmed.includes('Finished Patient') && !confirmed.includes('First Patient'));
    assert(!scheduled.includes('Cancelled Patient') && !confirmed.includes('Cancelled Patient'));
    console.log('PASS each appointment sits in the column its calendar names and cancelled appointments are hidden');
    assert.match(await page.title(), /Appointments/);
    for (const width of [1440, 375]) {
      await page.setViewport({ width, height: 900 });
      const fits = await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth);
      assert(fits, `appointments page overflows at ${width}px`);
      console.log(`PASS appointments ${width}px fits viewport`);
    }
    await page.setViewport({ width: 1440, height: 900 });
    await page.focus('[aria-label^="First Patient, "]'); await page.keyboard.press('Enter');
    await page.waitForSelector('[role="dialog"]');
    const details = await page.$eval('[role="dialog"]', e => e.innerText);
    assert.match(details, /First Patient/);
    assert.match(details, /Confirm/);
    await page.keyboard.press('Escape');
    console.log('PASS calendar tile opens details with Confirm by keyboard');
    appointments = [];
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.querySelector('section[data-calendar="SCHEDULED"]')?.textContent.includes('No one left to confirm'));
    console.log('PASS empty Scheduled calendar says no one is left to confirm');
    await page.goto(`${base}/dashboard/visits?visitId=${visit.id}`, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForFunction(() => document.body.innerText.includes('Complete visit'), { timeout: 30000 });
    const help = await page.$eval('#visit-completion-help', e => e.innerText);
    for (const section of ['complaint or diagnosis', 'prescription']) assert(help.includes(section));
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
