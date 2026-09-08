// Synthetic browser acceptance test. API URL must point to the isolated Nest fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer-core');
const output = path.resolve(__dirname, '../../output/prescription-browser');
const base = process.env.RX_FRONTEND_URL || 'http://localhost:3000';
const backend = process.env.RX_TEST_API_URL;
assert(backend && new URL(backend).hostname === '127.0.0.1', 'Use the isolated localhost fixture');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-first-run'] });
  const page = await browser.newPage();
  const errors = [], requests = [], consoleMessages = [];
  const checks = [];
  let failNextSave = false;
  const pass = name => { checks.push(name); console.log('PASS', name); };
  const button = async text => {
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(e => e.textContent.trim() === text && e.getBoundingClientRect().height > 0), text);
    assert(handle.asElement(), `Button not found: ${text}`);
    await handle.asElement().asLocator().click();
  };
  const field = async (label, value) => {
    const handle = await page.evaluateHandle(label => {
      const l = [...document.querySelectorAll('label')].find(e => e.textContent.trim() === label && e.getBoundingClientRect().height > 0);
      return l?.parentElement.querySelector('input:not([type="checkbox"]),textarea');
    }, label);
    assert(handle.asElement(), `Field not found: ${label}`);
    await handle.asElement().focus();
    await handle.asElement().evaluate(e => e.select());
    await page.keyboard.sendCharacter(value);
    assert.equal(await handle.asElement().evaluate(e => e.value), value, `Input retained: ${label}`);
  };
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: output, eventsEnabled: true });
  const downloads = [];
  cdp.on('Browser.downloadWillBegin', e => downloads.push(e));
  const downloadPdf = async (fileName) => {
    const expectedPages = await page.$$eval('#pagedjs-container .pagedjs_page', pages => pages.length);
    let handler;
    const completed = new Promise((resolveDownload, reject) => {
      const timer = setTimeout(() => { cdp.off('Browser.downloadProgress', handler); reject(new Error('No completed browser download after 45 seconds')); }, 45000);
      handler = e => { if (e.state === 'completed') { clearTimeout(timer); cdp.off('Browser.downloadProgress', handler); resolveDownload(e); } };
      cdp.on('Browser.downloadProgress', handler);
    });
    await button('Download PDF');
    await completed;
    const downloaded = path.join(output, downloads.at(-1).suggestedFilename);
    assert(fs.readFileSync(downloaded).subarray(0, 5).toString() === '%PDF-');
    const info = execFileSync('pdfinfo', [downloaded]).toString();
    assert.equal(Number(info.match(/Pages:\s+(\d+)/)[1]), expectedPages, 'Export must match preview page count');
    fs.copyFileSync(downloaded, path.join(output, fileName));
    return downloaded;
  };
  await page.setViewport({ width: 1500, height: 1100 });
  await page.setCookie({ name: 'auth_token', value: 'synthetic-browser-fixture', url: base });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', async msg => {
    const details = msg.type() === 'error' ? await Promise.all(msg.args().map(a => a.evaluate(v => v?.stack || v?.message || String(v)).catch(() => ''))) : [];
    consoleMessages.push({ type: msg.type(), text: msg.text(), details });
    if (msg.type() === 'error') console.log('BROWSER ERROR', ...details);
  });
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    if (url.origin === base && url.pathname.startsWith('/api/')) {
      try {
        if (failNextSave && request.method() === 'PATCH' && url.pathname === '/api/prescriptions/pipeline-rx') {
          failNextSave = false;
          requests.push({ method: 'PATCH', path: url.pathname, status: 400, expectedFailure: true });
          return await request.respond({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic save failure - draft retained' }) });
        }
        const response = await fetch(backend + url.pathname.slice(4) + url.search, {
          method: request.method(), headers: { 'content-type': 'application/json', ...(request.headers()['idempotency-key'] ? { 'idempotency-key': request.headers()['idempotency-key'] } : {}) },
          body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postData(),
        });
        const body = await response.text();
        requests.push({ method: request.method(), path: url.pathname, status: response.status, body: response.status >= 400 ? body : undefined });
        await request.respond({ status: response.status, contentType: 'application/json', body });
      } catch (e) { errors.push(e.message); await request.abort(); }
    } else await request.continue();
  });
  try {
    await page.goto(`${base}/dashboard/visits?visitId=${process.env.RX_TEST_VISIT_ID}`, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForSelector('[role="tab"]', { timeout: 60000 });
    await page.locator('::-p-text(Prescription)').click();
    await new Promise(r => setTimeout(r, 1500));
    assert(await page.$eval('button::-p-text(Create Prescription)', e => e.disabled));
    pass('Empty medication list prevents prescription creation');
    for (const [label, value] of Object.entries({
      'Chief Complaints': 'BROWSER TEST complaint', 'Diagnosis': 'BROWSER TEST diagnosis',
      'Past History': 'BROWSER TEST past history', 'Medication History': 'BROWSER TEST medication history',
      'Menstrual History': 'BROWSER TEST menstrual history', 'Triggers': 'BROWSER TEST triggers',
      'Prior Treatments': 'BROWSER TEST prior treatment', 'Procedures': 'BROWSER TEST procedure',
      'Procedure Planned': 'BROWSER TEST planned procedure', 'Follow-up Instructions': 'BROWSER TEST follow up',
    })) await field(label, value);
    await page.type('textarea[placeholder="Detailed physical examination findings..."]', 'BROWSER TEST examination');
    await field('Height (cm)', '170');
    await field('Weight (kg)', '65');
    await field('BP (Sys)', '120');
    await field('BP (Dia)', '80');
    await field('Pulse (bpm)', '72');
    await button('Papule');
    await button('Face');
    await button('III');
    const cbc = await page.evaluateHandle(() => [...document.querySelectorAll('label')].find(e => e.textContent.trim() === 'CBC' && e.getBoundingClientRect().height > 0)?.querySelector('input'));
    await cbc.asElement().click();
    pass('Clinical sections accept input: vitals, complaints, diagnosis, histories, examination, procedures, investigations and follow-up');
    await button('Add Row');
    await page.type('input[placeholder="Search medicine name..."]', 'SYNTHETIC BROWSER MEDICINE');
    await button('1-0-1');
    await button('5d');
    await page.type('input[placeholder="e.g., Avoid alcohol"]', 'TEST ONLY instructions');
    await button('Add Row');
    await page.waitForFunction(() => document.querySelectorAll('input[placeholder="Search medicine name..."]').length === 3);
    const remove = await page.evaluateHandle(() => {
      const inputs = [...document.querySelectorAll('input[placeholder="Search medicine name..."]')];
      return [...inputs[1].closest('tr').querySelectorAll('button')].find(e => e.textContent.trim() === 'Remove');
    });
    await remove.asElement().asLocator().click();
    await page.waitForFunction(() => document.querySelectorAll('input[placeholder="Search medicine name..."]').length === 2);
    pass('Medication add/remove and dose/duration presets');
    await button('Create Prescription');
    await page.waitForFunction(() => document.body.innerText.includes('Prescription created'), { timeout: 20000 });
    pass('Prescription created through real HTTP controller and service');
    await button('Stay Here');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    const saved = await (await fetch(backend + '/prescriptions/pipeline-rx')).json();
    assert.equal(saved.items[0].drugName, 'SYNTHETIC BROWSER MEDICINE');
    assert.equal(saved.items[0].dosePattern, '1-0-1');
    assert.equal(saved.items[0].duration, 5);
    pass('Saved medication readback matches browser input');
    const visit = await (await fetch(backend + '/visits/' + process.env.RX_TEST_VISIT_ID)).json();
    const exam = typeof visit.exam === 'string' ? JSON.parse(visit.exam) : visit.exam;
    assert.equal(exam.generalAppearance, 'BROWSER TEST examination');
    pass('Detailed examination findings persist on the visit');
    await button('Print Preview');
    await page.waitForSelector('#pagedjs-container .pagedjs_page', { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#pagedjs-container')?.innerText.includes('SYNTHETIC BROWSER MEDICINE'));
    const previewText = await page.$eval('#pagedjs-container', e => e.innerText);
    fs.writeFileSync(path.join(output, 'preview.txt'), previewText);
    for (const expected of ['SYNTHETIC BROWSER MEDICINE', 'BROWSER TEST diagnosis', 'BROWSER TEST complaint']) assert(previewText.includes(expected), `Preview missing: ${expected}`);
    pass('Paged preview contains saved clinical fields and medication');
    await downloadPdf('initial-prescription.pdf');
    pass('Download completes with valid PDF bytes and exactly the preview page count');
    await button('PDF via WhatsApp');
    await page.waitForFunction(() => document.body.innerText.includes('No phone number'));
    assert.equal(downloads.length, 1);
    pass('WhatsApp blocks sharing when the patient has no phone number');
    await button('Close');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await button('Save current');
    await page.waitForSelector('input[placeholder="Dermatology follow-up"]');
    await page.type('input[placeholder="Dermatology follow-up"]', 'SYNTHETIC BROWSER TEMPLATE');
    await button('Save Template');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    const templates = await (await fetch(backend + '/prescriptions/templates')).json();
    assert.equal(templates.templates[0].items[0].drugName, 'SYNTHETIC BROWSER MEDICINE');
    pass('Save current template persists medications and clinical metadata');
    await button('Save fields');
    await page.waitForSelector('input[placeholder="E.g., Derm Fields: Acne follow-up"]');
    await page.type('input[placeholder="E.g., Derm Fields: Acne follow-up"]', 'SYNTHETIC FIELDS TEMPLATE');
    await button('Save Fields Template');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    const fields = await (await fetch(backend + '/prescriptions/templates')).json();
    assert.equal(fields.templates.length, 2);
    assert.equal(fields.templates[1].metadata.examination.generalAppearance, 'BROWSER TEST examination');
    pass('Fields-only template preserves examination findings');
    await field('Diagnosis', 'BROWSER TEST UPDATED diagnosis');
    const medicine = await page.$('input[placeholder="Search medicine name..."]');
    await medicine.focus();
    await medicine.evaluate(e => e.select());
    await page.keyboard.type('SYNTHETIC UPDATED MEDICINE');
    await button('Print Preview');
    await page.waitForFunction(() => document.querySelector('#pagedjs-container')?.innerText.includes('SYNTHETIC UPDATED MEDICINE'));
    await downloadPdf('updated-prescription.pdf');
    const updated = await (await fetch(backend + '/prescriptions/pipeline-rx')).json();
    assert.equal(updated.items[0].drugName, 'SYNTHETIC UPDATED MEDICINE');
    assert.notDeepEqual(fs.readFileSync(path.join(output, 'initial-prescription.pdf')), fs.readFileSync(path.join(output, 'updated-prescription.pdf')));
    pass('Editing then downloading saves the current prescription and creates a fresh PDF');
    await button('Close');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('[role="tab"]');
    await page.locator('::-p-text(Prescription)').click();
    await page.waitForFunction(() => [...document.querySelectorAll('input')].some(e => e.value === 'SYNTHETIC UPDATED MEDICINE'));
    pass('Reload restores the saved prescription');
    await button('New template');
    await page.waitForSelector('input[placeholder="e.g., Acne follow-up (Derm)"]');
    await page.type('input[placeholder="e.g., Acne follow-up (Derm)"]', 'SYNTHETIC EMPTY TEMPLATE');
    await button('Create Template');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal((await (await fetch(backend + '/prescriptions/templates')).json()).templates.length, 3);
    pass('New template dialog creates a reusable template');
    await button('Reset to default');
    await page.waitForFunction(() => document.querySelectorAll('input[placeholder="Search medicine name..."]').length === 0);
    await button('No template');
    const template = await page.waitForSelector('[role="menuitem"]::-p-text(SYNTHETIC BROWSER TEMPLATE)');
    await template.asLocator().click();
    await page.waitForFunction(() => [...document.querySelectorAll('input')].some(e => e.value === 'SYNTHETIC BROWSER MEDICINE'));
    pass('Reset and apply saved template restores its medications');
    await page.waitForFunction(() => !document.querySelector('[role="menu"]'));
    await button('SYNTHETIC BROWSER TEMPLATE');
    await page.waitForSelector('[role="menuitem"] button[title="Delete template"]', { visible: true });
    const deleteTemplate = await page.evaluateHandle(() => [...document.querySelectorAll('[role="menuitem"]')].find(e => e.textContent.includes('SYNTHETIC EMPTY TEMPLATE'))?.querySelector('button[title="Delete template"]'));
    await deleteTemplate.asElement().click();
    await page.waitForFunction(() => ![...document.querySelectorAll('[role="menuitem"]')].some(e => e.textContent.includes('SYNTHETIC EMPTY TEMPLATE')));
    await page.locator('::-p-text(Visit Documentation)').click();
    await page.waitForFunction(() => !document.querySelector('[role="menu"]'));
    assert.equal((await (await fetch(backend + '/prescriptions/templates')).json()).templates.length, 2);
    pass('Delete removes only the selected synthetic template');
    await field('Past History', Array.from({ length: 45 }, (_, i) => `SYNTHETIC HISTORY LINE ${i + 1}: browser pagination test.`).join('\n'));
    await button('Print Preview');
    await page.waitForFunction(() => document.querySelectorAll('#pagedjs-container .pagedjs_page').length > 1);
    await page.waitForFunction(() => document.querySelector('#pagedjs-container')?.innerText.includes('SYNTHETIC HISTORY LINE 45'));
    await downloadPdf('multipage-prescription.pdf');
    pass('Long clinical history exports across multiple pages without extra blank pages');
    const countBeforeFailure = downloads.length;
    failNextSave = true;
    await button('Download PDF');
    await page.waitForFunction(() => document.body.innerText.includes('Synthetic save failure'));
    assert.equal(downloads.length, countBeforeFailure);
    pass('Failed prescription save blocks PDF download and displays the error');
    await downloadPdf('recovered-prescription.pdf');
    pass('Retry after failed save succeeds');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, 'workflow.png'), fullPage: true });
  } finally {
    await page.screenshot({ path: path.join(output, 'last-state.png'), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, 'last-state.txt'), await page.evaluate(() => document.body.innerText).catch(() => ''));
    fs.writeFileSync(path.join(output, 'network.json'), JSON.stringify({ checks, downloads, errors, requests, consoleMessages }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
