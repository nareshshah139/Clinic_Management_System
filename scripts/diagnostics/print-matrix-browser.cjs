const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const output = path.resolve(process.env.PRINT_MATRIX_OUTPUT || path.join(os.tmpdir(), 'print-matrix'));
const baseUrl = process.env.PRINT_MATRIX_BASE_URL || 'http://localhost:3000';
const only = process.env.PRINT_MATRIX_ONLY ? process.env.PRINT_MATRIX_ONLY.split(',') : null;
const patient = { id: '00000000-0000-4000-8000-000000000021', name: 'SYNTHETIC MATRIX PATIENT', gender: 'FEMALE', age: 41, branchId: 'synthetic' };
const doctor = { id: '00000000-0000-4000-8000-000000000022', firstName: 'Test', lastName: 'Doctor', role: 'DOCTOR', branchId: 'synthetic', isActive: true };
const visitId = '00000000-0000-4000-8000-000000000023';

const medicine = (drugName, frequency, duration, timing, instructions) => ({ drugName, dosage: 1, dosageUnit: 'TABLET', frequency, duration, durationUnit: 'DAYS', timing, instructions });
const typicalItems = [
  medicine('Tab. Flutas 150 mg', 'ONCE_DAILY', 7, 'After food', 'Once a week'),
  medicine('Tab. Teczine 5 mg', 'ONCE_DAILY', 14, 'At night', ''),
  medicine('Cap. Sotret 10 mg', 'ONCE_DAILY', 30, 'After food', 'Avoid pregnancy'),
  medicine('Tab. Levocet 5 mg', 'TWICE_DAILY', 10, 'After food', ''),
  medicine('Fucibet cream', 'TWICE_DAILY', 14, '', 'Apply thin layer on elbows'),
  medicine('Protar-K scalp solution', 'ONCE_DAILY', 21, 'At night', 'Wash off in the morning'),
  medicine('Zimba cream', 'TWICE_DAILY', 30, '', 'On face'),
  medicine('Cap. Antoxid-HC', 'ONCE_DAILY', 30, 'After food', ''),
  medicine('Cwin lotion', 'TWICE_DAILY', 30, '', 'Moisturise twice daily'),
];
const investigations = ['CBC', 'ESR', 'CRP', 'LFT', 'RFT', 'FBS', 'HbA1c', 'TSH', 'Vitamin D', 'Ferritin'];
const vitals = { height: 160, weight: 58, systolicBP: 112, diastolicBP: 74, heartRate: 70 };

const scenarios = [
  {
    name: 'typical',
    fitsOnePageOptimized: true,
    reviewDate: '2026-11-28',
    vitals,
    draft: {
      chiefComplaints: 'Itchy scaly patches on scalp and elbows for 3 months',
      diagnosis: 'Plaque psoriasis with seborrhoeic dermatitis of scalp',
      pastHistory: 'Hypothyroidism on treatment',
      personalHistory: 'Non-smoker, occasional alcohol',
      items: typicalItems,
      investigations,
      procedures: 'Scalp scraping for KOH',
      procedurePlanned: 'Narrow band UVB phototherapy',
      followUpInstructions: 'Post care, 7 days',
      customSections: [{ id: 'cs-1', title: 'Allergies', content: 'Sulfa drugs' }],
    },
  },
  {
    name: 'minimal',
    fitsOnePageOptimized: true,
    reviewDate: '',
    draft: { items: [medicine('Tab. Levocet 5 mg', 'ONCE_DAILY', 5, 'At night', '')] },
  },
  {
    name: 'long-text',
    reviewDate: '2026-12-05',
    draft: {
      chiefComplaints: `${'Persistent itching and flaking over scalp, elbows and knees, worse in winter. '.repeat(5)}`,
      diagnosis: 'Chronic plaque psoriasis',
      items: typicalItems.slice(0, 5),
      investigations: [...investigations, 'Lipid profile', 'Uric acid', 'Serum calcium', 'Urine routine', 'HIV-I,II', 'HbS Ag', 'Anti HCV'],
      followUpInstructions: `${'Continue moisturiser twice daily and avoid harsh soaps. '.repeat(6)}${'unbrokenword'.repeat(14)}`,
    },
  },
  {
    name: 'heavy',
    reviewDate: '2026-11-20',
    vitals,
    draft: {
      chiefComplaints: 'Multiple concerns across scalp, face and nails',
      diagnosis: 'Psoriasis with nail involvement and acne',
      pastHistory: 'Hypertension',
      items: [...typicalItems, ...Array.from({ length: 14 }, (_, i) => medicine(`Extra medicine ${i + 1}`, 'TWICE_DAILY', 10, 'After food', 'Long instruction text that wraps onto a second line in the table'))],
      investigations,
      procedures: 'Nail clipping for fungal culture',
      procedurePlanned: 'Intralesional steroid injection',
      followUpInstructions: 'Review with all reports',
    },
  },
  {
    name: 'follow-up-only',
    fitsOnePageOptimized: true,
    reviewDate: '',
    draft: {
      diagnosis: 'Acne vulgaris',
      items: typicalItems.slice(0, 3),
      followUpInstructions: 'Review in 4 weeks',
    },
  },
];

