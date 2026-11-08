// Fit to 1 page: runs 30 synthetic prescriptions through the real Print
// Preview (Paged.js in Chromium) and checks each one fits on one page, keeps
// every line, stays readable and leaves no overlap or clipping. Every API
// response is synthetic and each prescription is seeded as a local draft.
//
// Start the frontend on port 3000, then: node scripts/diagnostics/fit-one-page-browser.cjs
// FIT_ONLY=typical,heavy runs a subset. Output goes to FIT_OUTPUT or the temp folder.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const output = path.resolve(process.env.FIT_OUTPUT || path.join(os.tmpdir(), 'fit-one-page'));
const baseUrl = process.env.FIT_BASE_URL || 'http://localhost:3000';
const only = process.env.FIT_ONLY ? process.env.FIT_ONLY.split(',') : null;
const patient = { id: '00000000-0000-4000-8000-000000000031', name: 'SYNTHETIC FIT PATIENT', gender: 'FEMALE', age: 37, branchId: 'synthetic' };
const doctor = { id: '00000000-0000-4000-8000-000000000032', firstName: 'Test', lastName: 'Doctor', role: 'DOCTOR', branchId: 'synthetic', isActive: true };
const visitId = '00000000-0000-4000-8000-000000000033';
const MIN_FONT_PX = 11;

const med = (drugName, frequency = 'ONCE_DAILY', duration = 14, timing = 'After food', instructions = '') => ({ drugName, dosage: 1, dosageUnit: 'TABLET', frequency, duration, durationUnit: 'DAYS', timing, instructions });
const typicalItems = [
  med('Tab. Flutas 150 mg', 'ONCE_DAILY', 7, 'After food', 'Once a week'),
  med('Tab. Teczine 5 mg', 'ONCE_DAILY', 14, 'At night'),
  med('Cap. Sotret 10 mg', 'ONCE_DAILY', 30, 'After food', 'Avoid pregnancy'),
  med('Tab. Levocet 5 mg', 'TWICE_DAILY', 10, 'After food'),
  med('Fucibet cream', 'TWICE_DAILY', 14, '', 'Apply thin layer on elbows'),
  med('Protar-K scalp solution', 'ONCE_DAILY', 21, 'At night', 'Wash off in the morning'),
  med('Zimba cream', 'TWICE_DAILY', 30, '', 'On face'),
  med('Cap. Antoxid-HC', 'ONCE_DAILY', 30, 'After food'),
  med('Cwin lotion', 'TWICE_DAILY', 30, '', 'Moisturise twice daily'),
];
const meds = (n, instructions = 'Take with water') => Array.from({ length: n }, (_, i) => typicalItems[i] ?? med(`Tab. Synthetic medicine ${i + 1} 10 mg`, i % 2 ? 'TWICE_DAILY' : 'ONCE_DAILY', 10 + i, i % 3 ? 'After food' : 'At night', instructions));
const inv = ['CBC', 'ESR', 'CRP', 'LFT', 'RFT', 'FBS', 'HbA1c', 'TSH', 'Vitamin D', 'Ferritin', 'Lipid profile', 'Uric acid', 'Serum calcium', 'Urine routine', 'HIV-I,II', 'HbS Ag', 'Anti HCV', 'Vitamin B12', 'Serum zinc', 'ANA', 'Anti-TPO', 'Prolactin', 'LH', 'FSH', 'Testosterone', 'DHEAS', 'Serum iron', 'TIBC', 'Peripheral smear', 'KOH mount'];
const vitals = { height: 160, weight: 58, systolicBP: 112, diastolicBP: 74, heartRate: 70 };
const sentence = 'Persistent itching and flaking over scalp, elbows and knees, worse in winter. ';
const longInstr = 'Apply a thin layer over affected areas after bathing, avoid eyes and lips, stop if burning persists and report at review';

