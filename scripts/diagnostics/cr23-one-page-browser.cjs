const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const output = path.resolve(process.env.CR23_OUTPUT || path.join(require('node:os').tmpdir(), 'cr23-one-page'));
const baseUrl = process.env.CR23_BASE_URL || 'http://localhost:3000';
const patient = { id: '00000000-0000-4000-8000-000000000011', name: 'SYNTHETIC CR23 PATIENT', gender: 'MALE', age: 29, branchId: 'synthetic' };
const doctor = { id: '00000000-0000-4000-8000-000000000012', firstName: 'Test', lastName: 'Doctor', role: 'DOCTOR', branchId: 'synthetic', isActive: true };
const visitId = '00000000-0000-4000-8000-000000000013';
const reviewDate = '2026-11-28';

const medicine = (drugName, frequency, duration, timing, instructions) => ({ drugName, dosage: 1, dosageUnit: 'TABLET', frequency, duration, durationUnit: 'DAYS', timing, instructions });
const draft = {
  dosageSchemaVersion: 1,
  chiefComplaints: 'Itchy scaly patches on scalp and elbows for 3 months',
  diagnosis: 'Plaque psoriasis with seborrhoeic dermatitis of scalp',
  pastHistory: 'Hypothyroidism on treatment',
  personalHistory: 'Non-smoker, occasional alcohol',
  items: [
    medicine('Tab. Flutas 150 mg', 'ONCE_DAILY', 7, 'After food', 'Once a week'),
    medicine('Tab. Teczine 5 mg', 'ONCE_DAILY', 14, 'At night', ''),
    medicine('Cap. Sotret 10 mg', 'ONCE_DAILY', 30, 'After food', 'Avoid pregnancy'),
    medicine('Tab. Levocet 5 mg', 'TWICE_DAILY', 10, 'After food', ''),
    medicine('Fucibet cream', 'TWICE_DAILY', 14, '', 'Apply thin layer on elbows'),
    medicine('Protar-K scalp solution', 'ONCE_DAILY', 21, 'At night', 'Wash off in the morning'),
    medicine('Zimba cream', 'TWICE_DAILY', 30, '', 'On face'),
    medicine('Cap. Antoxid-HC', 'ONCE_DAILY', 30, 'After food', ''),
    medicine('Cwin lotion', 'TWICE_DAILY', 30, '', 'Moisturise twice daily'),
  ],
  investigations: ['CBC', 'ESR', 'CRP', 'LFT', 'RFT', 'FBS', 'HbA1c', 'TSH', 'Vitamin D', 'Ferritin'],
  procedures: 'Scalp scraping for KOH',
  procedurePlanned: 'Narrow band UVB phototherapy',
  followUpInstructions: 'Post care — 7 days',
  customSections: [{ id: 'cs-1', title: 'Allergies', content: 'Sulfa drugs' }],
};
const inlineLabels = ['Vitals', 'Diagnosis', 'Chief Complaints', 'History', 'Personal history', 'Investigations', 'Procedures', 'Procedure Planned', 'Allergies', 'Review Date', 'Follow-up'];

async function setOptimized(page, enabled) {
  const box = page.locator('label', { hasText: 'Space-optimized layout' }).locator('input');
  if ((await box.isChecked()) === enabled) return;
  await box.click();
  await page.waitForFunction(enabled => {
    const content = document.querySelector('#pagedjs-container #prescription-print-content');
    return content && !!content.querySelector(':scope > .text-gray-700') === !enabled;
  }, enabled, { timeout: 60000 });
  await settle(page);
}

async function settle(page) {
  let previous = '';
  for (let stable = 0; stable < 3;) {
    await page.waitForTimeout(700);
    const snapshot = await page.evaluate(() => {
      const root = document.querySelector('#pagedjs-container');
      const pages = root ? root.querySelectorAll('.pagedjs_page').length : 0;
      const height = root ? [...root.querySelectorAll('.pagedjs_page_content')].flatMap(el => [...el.children]).reduce((sum, el) => sum + el.getBoundingClientRect().height, 0) : 0;
      return `${pages}:${Math.round(height)}`;
    });
    stable = snapshot === previous && !snapshot.startsWith('0:') ? stable + 1 : 0;
    previous = snapshot;
  }
}

