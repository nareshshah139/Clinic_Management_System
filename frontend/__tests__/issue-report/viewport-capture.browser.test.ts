/**
 * @jest-environment node
 */
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import ts from 'typescript';

// Clinic staff browse at 80% zoom on 2x screens. There Chrome draws a 1px border as one device pixel, 0.625 CSS px,
// and each fixture element only fits on one line at the exact width the page laid it out.
const FIXTURE = `<!doctype html>
<html><head><meta charset="utf-8">
<script type="importmap">{ "imports": { "modern-screenshot": "/modern-screenshot.mjs" } }</script>
<script>window.process = { env: {} };</script>
<script type="module">import { startViewportCapture } from '/lib/issue-report'; window.startViewportCapture = startViewportCapture;</script>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font: 500 17px sans-serif; color: #111; background: #fff; }
  .row { display: flex; gap: 12px; margin-bottom: 16px; align-items: flex-start; }
  button { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid #888;
    border-radius: 6px; background: #fff; font: inherit; color: inherit; white-space: normal; }
  [role="tablist"] { display: inline-flex; flex-wrap: wrap; padding: 3px; background: #eef; border-radius: 8px; }
  [role="tab"] { flex: 1 1 auto; padding: 6px 16px; border: 1px solid transparent; white-space: nowrap; }
</style></head>
<body>
  <div class="row">
    <button data-check>Find or correct stock</button>
    <button data-check>Retry queues</button>
    <button data-check>Recover interrupted import</button>
  </div>
  ${[
    ['Purchase', 'Returns', 'Payments & dues', 'Credits & vouchers'],
    ['Purchase bills', 'Bill intake', 'Inward challans', 'Gate passes'],
    ['Today', 'Purchases', 'Stock', 'Sales', 'Reorder'],
    ['Suppliers', 'Terms of Trade', 'Purchase costs'],
  ]
    .map((tabs) => `<div class="row"><div role="tablist" data-check>${tabs.map((tab) => `<span role="tab">${tab}</span>`).join('')}</div></div>`)
    .join('\n  ')}
  <!-- The Purchases strip as the app styles it. -->
  <div class="row"><div data-check style="display: flex; flex-wrap: wrap; width: fit-content; padding: 3px; font: 500 17px ui-sans-serif, system-ui, sans-serif; -webkit-font-smoothing: antialiased">${['Purchase', 'Returns', 'Payments & dues', 'Credits & vouchers']
    .map((tab) => `<span style="display: flex; flex: 1 1 auto; min-width: 0; min-height: 40px; align-items: center; justify-content: center; padding: 4px 16px; border: 1px solid transparent; white-space: nowrap">${tab}</span>`)
    .join('')}</div></div>
</body></html>`;

const lib = path.join(__dirname, '../../src/lib');
const library = require.resolve('modern-screenshot').replace(/index\.c?js$/, 'index.mjs');

function serve(): Promise<http.Server> {
  const server = http.createServer((request, response) => {
    const url = request.url ?? '/';
    const send = (type: string, body: string) => response.writeHead(200, { 'content-type': type }).end(body);
    if (url === '/') return send('text/html', FIXTURE);
    if (url === '/modern-screenshot.mjs') return send('text/javascript', fs.readFileSync(library, 'utf8'));
    const source = path.join(lib, `${path.basename(url)}.ts`);
    if (url.startsWith('/lib/') && fs.existsSync(source)) {
      const { outputText } = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
      });
      return send('text/javascript', outputText);
    }
    response.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const CHROME = [
  process.env.CAPTURE_TEST_BROWSER,
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate): candidate is string => !!candidate && fs.existsSync(candidate));

if (!CHROME && process.env.CI) throw new Error('Set CAPTURE_TEST_BROWSER to a Chrome executable');
const describeInChrome = CHROME ? describe : describe.skip;

describeInChrome('startViewportCapture in Chrome', () => {
  let server: http.Server;
  let browser: Browser;
  let page: Page;
  let profile: string;

  beforeAll(async () => {
    server = await serve();
    // Page zoom, unlike device scale emulation, snaps borders; Chrome's zoom levels are powers of 1.2.
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-zoom-'));
    fs.mkdirSync(path.join(profile, 'Default'));
    const zoom = { partition: { default_zoom_level: { x: Math.log(0.8) / Math.log(1.2) } } };
    fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify(zoom));
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      userDataDir: profile,
      defaultViewport: null,
      args: ['--no-first-run', '--no-sandbox', '--window-size=1000,900', '--force-device-scale-factor=2'],
    });
    page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
    await page.waitForFunction(() => 'startViewportCapture' in window);
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await new Promise((resolve) => server?.close(resolve));
    if (profile) fs.rmSync(profile, { recursive: true, force: true });
  });

  it('draws labels and tab strips on the lines the page shows at 80% zoom on a 2x screen', async () => {
    const screen = Buffer.from(await page.screenshot({ type: 'png' })).toString('base64');

    const lines = await page.evaluate(async (screenPng: string) => {
      const capture = (window as unknown as { startViewportCapture: () => Promise<{ image: Promise<Blob> }> }).startViewportCapture;
      const { image } = await capture();
      const pixels = async (src: string) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
        const context = canvas.getContext('2d')!;
        context.drawImage(img, 0, 0);
        return context.getImageData(0, 0, img.width, img.height);
      };
      const shown = await pixels(`data:image/png;base64,${screenPng}`);
      const captured = await pixels(URL.createObjectURL(await image));
      const ratio = shown.width / innerWidth;
      // Text lines are runs of rows with dark ink. The band reaches past the box to catch a line that overflows it,
      // but stops short of the next row's text.
      const textLines = ({ data, width }: ImageData, box: DOMRect) => {
        let runs = 0;
        let inked = false;
        for (let y = Math.floor((box.top - 14) * ratio); y < Math.ceil((box.bottom + 14) * ratio); y++) {
          let ink = false;
          for (let x = Math.floor(box.left * ratio); x < Math.ceil(box.right * ratio) && !ink; x++) {
            const i = (y * width + x) * 4;
            ink = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2] < 100;
          }
          if (ink && !inked) runs++;
          inked = ink;
        }
        return runs;
      };
      return {
        zoom: devicePixelRatio,
        size: [captured.width - shown.width, captured.height - shown.height],
        elements: [...document.querySelectorAll('[data-check]')].map((el) => {
          const box = el.getBoundingClientRect();
          return { label: el.textContent, shown: textLines(shown, box), captured: textLines(captured, box) };
        }),
      };
    }, screen);

    expect(lines.zoom).toBeCloseTo(1.6);
    expect(lines.size.map(Math.abs).every((gap) => gap <= 1)).toBe(true);
    for (const element of lines.elements) expect(element).toEqual({ ...element, shown: 1, captured: 1 });
  }, 60_000);
});