// mustFit: the prescription has to land on one page. Otherwise the run accepts
// one page, or the smallest step with the "too much content" notice.
const scenarios = [
  { name: 'minimal', mustFit: true, draft: { items: meds(1) } },
  { name: 'two-meds-review', mustFit: true, reviewDate: '2026-11-28', draft: { diagnosis: 'Tinea corporis', items: meds(2) } },
  { name: 'typical', mustFit: true, reviewDate: '2026-11-28', vitals, draft: { chiefComplaints: 'Itchy scaly patches on scalp and elbows for 3 months', diagnosis: 'Plaque psoriasis with seborrhoeic dermatitis of scalp', pastHistory: 'Hypothyroidism on treatment', personalHistory: 'Non-smoker, occasional alcohol', items: meds(9), investigations: inv.slice(0, 10), procedures: 'Scalp scraping for KOH', procedurePlanned: 'Narrow band UVB phototherapy', followUpInstructions: 'Post care, 7 days', customSections: [{ id: 'cs-1', title: 'Allergies', content: 'Sulfa drugs' }] } },
  { name: 'meds-12', mustFit: true, reviewDate: '2026-12-01', draft: { diagnosis: 'Acne vulgaris grade 3', items: meds(12), investigations: inv.slice(0, 6), followUpInstructions: 'Review in 4 weeks' } },
  { name: 'meds-15', mustFit: true, reviewDate: '2026-12-01', vitals, draft: { chiefComplaints: 'Acne and pigmentation', diagnosis: 'Acne with PIH', items: meds(15), investigations: inv.slice(0, 8), followUpInstructions: 'Review in 4 weeks' } },
  { name: 'meds-18', mustFit: true, reviewDate: '2026-12-01', vitals, draft: { diagnosis: 'Psoriasis', items: meds(18, ''), investigations: inv.slice(0, 10), followUpInstructions: 'Review with reports' } },
  { name: 'meds-20', mustFit: true, reviewDate: '2026-12-01', vitals, draft: { chiefComplaints: 'Multiple concerns', diagnosis: 'Psoriasis with nail involvement', items: meds(20), investigations: inv.slice(0, 10), followUpInstructions: 'Review with reports' } },
  { name: 'heavy-23', mustFit: true, reviewDate: '2026-11-20', vitals, draft: { chiefComplaints: 'Multiple concerns across scalp, face and nails', diagnosis: 'Psoriasis with nail involvement and acne', pastHistory: 'Hypertension', items: [...typicalItems, ...Array.from({ length: 14 }, (_, i) => med(`Extra medicine ${i + 1}`, 'TWICE_DAILY', 10, 'After food', 'Long instruction text that wraps onto a second line in the table'))], investigations: inv.slice(0, 10), procedures: 'Nail clipping for fungal culture', procedurePlanned: 'Intralesional steroid injection', followUpInstructions: 'Review with all reports' } },
  { name: 'meds-26-long-instructions', reviewDate: '2026-11-20', vitals, draft: { diagnosis: 'Chronic urticaria', items: meds(26, longInstr), investigations: inv.slice(0, 12), followUpInstructions: 'Review in 2 weeks' } },
  { name: 'long-complaints', mustFit: true, reviewDate: '2026-12-05', draft: { chiefComplaints: sentence.repeat(5), diagnosis: 'Chronic plaque psoriasis', items: meds(5), investigations: inv.slice(0, 10) } },
  { name: 'long-follow-up-unbroken', mustFit: true, reviewDate: '2026-12-05', draft: { diagnosis: 'Eczema', items: meds(6), followUpInstructions: `${'Continue moisturiser twice daily and avoid harsh soaps. '.repeat(6)}${'unbrokenword'.repeat(14)}` } },
  { name: 'investigations-17', mustFit: true, reviewDate: '2026-12-05', draft: { diagnosis: 'Hair fall evaluation', items: meds(5), investigations: inv.slice(0, 17) } },
  { name: 'investigations-30', mustFit: true, reviewDate: '2026-12-05', vitals, draft: { diagnosis: 'Hirsutism workup', items: meds(8), investigations: inv } },
  { name: 'custom-sections-6', mustFit: true, reviewDate: '2026-12-05', draft: { diagnosis: 'Vitiligo', items: meds(6), customSections: ['Allergies', 'Diet advice', 'Sun protection', 'Skin care routine', 'Warning signs', 'Lab note'].map((title, i) => ({ id: `cs-${i}`, title, content: `${title} details: ${'keep notes short and clear. '.repeat(2 + (i % 3))}` })) } },
  { name: 'long-diagnosis-history', mustFit: true, reviewDate: '2026-12-05', draft: { diagnosis: 'Chronic plaque psoriasis with scalp, nail and palmoplantar involvement, psoriatic arthritis suspected, seborrhoeic dermatitis overlap', pastHistory: 'Hypertension for 8 years on amlodipine, type 2 diabetes for 5 years on metformin, appendicectomy in 2010, recurrent tonsillitis in childhood', items: meds(9), investigations: inv.slice(0, 10) } },
  { name: 'all-sections-moderate', mustFit: true, reviewDate: '2026-12-10', vitals, draft: { chiefComplaints: 'Itchy rash for 2 weeks', diagnosis: 'Allergic contact dermatitis', pastHistory: 'Asthma', personalHistory: 'Diet: vegetarian\nSleep: 6 hours; teacher; sunscreen daily', items: meds(10), investigations: inv.slice(0, 8), procedures: 'Patch test', procedurePlanned: 'Repeat patch test reading at 96 hours', followUpInstructions: 'Avoid nickel jewellery; review in 1 week', customSections: [{ id: 'cs-1', title: 'Allergies', content: 'Nickel' }] } },
  { name: 'all-sections-heavy', reviewDate: '2026-12-10', vitals, draft: { chiefComplaints: sentence.repeat(3), diagnosis: 'Severe atopic dermatitis with secondary infection and post-inflammatory pigmentation', pastHistory: 'Asthma since childhood, allergic rhinitis', personalHistory: 'Diet: mixed\nSleep: 5 hours, night shifts\nSmoker 5 per day', items: meds(14, longInstr), investigations: inv.slice(0, 20), procedures: 'Pus swab for culture and sensitivity', procedurePlanned: 'Wet wrap therapy session', followUpInstructions: 'Continue emollients. '.repeat(8), customSections: [{ id: 'cs-1', title: 'Allergies', content: 'Penicillin, sulfa drugs' }, { id: 'cs-2', title: 'Diet advice', content: 'Avoid known food triggers; keep a food diary for two weeks.' }] } },
  { name: 'long-medicine-names', mustFit: true, reviewDate: '2026-12-10', draft: { diagnosis: 'Melasma', items: Array.from({ length: 10 }, (_, i) => med(`Tab. Hydroxychloroquine sulphate with tranexamic acid combination ${200 + i} mg extended release`, 'TWICE_DAILY', 30, 'After food', 'Check eyes every 6 months')) } },
  { name: 'follow-up-only', mustFit: true, draft: { diagnosis: 'Acne vulgaris', items: meds(3), followUpInstructions: 'Review in 4 weeks' } },
  { name: 'review-date-only', mustFit: true, reviewDate: '2026-12-20', draft: { diagnosis: 'Warts', items: meds(2) } },
  { name: 'vitals-two-meds', mustFit: true, vitals, draft: { items: meds(2) } },
  { name: 'extreme-overflow', expectOverflow: true, reviewDate: '2026-12-20', vitals, draft: { chiefComplaints: sentence.repeat(8), diagnosis: 'Multiple chronic dermatoses', pastHistory: 'Multiple comorbidities', items: meds(40, longInstr), investigations: inv, followUpInstructions: 'Continue all medicines. '.repeat(10) } },
  { name: 'big-top-margin', mustFit: true, topMarginPx: 260, reviewDate: '2026-12-20', vitals, draft: { diagnosis: 'Psoriasis', items: meds(12), investigations: inv.slice(0, 10), followUpInstructions: 'Review in 2 weeks' } },
  { name: 'content-offset-down', mustFit: true, offsetYPx: 60, reviewDate: '2026-11-20', vitals, draft: { diagnosis: 'Psoriasis with nail involvement', items: meds(20), investigations: inv.slice(0, 10), followUpInstructions: 'Review with reports' } },
  { name: 'big-bottom-margin', mustFit: true, bottomMarginPx: 180, reviewDate: '2026-12-20', vitals, draft: { diagnosis: 'Psoriasis', items: meds(12), investigations: inv.slice(0, 10), followUpInstructions: 'Review in 2 weeks' } },
  { name: 'multiline-personal-history', mustFit: true, reviewDate: '2026-12-20', draft: { personalHistory: 'Diet: vegetarian\nSleep: 6 hours\nOccupation: software engineer\nExercise: walks 30 minutes daily\nSun exposure: minimal', diagnosis: 'Seborrhoeic dermatitis', items: meds(7) } },
  { name: 'meds-30-no-instructions', mustFit: true, reviewDate: '2026-12-20', draft: { diagnosis: 'Polypharmacy review', items: meds(30, '') } },
  { name: 'meds-10-three-line-instructions', mustFit: true, reviewDate: '2026-12-20', draft: { diagnosis: 'Lichen planus', items: meds(10, `${longInstr}. ${longInstr}`) } },
  { name: 'unicode-instructions', mustFit: true, reviewDate: '2026-12-20', draft: { diagnosis: 'Scabies', items: [med('Permethrin 5% cream', 'ONCE_DAILY', 1, 'At night', 'रात को पूरे शरीर पर लगाएं, सुबह धो लें'), med('Tab. Levocet 5 mg', 'ONCE_DAILY', 7, 'At night', 'రాత్రి భోజనం తర్వాత'), ...meds(4).slice(2)], followUpInstructions: 'Treat all family members together' } },
  { name: 'page-breaks-ticked', mustFit: true, ticksPageBreaks: true, reviewDate: '2026-11-28', vitals, draft: { diagnosis: 'Psoriasis', items: meds(9), investigations: inv.slice(0, 10), followUpInstructions: 'Post care, 7 days' } },
  { name: 'toggle-restores-normal', mustFit: true, checksToggleOff: true, reviewDate: '2026-11-28', vitals, draft: { diagnosis: 'Psoriasis', items: meds(14), investigations: inv.slice(0, 10), followUpInstructions: 'Review in 2 weeks' } },
];
const exportScenarios = new Set(['typical', 'heavy-23', 'meds-30-no-instructions', 'extreme-overflow']);
const inlineLabels = ['Vitals', 'Diagnosis', 'Chief Complaints', 'History', 'Personal history', 'Investigations', 'Procedures', 'Procedure Planned', 'Allergies', 'Review Date', 'Follow-up'];

