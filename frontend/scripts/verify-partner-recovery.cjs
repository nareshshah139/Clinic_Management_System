const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer-core');
const frontendRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(frontendRoot, '..');
const output = path.join(repositoryRoot, 'output/diagnostics/partner-recovery');
const routeName = 'partner-recovery-qa';
const route = path.join(frontendRoot, 'src/app', routeName);
const port = 3108;
const cdpPort = 9338;
const baseUrl = `http://127.0.0.1:${port}`;
const nextCli = require.resolve('next/dist/bin/next');
const chrome = process.argv.includes('--chrome');

function availablePort(number) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () =>
      reject(
        new Error(
          `Local port ${number} is in use; stop its owner before running this check.`,
        ),
      ),
    );
    server.listen(number, '127.0.0.1', () => server.close(resolve));
  });
}

function start(command, args, logName) {
  const log = fs.openSync(path.join(output, logName), 'w');
  const child = spawn(command, args, {
    cwd: frontendRoot,
    detached: process.platform !== 'win32',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', log, log],
  });
  fs.closeSync(log);
  child.on('error', (error) => {
    child.launchError = error;
  });
  return child;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (child.launchError) throw child.launchError;
    if (child.exitCode !== null)
      throw new Error(
        'Local proof server exited; inspect the ignored diagnostic log.',
      );
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await response.arrayBuffer();
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Local proof server did not become ready.');
}

