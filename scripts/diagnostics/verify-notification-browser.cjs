const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const base = process.env.FEEDBACK_URL || 'http://127.0.0.1:3000';
const output = path.resolve(__dirname, '../../verification/notification-consistency');

/**
 * @cc [owner:nareshshah139,label:verification] feedback-fixture-isolation
 * Browser verification MUST intercept clinic API calls with synthetic responses and never
 * submit real mutations. A native popup or a delete before explicit acceptance MUST fail.
 */
async function prepare(page) {
  await page.browserContext().setCookie({ name: 'auth_token', value: 'synthetic-feedback-fixture', url: base, httpOnly: true, sameSite: 'Strict' });
  await page.evaluateOnNewDocument(() => {
    const originalFetch = window.fetch.bind(window);
    const user = { id: 'feedback-user', firstName: 'Asha', lastName: 'Patel', email: 'asha@example.test', role: 'ADMIN', isActive: true, status: 'ACTIVE', branchId: 'feedback-branch' };
    const room = { id: 'feedback-room', name: 'Consultation room', type: 'Consultation', capacity: 1, isActive: true, createdAt: '2026-01-01T00:00:00Z' };
    window.feedbackFixture = { deletes: 0, native: 0, failDelete: false };
    for (const name of ['alert', 'confirm', 'prompt']) window[name] = () => { window.feedbackFixture.native++; throw new Error(`Unexpected native ${name}`); };
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!url.pathname.startsWith('/api/')) return originalFetch(input, init);
      const endpoint = url.pathname.slice(4);
      const method = init?.method || (typeof input !== 'string' && input.method) || 'GET';
      let body = [];
      let status = 200;
      if (method === 'DELETE' && endpoint === '/appointments/rooms/feedback-room') {
        if (window.feedbackFixture.failDelete) { status = 409; body = { message: 'Room is still in use.' }; }
        else { window.feedbackFixture.deletes++; body = { success: true }; }
      } else if (method !== 'GET') { status = 409; body = { message: 'Synthetic verification blocks this mutation.' }; }
      else if (endpoint === '/auth/me' || endpoint === '/users/feedback-user') body = user;
      else if (endpoint.startsWith('/appointments/rooms')) body = { rooms: window.feedbackFixture.deletes ? [] : [room] };
      else if (endpoint.startsWith('/appointments')) body = { appointments: [], total: 0 };
      else if (endpoint === '/users') body = { users: [user], total: 1 };
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    };
  });
}

async function clickText(page, text) {
  await page.waitForFunction(label => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === label), { timeout: 15000 }, text);
  const handle = await page.evaluateHandle(label => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label), text);
  await handle.asElement().click();
  await handle.dispose();
}

async function capture(page, name) {
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  await page.screenshot({ path: path.join(output, name) });
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = process.env.FEEDBACK_BROWSER === 'chrome'
    ? await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run', '--no-default-browser-check'] })
    : await puppeteer.connect({ browserURL: process.env.FEEDBACK_CDP || 'http://127.0.0.1:9223' });
  const page = await browser.newPage();
  const results = [];
  try {
    await prepare(page);
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${base}/dashboard/rooms`, { waitUntil: 'domcontentloaded' });
    await clickText(page, 'Manage Rooms');
    await clickText(page, 'Delete');
    await page.waitForSelector('[role="alertdialog"]', { timeout: 15000 });
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Cancel');
    assert.equal(await page.evaluate(() => window.feedbackFixture.deletes), 0);
    await capture(page, 'confirmation-desktop.png');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Delete room');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Close');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Cancel');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[role="alertdialog"]', { hidden: true });
    assert.equal(await page.evaluate(() => window.feedbackFixture.deletes), 0);
    await page.waitForFunction(() => document.activeElement.textContent.trim() === 'Delete');
    results.push('Escape cancels without deletion; Cancel has initial focus; keyboard reaches acceptance.');
    await clickText(page, 'Delete');
    await clickText(page, 'Cancel');
    assert.equal(await page.evaluate(() => window.feedbackFixture.deletes), 0);
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await clickText(page, 'Delete');
    await page.waitForSelector('[role="alertdialog"]');
    const fits = await page.$eval('[role="alertdialog"]', dialog => { const rect = dialog.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.height <= innerHeight; });
    assert.equal(fits, true, 'Dialog fits the mobile viewport');
    await capture(page, 'confirmation-mobile-dark.png');
    await page.evaluate(() => { window.feedbackFixture.failDelete = true; });
    await clickText(page, 'Delete room');
    await page.waitForFunction(() => document.body.innerText.includes('Failed to delete room'));
    assert.equal(await page.evaluate(() => window.feedbackFixture.deletes), 0);
    await capture(page, 'toast-error.png');
    await page.evaluate(() => { window.feedbackFixture.failDelete = false; document.documentElement.classList.remove('dark'); document.documentElement.classList.add('branded'); });
    await clickText(page, 'Delete');
    await page.waitForSelector('[role="alertdialog"]');
    await capture(page, 'confirmation-mobile-branded.png');
    await clickText(page, 'Delete room');
    await page.waitForFunction(() => window.feedbackFixture.deletes === 1 && document.body.innerText.includes('Room deleted'));
    assert.equal(await page.evaluate(() => window.feedbackFixture.native), 0);
    await capture(page, 'toast-success.png');
    results.push('Cancel preserves room; error leaves room intact; acceptance deletes once and shows shared toast.');
    results.push('Mobile dark and branded dialogs fit; no native popups.');
    await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ browser: process.env.FEEDBACK_BROWSER || 'obscura', results }, null, 2));
    console.log(results.join('\n'));
  } catch (error) {
    console.error(await page.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0,1500) })));
    await page.screenshot({ path: path.join(output, 'browser-failure.png') });
    throw error;
  } finally {
    await page.close();
    if (process.env.FEEDBACK_BROWSER === 'chrome') await browser.close();
    else await browser.disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
