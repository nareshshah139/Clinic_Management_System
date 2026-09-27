const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const output = path.resolve(__dirname, '../../output/cr08-print-layout');
const baseUrl = process.env.CR08_BASE_URL || 'http://localhost:3000';
const patient = { id: '00000000-0000-4000-8000-000000000001', name: 'SYNTHETIC CR08 PATIENT', gender: 'FEMALE', age: 36, branchId: 'synthetic' };
const doctor = { id: '00000000-0000-4000-8000-000000000002', firstName: 'Test', lastName: 'Doctor', role: 'DOCTOR', branchId: 'synthetic', isActive: true };
const visitId = '00000000-0000-4000-8000-000000000003';
const scenarios = [
  { name: 'short', complaints: 'itching scalp, 2 weeks', followUp: 'review with reports', reviewDate: '2026-10-10' },
  { name: 'long', complaints: `${'Itching scalp and persistent flaking for two weeks. '.repeat(8)}\nWorse after shampooing.`, followUp: `${'Bring all reports and review the response to treatment. '.repeat(8)}${'longword'.repeat(30)}`, reviewDate: '2026-10-10' },
  { name: 'empty', complaints: '', followUp: '', reviewDate: '' },
];

async function clickText(page, text) {
  await page.waitForFunction(text => [...document.querySelectorAll('button, [role="tab"]')].some(el => el.textContent.trim() === text && el.getBoundingClientRect().height), { timeout: 30000 }, text);
  const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button, [role="tab"]')].find(el => el.textContent.trim() === text && el.getBoundingClientRect().height), text);
  assert(handle.asElement(), `Missing control: ${text}`);
  await handle.asElement().asLocator().click();
}

async function measureFields(page, optimized) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const animation of document.getAnimations()) {
      try { animation.finish(); } catch {}
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  return page.evaluate(optimized => {
    const root = document.querySelector('#pagedjs-container');
    return ['Chief Complaints', 'Review Date', optimized ? 'Follow-up' : 'Follow-up Instructions'].map(name => {
      const label = [...root.querySelectorAll('div')].find(el => el.children.length === 0 && el.textContent.trim() === `${name}${optimized ? ':' : ''}`);
      if (!label) return null;
      const value = label.nextElementSibling;
      const labelRect = label.getBoundingClientRect();
      const valueRect = value.getBoundingClientRect();
      const range = document.createRange();
      // pre-wrap allows trailing spaces to hang past the edge; measure visible words.
      const lines = [];
      const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        for (const word of walker.currentNode.textContent.matchAll(/\S+/g)) {
          range.setStart(walker.currentNode, word.index);
          range.setEnd(walker.currentNode, word.index + word[0].length);
          for (const rect of range.getClientRects()) {
            if (rect.width <= 0) continue;
            const line = lines.find(line => Math.abs(line.top - rect.top) < 1);
            if (line) { line.left = Math.min(line.left, rect.left); line.right = Math.max(line.right, rect.right); }
            else lines.push({ left: rect.left, right: rect.right, top: rect.top });
          }
        }
      }
      return { name, text: value.textContent, labelTop: labelRect.top, labelLeft: labelRect.left, labelRight: labelRect.right, valueTop: valueRect.top, valueLeft: valueRect.left, valueRight: valueRect.right, rowHeight: label.parentElement.getBoundingClientRect().height, lines };
    });
  }, optimized);
}

async function toggleOptimized(page, enabled) {
  const checkbox = await page.evaluateHandle(() => [...document.querySelectorAll('label')].find(el => el.textContent.trim() === 'Space-optimized layout')?.querySelector('input'));
  assert.equal(await checkbox.evaluate(el => el.checked), !enabled);
  await checkbox.asElement().asLocator().click();
  // The normal layout has a separate date line; wait for the regenerated pages.
  await page.waitForFunction(enabled => {
    const content = document.querySelector('#pagedjs-container #prescription-print-content');
    return content && !!content.querySelector(':scope > .text-gray-700') === !enabled;
  }, {}, enabled);
}