async function stop(child) {
  if (!child?.pid || child.exitCode !== null) return;
  const signal = (name) => {
    try {
      if (process.platform === 'win32') child.kill(name);
      else process.kill(-child.pid, name);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  signal('SIGTERM');
  const deadline = Date.now() + 5000;
  while (child.exitCode === null && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 50));
  if (child.exitCode === null) signal('SIGKILL');
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    process.env.PROGRAMFILES &&
      path.join(
        process.env.PROGRAMFILES,
        'Google/Chrome/Application/chrome.exe',
      ),
  ];
  const executable = candidates.find(
    (candidate) => candidate && fs.existsSync(candidate),
  );
  if (!executable)
    throw new Error(
      'Set CHROME_EXECUTABLE_PATH to a Chrome or Chromium binary.',
    );
  return executable;
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: node frontend/scripts/verify-partner-recovery.cjs [--chrome]\nDefault: Obscura from PATH or OBSCURA_BIN. Chrome fallback: CHROME_EXECUTABLE_PATH or a standard install.\nUses local ports 3108 and 9338 (Obscura only). Saves ignored output/diagnostics/partner-recovery artifacts.',
    );
    return;
  }
  await availablePort(port);
  if (!chrome) await availablePort(cdpPort);
  assert.equal(
    fs.existsSync(route),
    false,
    `Temporary route already exists: ${route}`,
  );
  fs.mkdirSync(output, { recursive: true });
  let routeCreated = false;
  let server;
  let obscura;
  let browser;
  try {
    fs.mkdirSync(route);
    routeCreated = true;
    fs.copyFileSync(
      path.join(__dirname, 'fixtures/partner-recovery-page.tsx'),
      path.join(route, 'page.tsx'),
      fs.constants.COPYFILE_EXCL,
    );
    server = start(
      process.execPath,
      [nextCli, 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
      'next-browser-proof.log',
    );
    await waitForServer(baseUrl, server);
    if (chrome)
      browser = await puppeteer.launch({
        executablePath: chromeExecutable(),
        headless: true,
        args: ['--no-sandbox'],
      });
    else {
      obscura = start(
        process.env.OBSCURA_BIN || 'obscura',
        [
          'serve',
          '--host',
          '127.0.0.1',
          '--port',
          String(cdpPort),
          '--allow-private-network',
        ],
        'obscura-browser-proof.log',
      );
      await waitForServer(`http://127.0.0.1:${cdpPort}/json/version`, obscura);
      browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${cdpPort}`,
      });
    }
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin === baseUrl || ['data:', 'blob:'].includes(url.protocol))
        void request.continue();
      else void request.abort();
    });
    await page.setViewport({ width: 1280, height: 1000 });
    await page.goto(`${baseUrl}/${routeName}`, {
      waitUntil: 'networkidle0',
      timeout: 90000,
    });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some(
          (button) => button.textContent.trim() === 'Retry outstanding',
        ),
      { timeout: 30000 },
    );
    const initial = await page.evaluate(() =>
      [...document.querySelectorAll('button')].map((button) => ({
        text: button.textContent.trim(),
        disabled: button.disabled,
      })),
    );
    assert.equal(
      initial.find((button) => button.text === 'Retry outstanding').disabled,
      false,
    );
    const click = async (label) => {
      const clicked = await page.evaluate((label) => {
        const button = [...document.querySelectorAll('button')].find(
          (button) => button.textContent.trim() === label,
        );
        if (!button || button.disabled) return false;
        button.click();
        return true;
      }, label);
      assert.equal(clicked, true, `enabled button ${label}`);
    };
    await click('Resolve outstanding');
    await page.waitForSelector('#partner-search-line-synthetic');
    const fill = async (selector, value) =>
      page.$eval(
        selector,
        (element, value) => {
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          ).set.call(element, value);
          element.dispatchEvent(new Event('input', { bubbles: true }));
        },
        value,
      );
    await fill('#partner-search-line-synthetic', 'Synthetic Cream');
    await click('Search batches');
    await page.waitForSelector('#partner-batch-line-synthetic');
    await page.select('#partner-batch-line-synthetic', 'batch-synthetic');
    await fill(
      '#partner-reason-line-synthetic',
      'Confirmed product and actual batch',
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (button) =>
          button.textContent.trim() === 'Save match' && !button.disabled,
      ),
    );
    await click('Save match');
    await page.waitForFunction(() =>
      document.body.innerText.includes('Match saved.'),
    );
    const matched = await page.evaluate(() => window.__partnerRecoveryQa);
    assert.deepEqual(
      [
        matched.stock,
        matched.sale.items[0].committedQuantity,
        matched.commands.length,
      ],
      [5, 5, 1],
    );
    assert.equal(matched.sale.items[0].medicineName, 'Cream typo');
    await page.evaluate(() =>
      document
        .querySelector('#partner-search-line-synthetic')
        .scrollIntoView({ block: 'center' }),
    );
    const engine = chrome ? 'chrome' : 'obscura';
    await page.screenshot({
      path: path.join(output, `partner-recovery-${engine}-desktop.png`),
    });
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() =>
      document
        .querySelector('#partner-search-line-synthetic')
        .scrollIntoView({ block: 'center' }),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      'mobile page has no horizontal overflow',
    );
    await page.screenshot({
      path: path.join(output, `partner-recovery-${engine}-mobile.png`),
    });
    await page.setViewport({ width: 1280, height: 1000 });
    await click('Retry outstanding');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (button) =>
          button.textContent.trim() === 'Committed' && button.disabled,
      ),
    );
    const final = await page.evaluate(() => window.__partnerRecoveryQa);
    assert.deepEqual(
      [
        final.stock,
        final.sale.items[0].committedQuantity,
        final.commands.length,
      ],
      [3, 7, 2],
    );
    assert.equal(final.commands[1].input.expectedVersion, 1);
    const result = {
      engine,
      matchedWithoutStockEffect: true,
      originalSoldSnapshotPreserved: true,
      retriedOutstandingOnly: true,
      finalStock: 3,
      finalCommitted: 7,
    };
    fs.writeFileSync(
      path.join(output, `browser-${engine}-result.json`),
      JSON.stringify(result),
    );
    console.log(JSON.stringify(result));
    await page.close();
  } finally {
    try {
      if (browser) {
        if (chrome) await browser.close();
        else browser.disconnect();
      }
    } finally {
      await stop(obscura);
      await stop(server);
      if (routeCreated) {
        fs.rmSync(path.join(route, 'page.tsx'), { force: true });
        fs.rmdirSync(route);
        fs.rmSync(path.join(frontendRoot, '.next/types/app', routeName), {
          recursive: true,
          force: true,
        });
        const typegen = spawnSync(process.execPath, [nextCli, 'typegen'], {
          cwd: frontendRoot,
          encoding: 'utf8',
          env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
        });
        fs.writeFileSync(
          path.join(output, 'cleanup-typegen.log'),
          `${typegen.stdout || ''}${typegen.stderr || ''}`,
        );
        if (typegen.status !== 0)
          throw new Error(
            'Temporary route removed, but route type regeneration failed; inspect cleanup-typegen.log.',
          );
      }
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