async function settle(page) {
  let previous = '';
  const deadline = Date.now() + 90000;
  for (let stable = 0; stable < 3;) {
    if (Date.now() > deadline) throw new Error(`print preview did not settle (last state ${previous})`);
    await page.waitForTimeout(600);
    const snapshot = await page.evaluate(() => {
      const root = document.querySelector('#pagedjs-container');
      const pages = root ? root.querySelectorAll('.pagedjs_page').length : 0;
      const height = root ? [...root.querySelectorAll('.pagedjs_page_content')].flatMap(el => [...el.children]).reduce((sum, el) => sum + el.getBoundingClientRect().height, 0) : 0;
      const status = document.querySelector('[data-fit-status]')?.textContent || '';
      return `${pages}:${Math.round(height)}:${status}`;
    });
    stable = snapshot === previous && !snapshot.startsWith('0:') ? stable + 1 : 0;
    previous = snapshot;
  }
}

async function setChecked(page, label, enabled) {
  const box = page.locator('label', { hasText: label }).locator('input');
  for (let attempt = 0; attempt < 3 && (await box.isChecked()) !== enabled; attempt++) {
    await box.click();
    await page.waitForTimeout(300);
  }
  assert.equal(await box.isChecked(), enabled, `${label} must be ${enabled ? 'ticked' : 'unticked'}`);
}

