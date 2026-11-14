const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const root = path.resolve(__dirname, '../..');
const baseline = process.argv.includes('--baseline');
const browserKind = process.env.UX_BROWSER || 'obscura';
const output = path.join(root, 'tmp', baseline ? 'ux-improvements-baseline' : 'ux-improvements-verification');
const baseUrl = process.env.UX_URL || 'http://127.0.0.1:3000';

/**
 * @cc [owner:nareshshah139,label:verification] synthetic-ui-isolation
 * Browser checks use synthetic API responses and cannot submit clinic mutations.
 */
async function prepare(page) {
  await page.browserContext().setCookie({ name: 'auth_token', value: 'synthetic-ux-fixture', url: baseUrl, httpOnly: true, sameSite: 'Strict' });
  await page.evaluateOnNewDocument(() => {
    const nativeFetch = window.fetch.bind(window);
    const user = { id: 'ux-test-user', firstName: 'Asha', lastName: 'Patel', email: 'asha@example.test', role: 'ADMIN', status: 'ACTIVE', isActive: true, branchId: 'ux-test-branch' };
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
      const endpoint = url.pathname.slice(4);
      if (endpoint === '/auth/statistics' && location.search.includes('ux-loading=1')) await new Promise(resolve => setTimeout(resolve, 2500));
      const method = init?.method || (typeof input !== 'string' && input.method) || 'GET';
      let body;
      if (method !== 'GET' && endpoint !== '/auth/login' && endpoint !== '/auth/logout') {
        return new Response(JSON.stringify({ message: 'UI verification does not write clinic data.' }), { status: 409, headers: { 'content-type': 'application/json' } });
      }
      if (endpoint === '/auth/me' || endpoint === '/users/ux-test-user') body = user;
      else if (endpoint === '/auth/login') return new Response(JSON.stringify({ message: 'Check your phone or email and password.' }), { status: 401, headers: { 'content-type': 'application/json' } });
      else if (endpoint === '/auth/statistics') body = { users: { total: 12 }, patients: { total: 128 }, appointments: { total: 24 }, system: { status: 'healthy', version: '1.0.0', uptime: 3600 } };
      else if (endpoint === '/pharmacy/reports/daily-collection') body = { wholeDay: null, collection: { expectedTotal: 0, modes: [] } };
      else if (endpoint === '/reports/alerts') body = { lowStockAlerts: [], expiryAlerts: [], pendingPayments: [], generatedAt: '2026-11-05T09:00:00Z' };
      else if (endpoint === '/users') body = { users: [user], total: 1 };
      else if (endpoint === '/patients') body = { patients: [], total: 0, page: 1, totalPages: 1 };
      else if (endpoint === '/appointments') body = { appointments: [], total: 0 };
      else if (endpoint === '/appointments/summary') body = { total: 0, scheduled: 0, completed: 0, cancelled: 0 };
      else if (endpoint.includes('invoices')) body = { invoices: [], total: 0, page: 1, totalPages: 1 };
      else if (endpoint.includes('inventory')) body = { items: [], total: 0, page: 1, totalPages: 1 };
      else if (endpoint.includes('drugs')) body = { drugs: [], total: 0, page: 1, totalPages: 1 };
      else if (endpoint.includes('visits')) body = { visits: [], total: 0, page: 1, totalPages: 1 };
      else body = [];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    };
  });
}

async function inspect(page, name) {
  await page.evaluate(async () => {
    const animations = document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime));
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
  });
  const metrics = await page.evaluate(() => {
    const sidebar = document.querySelector('aside') || document.querySelector('[data-tour="sidebar"]');
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      title: document.title,
      heading: document.querySelector('h1')?.textContent,
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      sidebarBackground: sidebar && getComputedStyle(sidebar).backgroundColor,
      primary: rootStyle.getPropertyValue('--primary').trim(),
      accentSoft: rootStyle.getPropertyValue('--accent-soft').trim(),
      success: rootStyle.getPropertyValue('--success').trim(),
      invalidSidebarClasses: [...document.querySelectorAll('[class]')].filter(el => el.className?.toString().includes('bg-[var(--sidebar, var(--card))]')).length,
    };
  });
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  return { name, ...metrics };
}

/**
 * @cc [owner:nareshshah139,label:verification] theme-contrast
 * Theme checks compare rendered foreground/background token pairs, including
 * branded mode combined with dark and high contrast, against WCAG normal-text contrast.
 */
