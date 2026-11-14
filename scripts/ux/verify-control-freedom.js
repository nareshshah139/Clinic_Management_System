const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

/**
 * @cc [owner:nareshshah139,label:testing] isolated-navigation-verification
 * Browser checks MUST use synthetic API responses and a temporary browser profile.
 * A failed navigation or dismissal assertion MUST produce a nonzero exit status.
 */
async function main() {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  try {
    const page = await browser.newPage();
    let releaseSearch;
    let searchStarted;
    let delayedQuery;
    const user = { id: 'navigation-check', role: 'OWNER', firstName: 'Navigation', lastName: 'Check', branchId: 'test-branch', metadata: {} };
    await page.setRequestInterception(true);
    page.on('request', async request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return request.continue();
      if (url.pathname === '/api/patients' && url.searchParams.get('search') === delayedQuery) {
        searchStarted();
        await new Promise(resolve => { releaseSearch = resolve; });
      }
      let body = {};
      if (url.pathname === '/api/auth/me' || url.pathname === '/api/users/navigation-check') body = user;
      else if (url.pathname === '/api/patients') body = { patients: [{ id: 'search-fixture', firstName: 'Search', lastName: 'Fixture', gender: 'OTHER' }], data: [{ id: 'search-fixture', firstName: 'Search', lastName: 'Fixture', gender: 'OTHER' }], total: 1 };
      else if (url.pathname === '/api/appointments') body = { appointments: [], data: [] };
      else if (url.pathname === '/api/users') body = { users: [], data: [] };
      else if (url.pathname === '/api/pharmacy/reports/daily-collection') body = { wholeDay: null, collection: { expectedTotal: 0, modes: [] } };
      await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    const base = process.env.CLINIC_URL || 'http://localhost:3000';
    await page.setCookie({ name: 'auth_token', value: 'navigation-check-fixture', url: base });
    await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.body.innerText.includes('Navigation Check'));
    const input = 'input[placeholder="Find a patient"]';
    await page.waitForSelector(input);
    const clickOutsideSearch = async () => {
      const point = await page.$eval(input, element => {
        const box = element.closest('div.relative').parentElement;
        const x = innerWidth - 12;
        const y = Math.round(box.getBoundingClientRect().bottom + 24);
        return box.contains(document.elementFromPoint(x, y)) ? null : { x, y };
      });
      assert.ok(point, 'The outside click must land outside the search box and its results');
      await page.mouse.click(point.x, point.y);
    };
    await page.type(input, 'Search');
    assert.equal(await page.evaluate(() => document.body.innerText.includes('No results found')), false, 'Debounced search must not report an empty result before responding');
    await page.waitForFunction(() => document.body.innerText.includes('Search Fixture'));
    await page.keyboard.press('Escape');
    await new Promise(resolve => setTimeout(resolve, 100));
    const dismissed = await page.evaluate(() => !document.body.innerText.includes('Search Fixture'));
    console.log(`Escape dismisses search results: ${dismissed ? 'PASS' : 'FAIL'}`);
    assert.equal(await page.$eval(input, element => element.value), 'Search');
    assert.equal(await page.$eval(input, element => element === document.activeElement), true);
    await page.$eval(input, element => element.blur());
    delayedQuery = undefined;
    await page.focus(input);
    await page.waitForFunction(() => document.body.innerText.includes('Search Fixture'));
    await clickOutsideSearch();
    assert.equal(await page.evaluate(() => document.body.innerText.includes('Search Fixture')), false);
    console.log('Query retained, focus retained, results reopen, outside click dismisses: PASS');
    for (const [query, dismiss] of [
      ['Delayed escape', () => page.keyboard.press('Escape')],
      ['Delayed outside', () => clickOutsideSearch()],
    ]) {
      delayedQuery = query;
      const started = new Promise(resolve => { searchStarted = resolve; });
      await page.$eval(input, element => { element.select(); });
      await page.type(input, query);
      await started;
      await dismiss();
      releaseSearch();
      await page.waitForNetworkIdle();
      assert.equal(await page.evaluate(() => document.body.innerText.includes('Search Fixture')), false, `${query} must remain dismissed after the response`);
      console.log(`${query} remains dismissed after response: PASS`);
    }
    delayedQuery = undefined;
    await page.focus(input);
    await page.waitForFunction(() => document.body.innerText.includes('Search Fixture'));
    console.log('Result reopened after delayed dismissal: PASS');
    await page.goto(`${base}/test-transcribe`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForNetworkIdle();
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Start Recording')));
    const back = await page.$('a[href="/dashboard"]');
    console.log(`Test Transcribe has dashboard return: ${back ? 'PASS' : 'FAIL'}`);
    assert.ok(dismissed, 'Escape must dismiss search results');
    assert.ok(back, 'Test Transcribe must have a dashboard return link');
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(await back.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth;
    }), true, 'Return link must remain reachable on a narrow screen');
    const observerCreated = new Promise(resolve => page.once('popup', resolve));
    await page.evaluate(() => {
      const observer = window.open('about:blank', 'capture-observer');
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        const stream = await original(constraints);
        observer.captureTrack = stream.getAudioTracks()[0];
        return stream;
      };
    });
    const observer = await observerCreated;
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Start Recording')).click());
    await observer.waitForFunction(() => window.captureTrack?.readyState === 'live');
    await page.evaluate(() => { window.navigationDocumentMarker = true; });
    await page.bringToFront();
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), back.click()]).catch(async error => {
      console.error(await page.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(0, 700) })));
      throw error;
    });
    assert.equal(new URL(page.url()).pathname, '/dashboard');
    assert.equal(await page.evaluate(() => window.navigationDocumentMarker), undefined);
    await observer.waitForFunction(() => window.captureTrack.readyState === 'ended');
    await observer.close();
    console.log('Dashboard return navigation: PASS');
    console.log('Returning during recording releases microphone: PASS');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