async function setFit(page, enabled) {
  await setChecked(page, 'Fit to 1 page', enabled);
  await page.waitForFunction(enabled => !!document.querySelector('#pagedjs-container [data-fit-to-page]') === enabled && (!enabled || !!document.querySelector('[data-fit-status]')), enabled, { timeout: 90000 });
}

async function setMargin(page, which, px) {
  await page.evaluate(({ which, px }) => {
    const label = [...document.querySelectorAll('label')].find(el => el.textContent.trim() === which);
    const input = label.closest('.space-y-2').querySelectorAll('input[type=range]')[which === 'Top margin' ? 0 : 1];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(px));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { which, px });
}

function measure(page) {
  return page.evaluate(labels => {
    const root = document.querySelector('#pagedjs-container');
    const pageEls = [...root.querySelectorAll('.pagedjs_page')];
    const text = pageEls.map(p => p.querySelector('.pagedjs_page_content').innerText).join('\n');
    const fields = {};
    for (const el of root.querySelectorAll('.pagedjs_page_content span, .pagedjs_page_content div')) {
      if (el.children.length) continue;
      const name = el.textContent.trim().replace(/:$/, '');
      if (!labels.includes(name) || fields[name]) continue;
      const value = el.nextElementSibling;
      if (!value) continue;
      const l = el.getBoundingClientRect();
      const v = value.getBoundingClientRect();
      fields[name] = { labelTop: l.top, labelRight: l.right, valueTop: v.top, valueLeft: v.left };
    }
    const pages = pageEls.map(pageEl => {
      const area = pageEl.querySelector('.pagedjs_area').getBoundingClientRect();
      const pageBox = pageEl.querySelector('.pagedjs_pagebox').getBoundingClientRect();
      const content = pageEl.querySelector('.pagedjs_page_content');
      const lines = [];
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const style = getComputedStyle(node.parentElement);
        for (const r of range.getClientRects()) if (r.height > 0 && r.width > 0) lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight) });
      }
      const overlaps = [];
      for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i], b = lines[j];
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (h > 3 && w > 3) overlaps.push([a, b]);
      }
      const fitRoot = content.querySelector('[data-fit-to-page]');
      return {
        pageBoxBottom: pageBox.bottom,
        areaTop: area.top, areaBottom: area.bottom, areaLeft: area.left, areaRight: area.right, areaHeight: area.height,
        textBottom: Math.max(...lines.map(l => l.bottom)), textRight: Math.max(...lines.map(l => l.right)), textLeft: Math.min(...lines.map(l => l.left)),
        minFont: Math.min(...lines.map(l => l.fontSize)),
        minLineRatio: Math.min(...lines.map(l => l.lineHeight / l.fontSize)),
        overlaps: overlaps.length,
        fillHeight: fitRoot ? fitRoot.getBoundingClientRect().height : null,
        transform: content.style.transform,
      };
    });
    const fitRoot = root.querySelector('[data-fit-to-page]');
    const marginLabel = [...document.querySelectorAll('label')].find(el => el.textContent.trim() === 'Bottom margin');
    const bottomMarginMm = parseFloat(marginLabel.parentElement.querySelector('span').textContent);
    const firstBox = pageEls[0].querySelector('.pagedjs_pagebox');
    const lastPage = pageEls[pageEls.length - 1];
    return {
      pageCount: pageEls.length,
      pages,
      bottomMarginMm,
      scale: firstBox.getBoundingClientRect().height / firstBox.offsetHeight,
      text,
      step: fitRoot ? Number(fitRoot.getAttribute('data-fit-step')) : null,
      fontVar: fitRoot ? fitRoot.style.getPropertyValue('--fit-font-size') : null,
      status: document.querySelector('[data-fit-status]')?.textContent || '',
      rxRows: root.querySelectorAll('.rx-row').length,
      breaks: root.querySelectorAll('.pb-before-page').length,
      signatureOnLastPage: !!lastPage?.querySelector('.doctor-signature-block'),
      fields,
    };
  }, inlineLabels);
}