async function inspectTheme(page, name) {
  await page.evaluate(mode => {
    document.documentElement.classList.toggle('dark', mode.includes('dark'));
    document.body.classList.toggle('high-contrast', mode.includes('contrast'));
  }, name);
  const contrast = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const probe = document.createElement('span');
    document.body.append(probe);
    const rgb = token => {
      probe.style.color = `var(--${token})`;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(probe).color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = color => color.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const statuses = ['success', 'warning', 'info', 'destructive', 'highlight'];
    const pairs = [['foreground', 'background'], ['card-foreground', 'card'], ['muted-foreground', 'card'], ['primary-foreground', 'primary'], ['sidebar-foreground', 'sidebar'], ...statuses.map(name => [`${name}-foreground`, name]), ...statuses.map(name => [`${name}-text`, `${name}-soft`])];
    const result = pairs.map(([foreground, background]) => {
      const front = luminance(rgb(foreground));
      const back = luminance(rgb(background));
      return { foreground, background, ratio: (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05) };
    });
    probe.remove();
    return result;
  });
  return { ...await inspect(page, `dashboard-${name}`), contrast };
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = browserKind === 'chrome'
    ? await puppeteer.launch({ executablePath: process.env.UX_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-first-run', '--no-default-browser-check'] })
    : await puppeteer.connect({ browserURL: process.env.UX_CDP || 'http://127.0.0.1:9222' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const results = [];
  try {
    await prepare(page);
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
    results.push(await inspect(page, 'login-desktop'));
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('h1');
    results.push(await inspect(page, 'dashboard-desktop'));
    if (!baseline) {
      results.push(await inspectTheme(page, 'light'));
      results.push(await inspectTheme(page, 'dark'));
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
      const switchBranded = async enabled => {
        await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
        const brandSwitch = await page.waitForSelector('[aria-label="Toggle branded mode"]:not([disabled])');
        assert.ok(brandSwitch, 'The branded theme switch must remain accessible on the login page');
        await brandSwitch.click();
        await page.waitForFunction(on => document.documentElement.classList.contains('branded') === on, {}, enabled);
      };
      await switchBranded(true);
      await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('h1');
      await page.waitForFunction(() => document.documentElement.classList.contains('branded'));
      results.push(await inspectTheme(page, 'branded'));
      results.push(await inspectTheme(page, 'branded-dark'));
      results.push(await inspectTheme(page, 'branded-contrast'));
      await page.evaluate(() => document.body.classList.remove('high-contrast'));
      await switchBranded(false);
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.goto(`${baseUrl}/dashboard?ux-loading=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[role="status"][aria-label="Loading dashboard…"]');
      const animations = await page.$$eval('[role="status"] .animate-pulse', elements => elements.map(element => getComputedStyle(element).animationName));
      assert.ok(animations.length > 0, 'Dashboard loading must render skeleton placeholders');
      assert.ok(animations.every(name => name === 'none'), 'Skeleton motion must respect reduced motion');
      results.push(await inspect(page, 'dashboard-loading'));
      await page.waitForSelector('[role="status"][aria-label="Loading dashboard…"]', { hidden: true });
      await page.emulateMediaFeatures([]);
    }
    await page.setViewport({ width: 390, height: 844 });
    results.push(await inspect(page, 'dashboard-mobile'));
    if (!baseline) {
      await page.click('[aria-label="Open clinic navigation"]');
      await page.waitForSelector('[role="dialog"]');
      const navigation = await page.$eval('[role="dialog"]', dialog => dialog.textContent);
      assert.ok(navigation.includes('Clinical') && navigation.includes('Pharmacy') && navigation.includes('Admin'), 'Navigation must group clinical, pharmacy and admin tasks');
      assert.ok(navigation.includes('AP'), 'Navigation must show the signed-in user initials');
      results.push(await inspect(page, 'navigation-mobile'));
      await page.keyboard.press('Escape');
      await page.waitForSelector('[role="dialog"]', { hidden: true });
      await page.goto(`${baseUrl}/dashboard/patients`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('h1');
      results.push(await inspect(page, 'patients-mobile'));
      await page.setViewport({ width: 1440, height: 1000 });
      results.push(await inspect(page, 'patients-desktop'));
      await page.setViewport({ width: 390, height: 844 });
    }
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
    results.push(await inspect(page, 'login-mobile'));
    if (!baseline) {
      await page.type('#login-identifier', 'asha@example.test');
      await page.type('#login-password', 'synthetic-password');
      await page.click('button[type="submit"]');
      await page.waitForFunction(() => document.body.textContent.includes('Check your phone or email and password.'));
      assert.equal(await page.$eval('#login-identifier', input => input.value), 'asha@example.test', 'Rejected login preserves the identifier');
    }
    await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ browser: browserKind, fixture: 'synthetic API responses', baseline, results, errors }, null, 2));
    if (!baseline) {
      for (const result of results) {
        assert.equal(result.invalidSidebarClasses, 0, `${result.name} sidebar class must parse`);
        assert.ok(result.accentSoft, `${result.name} requires a hover background`);
        assert.ok(result.success, `${result.name} requires status tokens`);
        assert.ok(result.scrollWidth <= result.viewport, `${result.name} must fit the viewport`);
        assert.notEqual(result.title, 'Create Next App');
        if (result.name === 'dashboard-desktop') assert.notEqual(result.sidebarBackground, 'rgba(0, 0, 0, 0)', 'Sidebar must have an opaque theme background');
        for (const pair of result.contrast || []) assert.ok(pair.ratio >= 4.5, `${result.name} ${pair.foreground}/${pair.background} contrast is ${pair.ratio.toFixed(2)}`);
      }
      assert.deepEqual(errors, [], 'UI must not throw runtime errors');
    }
    console.log(JSON.stringify({ browser: browserKind, baseline, results, errors }));
  } finally {
    await fs.writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ browser: browserKind, fixture: 'synthetic API responses', baseline, results, errors }, null, 2));
    await page.close();
    if (browserKind === 'chrome') await browser.close(); else browser.disconnect();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
