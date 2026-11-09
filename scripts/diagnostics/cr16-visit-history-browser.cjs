const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.CR16_BASE_URL || 'http://localhost:3000';
const output = path.resolve(__dirname, '../../output/cr16-visit-history');
fs.mkdirSync(output, { recursive: true });

const patient = { id: '00000000-0000-4000-8000-000000000016', name: 'SYNTHETIC CR16 PATIENT', gender: 'FEMALE', age: 33, phone: '', branchId: 'synthetic' };
const doctor = { id: '00000000-0000-4000-8000-000000000002', firstName: 'Test', lastName: 'Doctor', role: 'DOCTOR', branchId: 'synthetic', isActive: true };
const regimen = (drugName, extra = {}) => ({
  drugName, dosage: 1, dosageUnit: 'TABLET', frequency: 'TWICE_DAILY', dosePattern: '1-0-1', duration: 30, durationUnit: 'DAYS',
  timing: 'After meals', instructions: '1 pea size amount- whole face', route: 'Topical', quantity: 1, isGeneric: false, gstRate: 12,
  drugId: 'cmdrug000000000000000001', inventoryItemId: 'cminv0000000000000000001',
  regimenState: { touched: ['timing', 'duration', 'instructions'], suggested: [], source: 'doctor' }, ...extra,
});
const items = [regimen('Benzac AC gel wash'), regimen('Moisturex Hydra Gel Cream'), regimen('Bioderma Photoderm Xdefence')];
const visitBase = { entryType: 'visit', doctor, status: 'COMPLETED', exam: {}, vitals: null, photos: 0, photoPreviewUrls: [] };
const visits = [
  {
    ...visitBase, id: 'v-rich', encounterDate: '2026-10-25T10:00:00.000Z', createdAt: '2026-10-25T10:00:00.000Z',
    complaints: [{ complaint: 'Acne flare on cheeks' }], diagnosis: [{ diagnosis: 'Acne vulgaris' }],
    history: { personalHistory: 'Vegetarian. Sleeps 6 hours.', pastHistory: 'Childhood eczema', familyHistory: { dm: false, htn: true }, triggers: 'Heat' },
    plan: { investigations: ['CBC'], dermatology: { medicationPlan: items } },
    prescription: { id: 'rx-rich', items: JSON.stringify(items), instructions: 'Review in 4 weeks', language: 'Hindi' },
    prescriptionItems: items, prescriptionMeta: { followUpInstructions: 'Review in 4 weeks', language: 'Hindi' },
    consents: [{ consentType: 'PROCEDURE', language: 'Telugu', text: 'Consent for chemical peel', method: 'SIGNATURE' }],
  },
  {
    ...visitBase, id: 'v-draft', status: 'IN_PROGRESS', encounterDate: '2026-10-10T10:00:00.000Z', createdAt: '2026-10-10T10:00:00.000Z',
    complaints: [{ complaint: 'Dry patches on elbows' }], diagnosis: [],
    history: { personalHistory: 'Swims daily' },
    plan: { dermatology: { medicationPlan: [regimen('Fucibet cream'), regimen('  fucibet CREAM ')] } },
    prescriptionItems: [], prescriptionMeta: {},
  },
  {
    ...visitBase, id: 'v-legacy', encounterDate: '2026-09-01T10:00:00.000Z', createdAt: '2026-09-01T10:00:00.000Z',
    complaints: [{ complaint: 'Hair fall' }], diagnosis: [{ diagnosis: 'Telogen effluvium' }],
    history: 'Typhoid three months ago',
    plan: {}, prescription: { id: 'rx-legacy', items: JSON.stringify([{ name: 'Tab. Biotin 10 mg', frequency: 'ONCE_DAILY' }]) },
    prescriptionItems: [], prescriptionMeta: {},
  },
  {
    ...visitBase, id: 'v-form', encounterDate: '2026-08-20T10:00:00.000Z', createdAt: '2026-08-20T10:00:00.000Z',
    complaints: [{ complaint: 'Itchy rash on arms' }], diagnosis: [],
    history: { subjective: 'Itching for 3 weeks, worse at night' },
    plan: { dermatology: { medications: { topicals: 'Adapalene gel\nSunscreen SPF 50' } } }, prescriptionItems: [], prescriptionMeta: {},
  },
  {
    ...visitBase, id: 'v-vitals', encounterDate: '2026-08-10T10:00:00.000Z', createdAt: '2026-08-10T10:00:00.000Z',
    complaints: [{ complaint: 'Routine weight check' }], diagnosis: [], history: {}, plan: {}, prescriptionItems: [], prescriptionMeta: {},
    vitals: { weight: 61, height: 158 },
  },
  {
    ...visitBase, id: 'v-bare', encounterDate: '2026-08-01T10:00:00.000Z', createdAt: '2026-08-01T10:00:00.000Z',
    complaints: [{ complaint: 'Mole check' }], diagnosis: [], history: {}, plan: {}, prescriptionItems: [], prescriptionMeta: {},
  },
];

