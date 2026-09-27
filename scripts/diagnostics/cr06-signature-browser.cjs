// Isolated CR-06 acceptance workflow. The Nest fixture supplies all patient data
// and captures email delivery; no production server or recipient is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
const base = `http://127.0.0.1:${process.env.CR06_FRONTEND_PORT || '3016'}`;
const output = path.resolve(__dirname, '../../output/cr06-signature');
const signaturePath = process.env.CR06_SIGNATURE_PATH || path.resolve(__dirname, '../../backend/src/modules/users/assets/Dr_Praneeta_Jain_signature.png');
assert(fs.existsSync(signaturePath), 'Signature PNG was not found');
fs.mkdirSync(output, { recursive: true });
(async () => {
  // Respect the preferred browser for the initial local smoke check. Chromium
  // handles native print CSS, file uploads and visual/PDF comparison below.
  const obscura = spawnSync('/Users/nshah/.local/share/obscura/v0.2.2/obscura', ['--allow-private-network', 'fetch', `${base}/login`, '--dump', 'text', '--timeout', '15'], { encoding: 'utf8', timeout: 20000 });
  fs.writeFileSync(path.join(output, 'obscura-smoke.txt'), String(obscura.stdout || '') + String(obscura.stderr || ''));
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-first-run'], protocolTimeout: 30000 });
  const page = await browser.newPage();
  // The visit screen protects unsaved edits with a beforeunload dialog.
  page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    // Keep the acceptance run local, including fonts and messaging.
    if (/^https?:/.test(url) && !url.startsWith(base + '/')) void request.abort();
    else void request.continue();
  });
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  const checks = [], errors = [];
  const pass = text => { checks.push(text); console.log('PASS', text); };
  const button = async text => {
    await page.waitForFunction(text => [...document.querySelectorAll('button')].some(e => e.textContent.trim() === text && e.getBoundingClientRect().height > 0 && !e.disabled), { timeout: 60000 }, text);
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(e => e.textContent.trim() === text && e.getBoundingClientRect().height > 0 && !e.disabled), text);
    assert(handle.asElement(), `Enabled button not found: ${text}`);
    await handle.asElement().asLocator().click();
  };
  const ready = async enabled => {
    await page.waitForFunction(enabled => {
      const container = document.getElementById('pagedjs-container');
      const print = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Print' && e.getBoundingClientRect().height > 0);
      return container?.querySelector('.pagedjs_page') && !!container.querySelector('img[data-doctor-signature]') === enabled && print && !print.disabled;
    }, { timeout: 60000 }, enabled);
  };
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: output, eventsEnabled: true });
  let downloadName;
  cdp.on('Browser.downloadWillBegin', event => { downloadName = event.suggestedFilename; });
  const download = async name => {
    let handler;
    const done = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cdp.off('Browser.downloadProgress', handler); reject(new Error('Download timed out')); }, 60000);
      handler = event => { if (event.state === 'completed') { clearTimeout(timer); cdp.off('Browser.downloadProgress', handler); resolve(); } };
      cdp.on('Browser.downloadProgress', handler);
    });
    await button('Download PDF');
    await done;
    fs.copyFileSync(path.join(output, downloadName), path.join(output, name));
    assert.equal(fs.readFileSync(path.join(output, name)).subarray(0, 5).toString(), '%PDF-');
  };
  await page.setViewport({ width: 1500, height: 1100 });
  await page.setCookie({ name: 'auth_token', value: 'synthetic-signature', url: base });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(base + '/api/') && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.evaluateOnNewDocument(() => {
    const base64 = async file => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let raw = ''; for (let i = 0; i < bytes.length; i += 8192) raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(raw);
    };
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__whatsappPdf = await base64(data.files[0]); } });
    const fetchOriginal = window.fetch;
    window.fetch = async (input, init) => {
      if (String(input).includes('/share-preview')) window.__emailPdf = await base64(init.body.get('file'));
      return fetchOriginal(input, init);
    };
    window.print = () => { window.__printSignature = document.querySelector('#prescription-print-host img[data-doctor-signature]')?.src || null; window.__printCalled = true; };
  });
  try {
    await page.goto(`${base}/dashboard/visits?visitId=00000000-0000-4000-8000-000000000003`, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForSelector('button[aria-label="Open settings"]', { timeout: 60000 });
    await page.click('button[aria-label="Open settings"]');
    await page.waitForSelector('#doctor-signature-file:not([disabled])');
    const defaultUrl = await page.$eval('img[alt="Your saved signature"]', image => image.src);
    assert.deepEqual(Buffer.from(defaultUrl.split(',')[1], 'base64'), fs.readFileSync(signaturePath));
    pass('Supplied signature is available by default before any upload');
    await (await page.$('#doctor-signature-file')).uploadFile(signaturePath);
    await page.waitForFunction(() => document.body.innerText.includes('Signature saved.'));
    const original = await sharp(signaturePath).metadata();
    const savedUrl = await page.$eval('img[alt="Your saved signature"]', image => image.src);
    const saved = await sharp(Buffer.from(savedUrl.split(',')[1], 'base64')).metadata();
    assert.equal(saved.hasAlpha, original.hasAlpha);
    await page.screenshot({ path: path.join(output, 'settings-desktop.png') });
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('[role=dialog]').scrollTop = 0; });
    await new Promise(resolve => setTimeout(resolve, 250));
    await page.screenshot({ path: path.join(output, 'settings-mobile.png') });
    assert(await page.$eval('[role="dialog"]', element => element.scrollWidth <= element.clientWidth + 1));
    await page.setViewport({ width: 1500, height: 1100 });
    await button('Close');
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
    pass('Supplied PNG uploaded through doctor settings; transparency preserved; mobile settings fit');
    await page.locator('[role=tab]::-p-text(Prescription)').click();
    await page.waitForSelector('[role=tab][data-state=active]::-p-text(Prescription)');
    await page.waitForFunction(() => [...document.querySelectorAll('input')].some(e => e.value === 'SYNTHETIC TEST MEDICINE'));
    await button('Print Preview');
    await ready(false);
    console.log('CHECK unsigned preview ready');
    const toggle = async () => {
      const element = await page.evaluateHandle(() => [...document.querySelectorAll('label')].find(e => e.textContent.trim() === 'Show signature')?.querySelector('input'));
      await element.asElement().asLocator().click();
    };
    await toggle();
    await ready(true);
    console.log('CHECK signed preview ready before reload');
    await toggle();
    await ready(false);
    await button('Close');
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[role=tab]::-p-text(Prescription)').click();
    await page.waitForSelector('[role=tab][data-state=active]::-p-text(Prescription)');
    await button('Print Preview');
    await ready(false);
    assert.equal(await page.evaluate(() => localStorage.getItem('cms:prescription:showSignature:doctor-1')), 'false');
    await toggle();
    await ready(true);
    console.log('CHECK signed preview ready before reload');
    await button('Close');
    await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[role=tab]::-p-text(Prescription)').click();
    await page.waitForSelector('[role=tab][data-state=active]::-p-text(Prescription)');
    await button('Print Preview');
    await ready(true);
    pass('Both unchecked and checked choices survive a reload');
    const signature = await page.$eval('#pagedjs-container img[data-doctor-signature]', image => {
      const img = image.getBoundingClientRect(), name = image.nextElementSibling.getBoundingClientRect();
      return { src: image.src, width: img.width, height: img.height, aboveName: img.bottom <= name.top + 1, text: image.nextElementSibling.textContent };
    });
    assert.equal(signature.src, savedUrl);
    assert(signature.aboveName);
    assert(signature.text.includes('Dr. Praneeta Jain'));
    assert(signature.width <= 160 && signature.height <= 72);
    assert(Math.abs(signature.width / signature.height - original.width / original.height) < 0.02, 'Signature aspect ratio must match original');
    await page.screenshot({ path: path.join(output, 'preview-signed-desktop.png') });
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.querySelector('#pagedjs-container img[data-doctor-signature]').scrollIntoView({ block: 'center', inline: 'center' });
      [...document.querySelectorAll('label')].find(e => e.textContent.trim() === 'Show signature').scrollIntoView({ block: 'center' });
    });
    await new Promise(resolve => setTimeout(resolve, 250));
    await page.screenshot({ path: path.join(output, 'preview-signed-mobile.png') });
    assert(await page.evaluate(() => { const box = [...document.querySelectorAll('label')].find(e => e.textContent.trim() === 'Show signature').getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight; }), 'Mobile signature control must remain reachable');
    await page.setViewport({ width: 1500, height: 1100 });
    pass('Signature appears above Dr. Praneeta Jain at a bounded size');
    await button('Print');
    await page.waitForFunction(() => window.__printCalled);
    assert.equal(await page.evaluate(() => window.__printSignature), savedUrl);
    await page.pdf({ path: path.join(output, 'signed-print.pdf'), preferCSSPageSize: true, printBackground: true });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await download('signed-download.pdf');
    await button('PDF via WhatsApp');
    await page.waitForFunction(() => window.__whatsappPdf, { timeout: 60000 });
    fs.writeFileSync(path.join(output, 'signed-whatsapp.pdf'), Buffer.from(await page.evaluate(() => window.__whatsappPdf), 'base64'));
    await button('Email');
    await page.waitForFunction(() => document.body.innerText.includes('Prescription PDF sent by email.'), { timeout: 60000 });
    fs.writeFileSync(path.join(output, 'signed-email.pdf'), Buffer.from(await page.evaluate(() => window.__emailPdf), 'base64'));
    const hashes = [];
    for (const name of ['signed-download', 'signed-whatsapp', 'signed-email']) {
      execFileSync('pdftoppm', ['-png', '-r', '96', '-singlefile', path.join(output, name + '.pdf'), path.join(output, name)]);
      const raw = await sharp(path.join(output, name + '.png')).raw().toBuffer();
      hashes.push(createHash('sha256').update(raw).digest('hex'));
    }
    assert.equal(new Set(hashes).size, 1, 'Download, WhatsApp and Email must render identically');
    pass('Print includes the signature; download, WhatsApp and Email PDFs render identically');
    await toggle();
    await ready(false);
    await page.screenshot({ path: path.join(output, 'preview-unsigned-desktop.png') });
    await download('unsigned-download.pdf');
    execFileSync('pdftoppm', ['-png', '-r', '96', '-singlefile', path.join(output, 'unsigned-download.pdf'), path.join(output, 'unsigned-download')]);
    await page.evaluate(() => { window.__printCalled = false; });
    await button('Print');
    await page.waitForFunction(() => window.__printCalled);
    assert.equal(await page.evaluate(() => window.__printSignature), null);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    pass('Unticking removes the image from preview, print and PDF');
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ checks, errors, pdfRasterSha256: hashes, sourceImage: { width: original.width, height: original.height, hasAlpha: original.hasAlpha } }, null, 2));
    assert.equal(errors.length, 0, errors.join('\n'));
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), timeout: 5000 }).catch(() => {});
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ message: error.message, errors, checks }, null, 2));
    throw error;
  } finally {
    const closed = await Promise.race([browser.close().then(() => true).catch(() => false), new Promise(resolve => setTimeout(() => resolve(false), 5000))]);
    if (!closed) browser.process()?.kill('SIGKILL');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