const states = [];
for (const layout of ['normal', 'optimized']) for (const spacing of ['normal', 'compact', 'tight']) states.push({ layout, spacing });
const exportStates = new Set(['typical/optimized/tight', 'heavy/normal/normal', 'heavy/optimized/compact', 'long-text/optimized/normal', 'heavy/normal/tight']);
const expectedLineHeight = { compact: 1.3, tight: 1.2 };
const inlineLabels = ['Vitals', 'Diagnosis', 'Chief Complaints', 'History', 'Personal history', 'Investigations', 'Procedures', 'Procedure Planned', 'Allergies', 'Review Date', 'Follow-up'];

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

async function setOptimized(page, enabled) {
  const box = page.locator('label', { hasText: 'Space-optimized layout' }).locator('input');
  if ((await box.isChecked()) !== enabled) await box.click();
  await page.waitForFunction(enabled => {
    const content = document.querySelector('#pagedjs-container #prescription-print-content');
    return content && !!content.querySelector(':scope > .text-gray-700') === !enabled;
  }, enabled, { timeout: 60000 });
}

async function setSpacing(page, spacing) {
  const label = { normal: 'Normal', compact: 'Compact', tight: 'Tight' }[spacing];
  await page.getByRole('combobox', { name: 'Line spacing' }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await page.waitForFunction(spacing => document.querySelector('#pagedjs-container [data-line-spacing]')?.getAttribute('data-line-spacing') === spacing, spacing, { timeout: 60000 });
}

function measure(page) {
  return page.evaluate(labels => {
    const root = document.querySelector('#pagedjs-container');
    const pageEls = [...root.querySelectorAll('.pagedjs_page')];
    const fields = {};
    for (const el of root.querySelectorAll('.pagedjs_page_content span, .pagedjs_page_content div')) {
      if (el.children.length) continue;
      const name = el.textContent.trim().replace(/:$/, '');
      if (!labels.includes(name) || fields[name]) continue;
      const value = el.nextElementSibling;
      if (!value) continue;
      const l = el.getBoundingClientRect();
      const v = value.getBoundingClientRect();
      const style = getComputedStyle(value);
      fields[name] = { labelTop: l.top, labelRight: l.right, valueTop: v.top, valueLeft: v.left, fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight) };
    }
    const pages = pageEls.map(pageEl => {
      const box = pageEl.querySelector('.pagedjs_pagebox').getBoundingClientRect();
      const walker = document.createTreeWalker(pageEl.querySelector('.pagedjs_page_content'), NodeFilter.SHOW_TEXT);
      let firstTextTop = null;
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        const rect = [...range.getClientRects()].find(r => r.height > 0);
        if (rect) { firstTextTop = rect.top - box.top; break; }
      }
      return { height: box.height, firstTextTop };
    });
    const height = [...root.querySelectorAll('.pagedjs_page_content [data-line-spacing]')].reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
    const lastPage = pageEls[pageEls.length - 1];
    return {
      pageCount: pageEls.length,
      pages,
      height: Math.round(height),
      rxRows: root.querySelectorAll('.rx-row').length,
      signatureOnLastPage: !!lastPage?.querySelector('.doctor-signature-block'),
      fields,
    };
  }, inlineLabels);
}