const forbiddenInCompact = ['1-0-1', 'TWICE_DAILY', 'Twice', 'After meals', 'pea size', 'Regimen State', 'Touched', 'Gst Rate', 'Language', 'timing', 'Treatment plan', 'Prescription Items', 'Topical'];
const forbiddenAnywhere = ['Regimen State', 'Touched', 'Gst Rate', 'Hindi', 'Prescription Items', 'cmdrug0000', 'cminv0000'];
const checks = [];
const report = message => { checks.push(message); console.log(message); };

async function run(viewport, label) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'auth_token', value: 'synthetic-browser-fixture', url: base }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace(/^\/api/, '');
    let body = [];
    if (p === '/auth/me' || p === `/users/${doctor.id}`) body = doctor;
    else if (p === '/users') body = { users: [doctor] };
    else if (p === `/patients/${patient.id}`) body = patient;
    else if (p === `/visits/patient/${patient.id}/history`) body = { patient, visits, pagination: { hasMore: false } };
    else if (p.endsWith('/next-appointment')) body = null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${base}/dashboard/patients/${patient.id}`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.getByRole('tab', { name: 'History' }).click();
  await page.getByText('Acne flare on cheeks').first().waitFor({ timeout: 60000 });
  const card = complaint => page.locator('[data-slot="card"]').filter({ hasText: complaint }).last();
  const text = async locator => (await locator.innerText()).replace(/\s+/g, ' ');
  const assertNone = (content, words, where) => { for (const word of words) assert(!content.includes(word), `${label}: ${where} must not show "${word}"`); };
  const count = (content, word) => content.split(word).length - 1;

  const rich = card('Acne flare on cheeks');
  assertNone(await text(rich), ['Medicines', 'Vegetarian'], 'summary card');
  report(`${label}: summary card hides the history panel until opened`);

  await rich.getByRole('button', { name: /show details/i }).click();
  let content = await text(rich);
  for (const want of ['Acne flare on cheeks', 'Acne vulgaris', 'Vegetarian. Sleeps 6 hours.', 'Childhood eczema', 'Hypertension', 'Heat', 'Medicines', 'Benzac AC gel wash', 'Moisturex Hydra Gel Cream', 'Bioderma Photoderm Xdefence']) {
    assert(content.includes(want), `${label}: compact view must show "${want}"`);
  }
  for (const name of ['Benzac AC gel wash', 'Moisturex Hydra Gel Cream', 'Bioderma Photoderm Xdefence']) assert.equal(count(content, name), 1, `${label}: ${name} listed once`);
  assertNone(content, forbiddenInCompact, 'compact view');
  await page.screenshot({ path: path.join(output, `${label}-compact.png`), fullPage: true });
  report(`${label}: compact view shows complaints, history and each medicine name once, with no regimen or internal fields`);

  const full = rich.getByRole('button', { name: /full details/i });
  const firstHeading = rich.getByRole('heading', { name: 'History', exact: true });
  assert((await full.boundingBox()).y < (await firstHeading.boundingBox()).y, `${label}: Full details switch sits above the panel content`);
  await full.click();
  content = await text(rich);
  assert(content.includes('1-0-1'), `${label}: full details keeps the regimen`);
  assert(content.includes('pea size'), `${label}: full details keeps instructions`);
  assert.equal(await rich.getByRole('heading', { name: 'Prescription', exact: true }).count(), 1, `${label}: one Prescription section`);
  for (const name of ['Benzac AC gel wash', 'Moisturex Hydra Gel Cream']) assert.equal(count(content, name), 1, `${label}: ${name} appears once in full details`);
  assertNone(content, forbiddenAnywhere, 'full details');
  assert(content.includes('Telugu'), `${label}: consent language still shown`);
  assert(!/timing duration instructions/i.test(content), `${label}: stray regimen-state line removed`);
  await page.screenshot({ path: path.join(output, `${label}-full.png`), fullPage: true });
  report(`${label}: full details keeps the regimen once and the consent language, without Regimen State, Touched, Gst Rate, prescription Language or IDs`);

  await rich.getByRole('button', { name: /compact view/i }).click();
  assert(!(await text(rich)).includes('1-0-1'), `${label}: compact view returns`);
  await rich.getByRole('button', { name: /hide details/i }).click();
  await rich.getByRole('button', { name: /show details/i }).click();
  assert(!(await text(rich)).includes('1-0-1'), `${label}: reopening starts in compact view`);
  report(`${label}: Compact view and Hide details return; reopening starts compact`);

  const draft = card('Dry patches on elbows');
  assert(!(await text(draft)).includes('Rx Items'), `${label}: an unissued draft plan gets no Rx badge`);
  await draft.getByRole('button', { name: /show details/i }).click();
  content = await text(draft);
  assert(content.includes('Swims daily'), `${label}: draft history shown`);
  assert.equal(count(content.toLowerCase(), 'fucibet cream'), 1, `${label}: draft medicine from the saved plan listed once`);
  assertNone(content, forbiddenInCompact, 'draft compact view');
  report(`${label}: draft visit lists medicines from its saved plan, case-insensitive duplicates merged, with no Rx badge`);

  const form = card('Itchy rash on arms');
  await form.getByRole('button', { name: /show details/i }).click();
  content = await text(form);
  for (const want of ['Itching for 3 weeks, worse at night', 'Adapalene gel', 'Sunscreen SPF 50']) assert(content.includes(want), `${label}: visit-form visit shows "${want}"`);
  report(`${label}: history and free-text medicines from the visit form appear in the compact view`);

  const vitals = card('Routine weight check');
  await vitals.getByRole('button', { name: /show details/i }).click();
  content = await text(vitals);
  assert(content.includes('61'), `${label}: vitals-only visit opens straight to full details`);
  assert.equal(await vitals.getByRole('button', { name: /full details|compact view/i }).count(), 0, `${label}: no view switch when compact has nothing`);
  report(`${label}: a visit with only vitals opens its details in one click`);

  const legacy = card('Hair fall');
  await legacy.getByRole('button', { name: /show details/i }).click();
  content = await text(legacy);
  for (const want of ['Typhoid three months ago', 'Tab. Biotin 10 mg']) assert(content.includes(want), `${label}: legacy visit shows "${want}"`);
  assert(!content.includes('ONCE_DAILY'), `${label}: legacy compact view hides frequency`);
  report(`${label}: legacy string history and JSON prescription items render`);

  const bare = card('Mole check');
  const bareToggle = bare.getByRole('button', { name: /show details/i });
  if (await bareToggle.count()) {
    await bareToggle.click();
    content = await text(bare);
    assertNone(content, ['Medicines', 'History'], 'empty visit');
  }
  report(`${label}: a visit with no history or medicines shows no empty headings`);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(overflow <= 1, `${label}: no horizontal page overflow (${overflow}px)`);
  assert.deepEqual(errors, [], `${label}: no page errors`);
  report(`${label}: no horizontal overflow and no page errors`);
  await browser.close();
}

(async () => {
  await run({ width: 1440, height: 1000 }, 'desktop');
  await run({ width: 390, height: 844 }, 'mobile');
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ base, checks }, null, 2));
  console.log(`PASS ${checks.length} checks`);
})().catch(error => { console.error(error); process.exit(1); });