/**
 * @cc [owner:nareshshah139,label:testing] synthetic-print-layout-check
 * Browser checks MUST replace every API request with synthetic responses so
 * opening the prescription editor cannot read or modify real clinical records.
 */
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run'] });
  const results = [];
  try {
    for (const scenario of scenarios) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1500, height: 1100 });
      await page.evaluateOnNewDocument(() => localStorage.clear());
      await page.setCookie({ name: 'auth_token', value: 'synthetic-browser-fixture', url: baseUrl });
      const visit = { id: visitId, patientId: patient.id, doctorId: doctor.id, patient, doctor, complaints: scenario.complaints ? [{ complaint: scenario.complaints }] : [], history: {}, exam: {}, plan: { followUpDate: scenario.reviewDate, followUpInstructions: scenario.followUp }, diagnosis: [], createdAt: '2026-09-27T09:00:00Z' };
      await page.setRequestInterception(true);
      page.on('request', async request => {
        const url = new URL(request.url());
        if (!url.pathname.startsWith('/api/')) return request.continue();
        const route = url.pathname.slice(4);
        let body = [];
        if (route === '/auth/me' || route === `/users/${doctor.id}`) body = doctor;
        else if (route === '/users') body = { users: [doctor] };
        else if (route === '/patients') body = { patients: [patient], total: 1 };
        else if (route === `/patients/${patient.id}`) body = patient;
        else if (route === `/visits/${visitId}`) body = visit;
        else if (route.startsWith('/visits/patient/')) body = { visits: [visit], pagination: { hasMore: false } };
        else if (route.endsWith('/personal-history')) body = { personalHistory: null };
        else if (route.endsWith('/next-appointment')) body = null;
        else if (route === '/prescriptions/templates') body = { templates: [] };
        else if (route.startsWith('/prescriptions/doctor/')) body = { prescriptions: [] };
        else if (route === '/billing/invoices') body = { invoices: [] };
        else if (route === '/drugs') body = { drugs: [] };
        await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      try {
        await page.goto(`${baseUrl}/dashboard/visits?visitId=${visitId}`, { waitUntil: 'networkidle2', timeout: 60000 });
        await clickText(page, 'Prescription');
        await page.waitForFunction(value => document.querySelector('#section-chief-complaints-content textarea')?.value === value, {}, scenario.complaints);
        await page.$eval('input[type="date"]', (input, value) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, scenario.reviewDate);
        await page.waitForFunction(value => document.querySelector('input[type="date"]')?.value === value, {}, scenario.reviewDate);
        await clickText(page, 'Print Preview');
        await page.waitForSelector('#pagedjs-container .pagedjs_page', { timeout: 30000 });
        const normal = await measureFields(page, false);
        if (scenario.name !== 'empty') {
          for (const field of normal) assert(field && field.valueTop > field.labelTop, `Normal heading should be above its value: ${JSON.stringify(field)}`);
        } else assert(normal.every(field => field === null), 'Empty fields must omit their headings');
        await page.screenshot({ path: path.join(output, `${scenario.name}-normal.png`) });
        await toggleOptimized(page, true);
        const optimized = await measureFields(page, true);
        if (scenario.name !== 'empty') {
          for (const field of optimized) {
            assert(field, 'Optimized field and colon label must be present');
            assert(Math.abs(field.labelTop - field.valueTop) < 2, `Heading and value must share a line: ${field.name}`);
            assert(field.valueLeft > field.labelRight, `Value must follow heading: ${field.name}`);
            for (const line of field.lines) {
              assert(Math.abs(line.left - field.valueLeft) < 2, `Wrapped line must align under value: ${field.name}`);
              assert(line.right <= field.valueRight + 2, `Text must stay within page: ${field.name}`);
            }
            if (scenario.name === 'short') {
              assert.equal(field.lines.length, 1, `${field.name} should occupy one line`);
              assert(field.rowHeight < normal.find(item => item.name.startsWith(field.name)).rowHeight, `${field.name} must save vertical space`);
            } else if (field.name !== 'Review Date') assert(field.lines.length > 1, 'Long fixture must wrap');
          }
          assert.equal(optimized[0].text, scenario.complaints);
          assert.equal(optimized[2].text, scenario.followUp);
          assert.equal(optimized[1].text, normal[1].text, 'Review date formatting must be preserved');
        } else assert(optimized.every(field => field === null), 'Optimized layout must omit empty fields');
        await page.screenshot({ path: path.join(output, `${scenario.name}-optimized.png`) });
        await toggleOptimized(page, false);
        const restored = await measureFields(page, false);
        assert.deepEqual(restored.map(field => field && [field.name, field.text]), normal.map(field => field && [field.name, field.text]), 'Unticking must restore the original labels and values');
        for (const field of restored.filter(Boolean)) {
          assert(field.valueTop > field.labelTop, 'Unticking must restore stacked headings');
          assert(Math.abs(field.valueLeft - field.labelLeft) < 2, 'Normal value must align under the heading');
          assert(Math.abs(field.rowHeight - normal.find(item => item.name === field.name).rowHeight) < 2, 'Normal spacing must be restored');
        }
        results.push({ scenario: scenario.name, normal, optimized });
        console.log(`PASS ${scenario.name}: normal → optimized → normal`);
      } catch (error) {
        await page.screenshot({ path: path.join(output, `${scenario.name}-failure.png`) });
        fs.writeFileSync(path.join(output, 'failure.txt'), await page.$eval('body', el => el.innerText));
        throw error;
      } finally {
        await page.close({ runBeforeUnload: false });
      }
    }
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ note: 'Actual local frontend and Chromium Paged.js layout; all API responses synthetic.', results }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
