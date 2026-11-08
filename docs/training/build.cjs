// Builds clinic-workflows-guide.pdf from guide.src.html + manifest.json (written by capture.cjs).
// <figure data-shot="id" data-w="mm" [data-crop="x,y,w,h"]> becomes the screenshot with numbered callouts.
// {{key}} is replaced by manifest.data[key]. Fails if any A4 page overflows or a token/shot is missing.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SRC = path.join(DIR, 'guide.src.html');
const HTML = path.join(DIR, 'guide.html');
const PDF = path.join(DIR, 'clinic-workflows-guide.pdf');
const MM = 96 / 25.4;

const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const problems = [];

function figure(attrs, inner) {
  const a = Object.fromEntries([...attrs.matchAll(/data-([a-z]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const s = manifest.shots[a.shot];
  if (!s) { problems.push('missing shot ' + a.shot); return ''; }
  const [cx, cy, cw, ch] = a.crop ? a.crop.split(',').map(Number) : [0, 0, s.w, s.h];
  const wmm = Number(a.w);
  const k = cw / (wmm * MM);
  const r = 8.5 * k;
  const marks = s.callouts
    .filter(c => c.x + c.w > cx && c.x < cx + cw && c.y + c.h > cy && c.y < cy + ch)
    .map(c => {
      const bx = Math.max(c.x, cx + 2 * k), by = Math.max(c.y, cy + 2 * k);
      const bw = Math.min(c.x + c.w, cx + cw - 2 * k) - bx, bh = Math.min(c.y + c.h, cy + ch - 2 * k) - by;
      const clampX = (x) => Math.min(Math.max(x, cx + r + k), cx + cw - r - k);
      const clampY = (y) => Math.min(Math.max(y, cy + r + k), cy + ch - r - k);
      const leftRoom = c.badge !== 'top' && bx - cx >= 2 * r + 4 * k;
      const topRoom = by - cy >= 2 * r + 4 * k;
      const rightRoom = cx + cw - (bx + bw) >= 2 * r + 4 * k;
      const [px, py] = leftRoom ? [bx - r - 2.5 * k, clampY(by + bh / 2)]
        : c.badge === 'top' && topRoom ? [clampX(bx + r), by - r - 2.5 * k]
        : rightRoom ? [bx + bw + r + 2.5 * k, clampY(by + bh / 2)]
        : [clampX(bx + bw - r - 3 * k), clampY(by + bh / 2)];
      return `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${5 * k}" class="halo" style="stroke-width:${3.4 * k}"/>` +
        `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${5 * k}" class="ring" style="stroke-width:${2.3 * k}"/>` +
        `<circle cx="${px}" cy="${py}" r="${r + 1.6 * k}" class="badge-halo"/><circle cx="${px}" cy="${py}" r="${r}" class="badge"/>` +
        `<text x="${px}" y="${py + 4 * k}" style="font-size:${11.5 * k}px" class="badge-n">${c.n}</text>`;
    }).join('');
  const img = `<img src="img/${s.file}" style="width:${(s.w / cw) * 100}%;left:${(-cx / cw) * 100}%;top:${(-cy / ch) * 100}%">`;
  const svg = `<svg viewBox="${cx} ${cy} ${cw} ${ch}" preserveAspectRatio="none">${marks}</svg>`;
  return `<figure class="shot${a.class ? ' ' + a.class : ''}" style="width:${wmm}mm"><div class="frame" style="aspect-ratio:${cw}/${ch}">${img}${svg}</div>${inner.trim() ? `<figcaption>${inner.trim()}</figcaption>` : ''}</figure>`;
}

let html = fs.readFileSync(SRC, 'utf8');
html = html.replace(/<figure((?:\s+data-[a-z]+="[^"]*")+)\s*>([\s\S]*?)<\/figure>/g, (_, attrs, inner) => figure(attrs, inner));
html = html.replace(/\{\{(\w+)\}\}/g, (m, key) => {
  if (key === 'checksPassed') return String(Object.values(manifest.checks).filter(c => c.ok).length);
  if (key === 'checksTotal') return String(Object.values(manifest.checks).length);
  if (manifest.data[key] == null) { problems.push('missing token ' + key); return m; }
  return String(manifest.data[key]);
});
fs.writeFileSync(HTML, html);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + HTML);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const report = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p, i) => {
    const body = p.querySelector('.body');
    const limit = body.getBoundingClientRect().bottom;
    let bottom = 0;
    body.querySelectorAll('*').forEach(e => { const r = e.getBoundingClientRect(); if (r.height > 0) bottom = Math.max(bottom, r.bottom); });
    const wide = [...body.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > p.getBoundingClientRect().right - 1).length;
    return { page: i + 1, id: p.id, over: Math.round(bottom - limit), wide };
  }));
  for (const r of report) if (r.over > 0 || r.wide > 0) problems.push(`page ${r.page} (${r.id}) overflows by ${r.over}px, ${r.wide} elements past the right edge`);
  await page.evaluate(() => {
    const ids = [...document.querySelectorAll('.page')].map(p => p.id);
    document.querySelectorAll('[data-ref]').forEach(e => { e.textContent = String(ids.indexOf(e.dataset.ref) + 1); });
  });
  const unresolved = await page.evaluate(() => [...document.querySelectorAll('[data-ref]')].filter(e => e.textContent === '0').map(e => e.dataset.ref));
  for (const u of unresolved) problems.push('contents points at missing page ' + u);
  const broken = await page.evaluate(() => [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src));
  for (const b of broken) problems.push('image failed to load ' + b);
  await page.pdf({ path: PDF, preferCSSPageSize: true, printBackground: true });
  await browser.close();
  console.log(report.map(r => `p${r.page} ${r.id || ''} slack ${-r.over}px`).join('\n'));
  if (problems.length) { console.error('PROBLEMS\n' + problems.join('\n')); process.exitCode = 1; }
  else console.log('built', PDF, report.length, 'pages');
})().catch(e => { console.error(e); process.exit(1); });