async function exportPdf(page, dir) {
  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await downloadPromise;
  const pdfPath = path.join(dir, 'download.pdf');
  await download.saveAs(pdfPath);
  execFileSync('pdftoppm', ['-r', '60', '-png', pdfPath, path.join(dir, 'pdf')]);
  return fs.readdirSync(dir).filter(f => /^pdf-\d+\.png$/.test(f)).length;
}

// The step table, read from the app so the check cannot drift from it.
const FIT_STEPS = [...fs.readFileSync(path.join(__dirname, '../../frontend/src/lib/print-fit.ts'), 'utf8').matchAll(/\{ fontPx: ([\d.]+), lineHeight: ([\d.]+), blockPadPx: (\d+), rowPadPx: (\d+), signGapPx: (\d+) \}/g)]
  .map(m => ({ fontPx: +m[1], lineHeight: +m[2], blockPadPx: +m[3], rowPadPx: +m[4], signGapPx: +m[5] }));
assert.equal(FIT_STEPS.length, 10, 'read the 10 fit steps from print-fit.ts');

// Lays page 1's printed content out off-screen at the page's content width
// with another step's spacing, and returns its height.
function heightAtStep(page, step) {
  return page.evaluate(step => {
    const pageEl = document.querySelector('#pagedjs-container .pagedjs_page');
    const content = pageEl.querySelector('.pagedjs_page_content');
    const host = document.createElement('div');
    host.className = 'prescription-pdf-export';
    host.style.cssText = `position:absolute;left:-100000px;top:0;visibility:hidden;display:flow-root;width:${content.offsetWidth}px;`;
    host.innerHTML = content.querySelector('[data-fit-to-page]').outerHTML;
    document.body.appendChild(host);
    const root = host.firstElementChild;
    root.style.setProperty('--fit-font-size', `${step.fontPx}px`);
    root.style.setProperty('--fit-line-height', String(step.lineHeight));
    root.style.setProperty('--fit-block-pad', `${step.blockPadPx}px`);
    root.style.setProperty('--fit-row-pad', `${step.rowPadPx}px`);
    root.style.setProperty('--fit-sign-gap', `${step.signGapPx}px`);
    const height = host.offsetHeight;
    host.remove();
    return height;
  }, step);
}