// Fraction of text rows present in one image but not within 1 px in the other,
// after the best vertical alignment within 16 px. Light letterhead artwork is
// ignored, so the score tracks where lines of text fall.
function textRowMismatch(a, b) {
  const script = `
import sys
from PIL import Image
def profile(path, size):
    im = Image.open(path).convert('L').resize(size)
    px = im.load()
    return [sum(1 for x in range(size[0]) if px[x, y] < 120) > 2 for y in range(size[1])]
first = Image.open(sys.argv[1])
size = (first.width // 2, first.height // 2)
pa, pb = profile(sys.argv[1], size), profile(sys.argv[2], size)
h = len(pa)
def near(p, y):
    return any(p[max(0, min(h - 1, y + k))] for k in (-1, 0, 1))
def score(dy):
    sb = [pb[min(h - 1, max(0, y - dy))] for y in range(h)]
    return sum(1 for y in range(10, h - 10) if (pa[y] and not near(sb, y)) or (sb[y] and not near(pa, y))) / (h - 20)
print(min(score(dy) for dy in range(-8, 9)))
`;
  return Number(execFileSync('python3', ['-I', '-c', script, a, b]).toString().trim());
}

async function exportAndCompare(page, key, previewShots) {
  const dir = path.join(output, key.replaceAll('/', '-'));
  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
  const download = await downloadPromise;
  const pdfPath = path.join(dir, 'download.pdf');
  await download.saveAs(pdfPath);
  execFileSync('pdftoppm', ['-r', '96', '-png', pdfPath, path.join(dir, 'pdf')]);
  const pdfPages = fs.readdirSync(dir).filter(f => /^pdf-\d+\.png$/.test(f)).sort();
  assert.equal(pdfPages.length, previewShots.length, `${key}: the PDF must have as many pages as the preview`);
  return pdfPages.map((file, i) => textRowMismatch(previewShots[i], path.join(dir, file)));
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const draft = { dosageSchemaVersion: 1, ...scenario.draft };
  await page.addInitScript(({ key, draft }) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(draft)); }, { key: `rxDraft:${patient.id}:${visitId}`, draft });
  await page.context().addCookies([{ name: 'auth_token', value: 'synthetic-browser-fixture', url: baseUrl }]);
  const visit = { id: visitId, patientId: patient.id, doctorId: doctor.id, patient, doctor, complaints: draft.chiefComplaints ? [{ complaint: draft.chiefComplaints }] : [], history: {}, exam: {}, vitals: scenario.vitals, plan: { followUpDate: scenario.reviewDate, followUpInstructions: draft.followUpInstructions || '' }, diagnosis: [], createdAt: '2026-10-25T09:00:00Z' };
  await page.route('**/api/**', route => {
    const request = route.request();
    const name = new URL(request.url()).pathname.slice(4);
    let body = [];
    if (request.method() !== 'GET') {
      if (name.startsWith('/visits/')) body = { ...visit, version: 2 };
      else if (name.startsWith('/prescriptions')) body = { id: 'rx-synthetic-matrix', prescription: { id: 'rx-synthetic-matrix' } };
      else body = { ok: true };
    } else if (name === '/auth/me' || name === `/users/${doctor.id}`) body = doctor;
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

  const results = {};
  try {
    await page.goto(`${baseUrl}/dashboard/visits?visitId=${visitId}`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.getByRole('tab', { name: /^\s*Prescription\b/ }).first().click({ timeout: 60000 });
    await page.waitForFunction(names => names.every(name => [...document.querySelectorAll('input')].some(input => input.value === name)), draft.items.map(item => item.drugName), { timeout: 60000 });
    await page.getByRole('button', { name: 'Print Preview', exact: true }).click();
    await page.waitForSelector('#pagedjs-container .pagedjs_page', { timeout: 60000 });
    await page.addStyleTag({ content: '[data-matrix-hidden] { visibility: hidden !important; }' });
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('#pagedjs-container') || el.querySelector('#pagedjs-container')) continue;
        const position = getComputedStyle(el).position;
        if (position === 'fixed' || position === 'sticky') el.setAttribute('data-matrix-hidden', '');
      }
    });

    for (const { layout, spacing } of states) {
      const key = `${scenario.name}/${layout}/${spacing}`;
      await setOptimized(page, layout === 'optimized');
      await setSpacing(page, spacing);
      await settle(page);
      const state = await measure(page);
      results[`${layout}/${spacing}`] = state;

      assert.equal(state.rxRows, draft.items.length, `${key}: every medicine must render`);
      assert(state.signatureOnLastPage, `${key}: the signature must render on the last page`);
      for (const [i, p] of state.pages.entries()) {
        assert(p.firstTextTop !== null, `${key}: page ${i + 1} must not be blank`);
        assert(p.firstTextTop >= p.height * 0.16, `${key}: page ${i + 1} text starts at ${Math.round(p.firstTextTop)}px, inside the letterhead band`);
      }
      for (const [name, f] of Object.entries(state.fields)) {
        assert.equal(f.fontSize, 14, `${key}: ${name} text size must stay 14px`);
        if (expectedLineHeight[spacing]) assert(Math.abs(f.lineHeight - 14 * expectedLineHeight[spacing]) < 0.6, `${key}: ${name} line height ${f.lineHeight}px must follow ${spacing} spacing`);
        if (layout === 'optimized' && inlineLabels.includes(name)) {
          assert(Math.abs(f.labelTop - f.valueTop) < 3, `${key}: ${name} heading and value must share a line`);
          assert(f.valueLeft > f.labelRight, `${key}: ${name} value must follow its heading`);
        }
      }
      if (layout === 'optimized' && scenario.fitsOnePageOptimized) assert.equal(state.pageCount, 1, `${key}: must fit on one page`);

      const shots = [];
      const dir = path.join(output, key.replaceAll('/', '-'));
      fs.mkdirSync(dir, { recursive: true });
      const pageEls = page.locator('#pagedjs-container .pagedjs_page');
      for (let i = 0; i < state.pageCount; i++) {
        const shot = path.join(dir, `preview-${i + 1}.png`);
        await pageEls.nth(i).screenshot({ path: shot });
        shots.push(shot);
      }
      if (exportStates.has(key)) {
        state.pdfDiff = await exportAndCompare(page, key, shots);
        for (const [i, diff] of state.pdfDiff.entries()) assert(diff < Number(process.env.PRINT_MATRIX_MAX_MISMATCH || 0.06), `${key}: PDF page ${i + 1} text rows differ from the preview (${(diff * 100).toFixed(1)}% of rows)`);
        await settle(page);
      }
      console.log(`PASS ${key}: ${state.pageCount} page(s), height ${state.height}px${state.pdfDiff ? `, PDF row mismatch ${state.pdfDiff.map(d => `${(d * 100).toFixed(1)}%`).join('/')}` : ''}`);
    }

    for (const layout of ['normal', 'optimized']) {
      const [n, c, t] = ['normal', 'compact', 'tight'].map(spacing => results[`${layout}/${spacing}`].height);
      assert(n > c && c > t, `${scenario.name}/${layout}: height must shrink as spacing tightens (${n} > ${c} > ${t})`);
    }
    return results;
  } catch (error) {
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `${scenario.name}-failure.png`) });
    throw error;
  } finally {
    await page.close();
  }
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  const summary = {};
  try {
    for (const scenario of scenarios) {
      if (only && !only.includes(scenario.name)) continue;
      summary[scenario.name] = await runScenario(browser, scenario);
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2));
  }
  console.log(`PASS print matrix: ${Object.keys(summary).length} scenarios x ${states.length} layout states`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