function measure(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#pagedjs-container');
    const pages = root.querySelectorAll('.pagedjs_page').length;
    const labels = ['Vitals', 'Chief Complaints', 'History', 'Personal history', 'Diagnosis', 'Investigations', 'Procedures', 'Procedure Planned', 'Allergies', 'Review Date', 'Follow-up', 'Follow-up Instructions'];
    const fields = {};
    for (const el of root.querySelectorAll('.pagedjs_page_content span, .pagedjs_page_content div')) {
      if (el.children.length) continue;
      const name = el.textContent.trim().replace(/:$/, '');
      if (!labels.includes(name) || fields[name]) continue;
      const value = el.nextElementSibling;
      if (!value) continue;
      const l = el.getBoundingClientRect();
      const v = value.getBoundingClientRect();
      fields[name] = { labelTop: l.top, labelRight: l.right, valueTop: v.top, valueLeft: v.left, fontSize: getComputedStyle(value).fontSize };
    }
    const content = [...root.querySelectorAll('.pagedjs_page_content')].flatMap(el => [...el.children]);
    const height = content.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
    const rxRows = root.querySelectorAll('.rx-row').length;
    const lastPage = [...root.querySelectorAll('.pagedjs_page')].pop();
    const signatureOnLastPage = !!lastPage?.querySelector('.doctor-signature-block');
    return { pages, height: Math.round(height), rxRows, signatureOnLastPage, fields };
  });
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  await page.addInitScript(({ key, draft }) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(draft)); }, { key: `rxDraft:${patient.id}:${visitId}`, draft });
  await page.context().addCookies([{ name: 'auth_token', value: 'synthetic-browser-fixture', url: baseUrl }]);
  const visit = { id: visitId, patientId: patient.id, doctorId: doctor.id, patient, doctor, complaints: [{ complaint: draft.chiefComplaints }], history: {}, exam: {}, vitals: { height: 172, weight: 70, systolicBP: 118, diastolicBP: 76, heartRate: 72 }, plan: { followUpDate: reviewDate, followUpInstructions: draft.followUpInstructions }, diagnosis: [], createdAt: '2026-10-25T09:00:00Z' };
  await page.route('**/api/**', route => {
    const route_ = new URL(route.request().url()).pathname.slice(4);
    let body = [];
    if (route_ === '/auth/me' || route_ === `/users/${doctor.id}`) body = doctor;
    else if (route_ === '/users') body = { users: [doctor] };
    else if (route_ === '/patients') body = { patients: [patient], total: 1 };
    else if (route_ === `/patients/${patient.id}`) body = patient;
    else if (route_ === `/visits/${visitId}`) body = visit;
    else if (route_.startsWith('/visits/patient/')) body = { visits: [visit], pagination: { hasMore: false } };
    else if (route_.endsWith('/personal-history')) body = { personalHistory: draft.personalHistory };
    else if (route_.endsWith('/next-appointment')) body = null;
    else if (route_ === '/prescriptions/templates') body = { templates: [] };
    else if (route_.startsWith('/prescriptions/doctor/')) body = { prescriptions: [] };
    else if (route_ === '/billing/invoices') body = { invoices: [] };
    else if (route_ === '/drugs') body = { drugs: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  try {
    await page.goto(`${baseUrl}/dashboard/visits?visitId=${visitId}`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.getByRole('tab', { name: /^\s*Prescription\b/ }).first().click({ timeout: 60000 });
    await page.waitForFunction(names => names.every(name => [...document.querySelectorAll('input')].some(input => input.value === name)), draft.items.map(item => item.drugName), { timeout: 60000 });
    await page.getByRole('button', { name: 'Print Preview', exact: true }).click();
    await page.waitForSelector('#pagedjs-container .pagedjs_page', { timeout: 60000 });
    await setOptimized(page, false);
    await settle(page);
    const normal = await measure(page);
    await page.screenshot({ path: path.join(output, 'normal.png') });
    await setOptimized(page, true);
    const optimized = await measure(page);
    await page.screenshot({ path: path.join(output, 'optimized.png') });
    const pageShots = page.locator('#pagedjs-container .pagedjs_page');
    for (let i = 0; i < await pageShots.count(); i++) await pageShots.nth(i).screenshot({ path: path.join(output, `optimized-page-${i + 1}.png`) });
    await setOptimized(page, false);
    const restored = await measure(page);

    const result = { normal, optimized, restored };
    fs.writeFileSync(path.join(output, process.env.CR23_LABEL ? `checks-${process.env.CR23_LABEL}.json` : 'checks.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ rxRows: optimized.rxRows, normalPages: normal.pages, optimizedPages: optimized.pages, normalHeight: normal.height, optimizedHeight: optimized.height, fields: Object.keys(optimized.fields) }));

    for (const [name, state] of Object.entries({ normal, optimized, restored })) {
      assert.equal(state.rxRows, draft.items.length, `${name}: every medicine must render`);
      assert(state.signatureOnLastPage, `${name}: the signature must render on the last page`);
      assert(state.fields.Diagnosis, `${name}: the prescription body must render`);
    }
    if (process.env.CR23_BASELINE) return;
    assert.equal(optimized.pages, 1, 'Space-optimised prescription with 9 medicines and 10 investigations must fit on one page');
    for (const name of inlineLabels) {
      const f = optimized.fields[name];
      assert(f, `${name} must print in the optimised layout`);
      assert(Math.abs(f.labelTop - f.valueTop) < 3, `${name} heading and value must share a line`);
      assert(f.valueLeft > f.labelRight, `${name} value must follow its heading`);
    }
    for (const name of inlineLabels) {
      const n = normal.fields[name] || normal.fields[`${name} Instructions`];
      assert(n, `${name} must print in the normal layout`);
      assert.equal(optimized.fields[name].fontSize, n.fontSize, `${name} text size must not shrink`);
    }
    assert.equal(restored.height, normal.height, 'Unticking must restore the normal spacing');
    assert.equal(restored.pages, normal.pages, 'Unticking must restore the normal page count');
    console.log('PASS cr23: optimised fits one page, headings inline, normal layout restored');
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png') });
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