const norm = s => s.replace(/\s+/g, ' ').trim();
const shiftOf = p => Number((p.transform.match(/,\s*(-?[\d.]+)px/) || [])[1] || 0);

// Every page is held to the bottom margin shown in the settings panel,
// including continuation pages after the downward nudge under the letterhead
// and content moved down by a content offset.
function assertAboveBottomMargin(m, key) {
  const marginPx = m.bottomMarginMm * 96 / 25.4 * m.scale;
  for (const [i, p] of m.pages.entries()) {
    const limit = p.pageBoxBottom - marginPx;
    assert(p.textBottom <= limit + 1, `${key}: page ${i + 1} text ends ${Math.round(p.textBottom - limit)}px inside the bottom margin (content ${p.transform || 'not shifted'})`);
  }
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const draft = { dosageSchemaVersion: 1, ...scenario.draft };
  await page.addInitScript(({ key, draft, offsetY }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(draft));
    if (offsetY) localStorage.setItem('rx_offset_y_px', String(offsetY));
  }, { key: `rxDraft:${patient.id}:${visitId}`, draft, offsetY: scenario.offsetYPx || 0 });
  // A content offset normally comes from the doctor's saved print layout.
  const visitDoctor = scenario.offsetYPx ? { ...doctor, metadata: { rxPrintProfile: { contentOffset: { xPx: 0, yPx: scenario.offsetYPx } } } } : doctor;
  await page.context().addCookies([{ name: 'auth_token', value: 'synthetic-browser-fixture', url: baseUrl }]);
  const visit = { id: visitId, patientId: patient.id, doctorId: doctor.id, patient, doctor, complaints: draft.chiefComplaints ? [{ complaint: draft.chiefComplaints }] : [], history: {}, exam: {}, vitals: scenario.vitals, plan: { followUpDate: scenario.reviewDate || '', followUpInstructions: draft.followUpInstructions || '' }, diagnosis: [], createdAt: '2026-10-25T09:00:00Z' };
  await page.route('**/api/**', route => {
    const request = route.request();
    const name = new URL(request.url()).pathname.slice(4);
    let body = [];
    if (request.method() !== 'GET') {
      if (name.startsWith('/visits/')) body = { ...visit, version: 2 };
      else if (name.startsWith('/prescriptions')) body = { id: 'rx-synthetic-fit', prescription: { id: 'rx-synthetic-fit' } };
      else body = { ok: true };
    } else if (name === '/auth/me' || name === `/users/${doctor.id}`) body = visitDoctor;
    else if (name === '/users') body = { users: [doctor] };
    else if (name === '/patients') body = { patients: [patient], total: 1 };
    else if (name === `/patients/${patient.id}`) body = patient;
    else if (name === `/visits/${visitId}`) body = visit;
    else if (name.startsWith('/visits/patient/')) body = { visits: [visit], pagination: { hasMore: false } };
    else if (name.endsWith('/personal-history')) body = { personalHistory: draft.personalHistory ?? null };
    else if (name.endsWith('/next-appointment')) body = null;
    else if (name === '/prescriptions/templates') body = { templates: [] };
    else if (name.startsWith('/prescriptions/doctor/')) body = { prescriptions: [] };
    else if (name === '/billing/invoices') body = { invoices: [] };
    else if (name === '/drugs') body = { drugs: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  const dir = path.join(output, scenario.name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  try {
    await page.goto(`${baseUrl}/dashboard/visits?visitId=${visitId}`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.getByRole('tab', { name: /^\s*Prescription\b/ }).first().click({ timeout: 60000 });
    await page.waitForFunction(names => names.every(name => [...document.querySelectorAll('input')].some(input => input.value === name)), draft.items.map(item => item.drugName), { timeout: 60000 });
    await page.getByRole('button', { name: 'Print Preview', exact: true }).click();
    await page.waitForSelector('#pagedjs-container .pagedjs_page', { timeout: 60000 });
    await page.addStyleTag({ content: '[data-fit-hidden] { visibility: hidden !important; }' });
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('#pagedjs-container') || el.querySelector('#pagedjs-container')) continue;
        const position = getComputedStyle(el).position;
        if (position === 'fixed' || position === 'sticky') el.setAttribute('data-fit-hidden', '');
      }
    });
    if (scenario.topMarginPx) await setMargin(page, 'Top margin', scenario.topMarginPx);
    if (scenario.bottomMarginPx) await setMargin(page, 'Bottom margin', scenario.bottomMarginPx);
    if (scenario.ticksPageBreaks) for (const label of ['Break before Rx', 'Break before Investigations', 'Break before Follow-up', 'Break before Signature']) await setChecked(page, label, true);
    await settle(page);
    const before = await measure(page);
    await setChecked(page, 'Space-optimized layout', true);
    await settle(page);
    const optimized = await measure(page);
    await setChecked(page, 'Space-optimized layout', false);
    await settle(page);

    await setFit(page, true);
    await settle(page);
    const state = await measure(page);
    const key = scenario.name;
    const fits = state.pageCount === 1;

    // Nothing is lost.
    assert.equal(state.rxRows, draft.items.length, `${key}: every medicine must render`);
    for (const item of draft.items) assert(norm(state.text).includes(norm(item.drugName)), `${key}: ${item.drugName} must be printed`);
    for (const name of draft.investigations || []) assert(state.text.includes(name), `${key}: investigation ${name} must be printed`);
    for (const field of ['diagnosis', 'chiefComplaints', 'followUpInstructions']) {
      if (draft[field]) assert(norm(state.text).includes(norm(draft[field]).slice(0, 60)), `${key}: ${field} must be printed`);
    }
    assert(state.signatureOnLastPage, `${key}: the signature must render on the last page`);
    assert.equal(state.breaks, 0, `${key}: fit mode must drop forced page breaks`);

    // One page, or the smallest step with the notice.
    if (scenario.mustFit) assert(fits, `${key}: must fit on one page (got ${state.pageCount}, step ${state.step})`);
    if (scenario.expectOverflow) assert(!fits, `${key}: is built to overflow`);
    if (fits) assert(/^Fits on 1 page/.test(state.status), `${key}: status must confirm the fit, got "${state.status}"`);
    else {
      assert.equal(state.fontVar, `${MIN_FONT_PX}px`, `${key}: an overflow must use the smallest step`);
      assert(state.status.includes(`Printing on ${state.pageCount} pages`), `${key}: status must explain the overflow, got "${state.status}"`);
    }

    // No layout lets text end inside the bottom margin, on any page.
    assertAboveBottomMargin(before, `${key}/normal`);
    assertAboveBottomMargin(optimized, `${key}/space-optimized`);
    assertAboveBottomMargin(state, `${key}/fit`);

    // Readable, inside the page, no collisions.
    for (const [i, p] of state.pages.entries()) {
      assert(p.minFont >= MIN_FONT_PX, `${key}: page ${i + 1} has ${p.minFont}px text, below ${MIN_FONT_PX}px`);
      assert(p.minLineRatio >= 1.14, `${key}: page ${i + 1} line height ratio ${p.minLineRatio.toFixed(2)} is too tight`);
      assert(p.textRight <= p.areaRight + 1 && p.textLeft >= p.areaLeft - 1, `${key}: page ${i + 1} text runs outside the printable width`);
      assert.equal(p.overlaps, 0, `${key}: page ${i + 1} has ${p.overlaps} overlapping text lines`);
    }
    for (const [name, f] of Object.entries(state.fields)) {
      assert(Math.abs(f.labelTop - f.valueTop) < 3, `${key}: ${name} heading and value must share a line`);
      assert(f.valueLeft > f.labelRight, `${key}: ${name} value must follow its heading`);
    }

    // Best fit: the printed page, laid out again at the next roomier step,
    // must not fit. Heights can drop sharply between steps when long cells
    // stop wrapping, so page fullness alone does not prove this.
    const fill = state.pages[0].fillHeight / state.pages[0].areaHeight;
    if (fits && state.step > 0) {
      const roomier = await heightAtStep(page, FIT_STEPS[state.step - 1]);
      assert(roomier > state.pages[0].areaHeight - 2, `${key}: step ${state.step - 1} is ${Math.round(roomier)}px tall and fits the ${Math.round(state.pages[0].areaHeight)}px page, so step ${state.step} shrinks text it did not need to`);
    }
    if (optimized.pageCount === 1) assert(parseFloat(state.fontVar) === 14, `${key}: fits space-optimized at 14px, so fit mode must not shrink text (got ${state.fontVar})`);

    const shots = [];
    const pageEls = page.locator('#pagedjs-container .pagedjs_page');
    for (let i = 0; i < state.pageCount; i++) {
      const shot = path.join(dir, `fit-${i + 1}.png`);
      await pageEls.nth(i).screenshot({ path: shot });
      shots.push(shot);
    }

    if (exportScenarios.has(key)) {
      const pdfPages = await exportPdf(page, dir);
      assert.equal(pdfPages, state.pageCount, `${key}: the PDF must have as many pages as the preview`);
      state.pdfPages = pdfPages;
      await settle(page);
    }

    if (scenario.checksToggleOff) {
      await setFit(page, false);
      await settle(page);
      const after = await measure(page);
      assert.equal(after.pageCount, before.pageCount, `${key}: unticking must restore the normal page count`);
      assert.equal(after.step, null, `${key}: unticking must remove the fit styles`);
      assert(after.text.includes('Patient Code'), `${key}: unticking must restore the stacked layout`);
    }

    const nudges = m => m.pages.slice(1).map(p => Math.round(shiftOf(p)));
    const summary = { normalNudgesPx: nudges(before), optimizedNudgesPx: nudges(optimized), fitNudgesPx: nudges(state), normalPages: before.pageCount, optimizedPages: optimized.pageCount, fitPages: state.pageCount, step: state.step, font: state.fontVar, fill: Math.round(fill * 100), status: state.status, pdfPages: state.pdfPages };
    const nudgeText = ['normal', 'optimized', 'fit'].map(l => summary[`${l}NudgesPx`]).some(n => n.length) ? `, page 2+ nudged ${['normal', 'optimized', 'fit'].map(l => `${l} [${summary[`${l}NudgesPx`].join(',')}]`).join(' ')}` : '';
    console.log(`PASS ${key}: normal ${before.pageCount}p, space-optimized ${optimized.pageCount}p -> fit ${state.pageCount}p at step ${state.step} (${state.fontVar}), ${summary.fill}% of page${state.pdfPages ? `, PDF ${state.pdfPages}p` : ''}${nudgeText}`);
    return summary;
  } catch (error) {
    await page.screenshot({ path: path.join(dir, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    await page.close();
  }
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  const summary = {};
  const failures = [];
  try {
    for (const scenario of scenarios) {
      if (only && !only.includes(scenario.name)) continue;
      try {
        summary[scenario.name] = await runScenario(browser, scenario);
      } catch (error) {
        failures.push(scenario.name);
        summary[scenario.name] = { error: error.message };
        console.log(`FAIL ${scenario.name}: ${error.message}`);
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  }
  if (failures.length) {
    console.log(`FAILED ${failures.length} of ${Object.keys(summary).length}: ${failures.join(', ')}`);
    process.exitCode = 1;
  } else console.log(`PASS fit to 1 page: ${Object.keys(summary).length} prescriptions`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
