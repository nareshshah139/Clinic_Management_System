// Lays the chapters and their screenshots out as a paged document and prints it to PDF.
// Usage: node scripts/guide/build.cjs [--only <chapter-id-prefix>] [--out <file.pdf>]
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../..");
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const only = flag("--only");
const outFile = path.resolve(flag("--out") || path.join(root, "docs/user-guide/Linae-Clinic-User-Guide.pdf"));
const shotsDir = path.join(root, "output/guide/shots");
const chaptersDir = path.join(__dirname, "chapters");

const PAGED = path.join(path.dirname(require("node:module").createRequire(path.join(root, "frontend/package.json")).resolve("pagedjs")), "../dist/paged.polyfill.js");
const esc = (s) => String(s).replace(/&(?!(?:[a-z]+|#\d+);)/g, "&amp;");
const plain = (s) => String(s).replace(/<[^>]+>/g, "");
const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function figure(chapter, shot, number) {
  const file = path.join(shotsDir, chapter.id, `${shot.file}.jpg`);
  if (!fs.existsSync(file)) {
    console.log(`  missing shot ${chapter.id}/${shot.file}`);
    return "";
  }
  const cls = ["figure", shot.narrow && "narrow", shot.fullPage && "tall"].filter(Boolean).join(" ");
  return `<figure class="${cls}"><img src="file://${file}" alt="${plain(shot.caption || "").replace(/"/g, "&quot;")}"><figcaption><b>Figure ${number}.</b> ${esc(shot.caption || "")}</figcaption></figure>`;
}

function renderSection(chapter, chapterNo, section, sectionNo, counter) {
  const id = `s-${chapterNo}-${sectionNo}`;
  const body = list(section.body);
  const parts = [`<section class="section"><div class="keep"><h2 id="${id}"><span class="num">${chapterNo}.${sectionNo}</span> ${esc(section.title)}</h2>`];
  if (section.who) parts.push(`<p class="who"><span>Who uses this</span> ${esc(section.who)}</p>`);
  if (body.length) parts.push(`<p>${esc(body[0])}</p>`);
  parts.push("</div>");
  for (const p of body.slice(1)) parts.push(`<p>${esc(p)}</p>`);
  if (list(section.steps).length) parts.push(`<ol class="steps">${list(section.steps).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`);
  const shots = list(section.shots).filter((shot) => !shot.hidden);
  const figures = shots.map((shot) => figure(chapter, shot, `${chapterNo}.${++counter.n}`)).filter(Boolean);
  if (figures.length) parts.push(section.shotLayout === "row" ? `<div class="figure-row cols-${figures.length}">${figures.join("")}</div>` : figures.join(""));
  const rows = list(section.fields).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`);
  if (rows.length)
    parts.push(
      `<table class="fields"><tbody class="keep"><tr><th>${esc(section.fieldsHeading?.[0] || "On the screen")}</th><th>${esc(section.fieldsHeading?.[1] || "What it means")}</th></tr>${rows.slice(0, 2).join("")}</tbody><tbody>${rows.slice(2).join("")}</tbody></table>`,
    );
  for (const p of list(section.after)) parts.push(`<p>${esc(p)}</p>`);
  if (list(section.tips).length) parts.push(`<div class="callout tip"><div class="label">Tip</div>${list(section.tips).map((t) => `<p>${esc(t)}</p>`).join("")}</div>`);
  if (list(section.warnings).length) parts.push(`<div class="callout warn"><div class="label">Take care</div>${list(section.warnings).map((t) => `<p>${esc(t)}</p>`).join("")}</div>`);
  parts.push("</section>");
  return parts.join("\n");
}

const CSS = `
@page { size: A4; margin: 20mm 16mm 20mm 16mm;
  @top-left { content: "Linaé Clinic Management System · User Guide"; font: 500 8pt Inter, sans-serif; color: #64748b; }
  @top-right { content: string(chapter); font: 500 8pt Inter, sans-serif; color: #64748b; }
  @bottom-center { content: counter(page); font: 500 9pt Inter, sans-serif; color: #334155; } }
@page cover { margin: 0; @top-left { content: none; } @top-right { content: none; } @bottom-center { content: none; } }
@page front { @top-right { content: none; } }
* { box-sizing: border-box; }
html { font: 10.5pt/1.55 Inter, "DejaVu Sans", sans-serif; color: #0f172a; }
body { margin: 0; }
b, strong { font-weight: 650; }
p { margin: 0 0 7pt; orphans: 3; widows: 3; }
a { color: inherit; text-decoration: none; }
.cover { page: cover; break-after: page; height: 297mm; padding: 34mm 22mm 22mm; background: #0f172a; color: #fff; display: flex; flex-direction: column; }
.cover .brand { font: 600 12pt Inter; letter-spacing: .28em; text-transform: uppercase; color: #94a3b8; }
.cover h1 { font: 750 40pt/1.08 "Inter Display", Inter; margin: 26mm 0 6mm; letter-spacing: -.02em; }
.cover .sub { font: 400 14pt/1.45 Inter; color: #cbd5e1; max-width: 130mm; }
.cover img { margin-top: 14mm; width: 100%; border-radius: 6px; box-shadow: 0 18px 50px rgba(0,0,0,.5); }
.cover .meta { margin-top: auto; font: 400 9.5pt Inter; color: #94a3b8; display: flex; justify-content: space-between; }
.front { page: front; break-after: page; }
.front h1 { font: 750 22pt "Inter Display", Inter; margin: 0 0 8mm; }
.toc { list-style: none; margin: 0; padding: 0; columns: 2; column-gap: 9mm; }
.toc li { break-inside: avoid; }
.toc li.ch { margin-top: 8pt; font-weight: 650; font-size: 9.5pt; }
.toc li.sec { margin-left: 4mm; font-size: 8.5pt; color: #334155; }
.toc a { display: flex; align-items: baseline; gap: 4pt; }
.toc a .t { flex: 0 1 auto; }
.toc a .dots { flex: 1; border-bottom: 1px dotted #94a3b8; transform: translateY(-3pt); }
.toc a::after { content: target-counter(attr(href url), page); font-variant-numeric: tabular-nums; }
.conventions td { padding: 5pt 8pt 5pt 0; vertical-align: top; }
.chapter { break-before: page; }
.chapter > header { margin-bottom: 8mm; padding-bottom: 6mm; border-bottom: 2px solid #0f172a; }
.chapter > header .no { font: 650 10pt Inter; letter-spacing: .2em; text-transform: uppercase; color: #e11d48; }
.chapter > header h1 { string-set: chapter content(text); font: 750 26pt/1.15 "Inter Display", Inter; margin: 3mm 0 4mm; letter-spacing: -.015em; }
.chapter > header p { font-size: 11.5pt; color: #334155; margin: 0; }
h2 { font: 700 14.5pt/1.25 "Inter Display", Inter; margin: 9mm 0 3mm; break-after: avoid; }
h2 .num { color: #e11d48; margin-right: 5pt; font-weight: 650; }
.section:first-of-type h2 { margin-top: 0; }
.who { font-size: 9pt; color: #475569; margin: -1mm 0 3mm; break-after: avoid; }
.who span { font-weight: 650; text-transform: uppercase; letter-spacing: .06em; font-size: 7.5pt; background: #e2e8f0; color: #334155; padding: 1.5pt 5pt; border-radius: 3pt; margin-right: 4pt; }
ol.steps { margin: 2mm 0 4mm; padding: 0; list-style: none; counter-reset: step; }
ol.steps li { counter-increment: step; position: relative; padding: 0 0 0 9mm; margin-bottom: 5pt; break-inside: avoid; }
ol.steps li::before { content: counter(step); position: absolute; left: 0; top: .5pt; width: 5.6mm; height: 5.6mm; border-radius: 50%; background: #0f172a; color: #fff; font: 650 8.5pt/5.6mm Inter; text-align: center; }
.figure { margin: 4mm 0 5mm; break-inside: avoid; }
.figure img { display: block; width: 100%; max-height: 225mm; object-fit: contain; object-position: left top; border: 1px solid #cbd5e1; border-radius: 4px; }
.figure.narrow img { width: 62%; }
.figure figcaption { font-size: 8.5pt; color: #475569; margin-top: 2mm; }
.figure-row { display: grid; gap: 4mm; margin: 4mm 0 5mm; break-inside: avoid; align-items: start; }
.figure-row.cols-2 { grid-template-columns: repeat(2, 1fr); } .figure-row.cols-3 { grid-template-columns: repeat(3, 1fr); } .figure-row.cols-4 { grid-template-columns: repeat(4, 1fr); }
.figure-row .figure { margin: 0; }
table.fields { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 9.5pt; }
table.fields th { text-align: left; font: 650 8pt Inter; text-transform: uppercase; letter-spacing: .05em; color: #475569; border-bottom: 1.5px solid #0f172a; padding: 4pt 6pt 4pt 0; }
table.fields td { border-bottom: 1px solid #e2e8f0; padding: 4.5pt 8pt 4.5pt 0; vertical-align: top; }
table.fields td:first-child { width: 31%; font-weight: 600; }
table.fields tr { break-inside: avoid; }
.keep { break-inside: avoid; }
.callout { border-left: 3px solid #0ea5e9; background: #f0f9ff; padding: 6pt 9pt; margin: 3mm 0 5mm; border-radius: 0 4px 4px 0; break-inside: avoid; font-size: 9.5pt; }
.callout.warn { border-color: #f59e0b; background: #fffbeb; }
.callout .label { font: 700 7.5pt Inter; text-transform: uppercase; letter-spacing: .08em; color: #0369a1; margin-bottom: 2pt; }
.callout.warn .label { color: #b45309; }
.callout p:last-child { margin-bottom: 0; }
`;

(async () => {
  const files = fs.readdirSync(chaptersDir).filter((f) => f.endsWith(".cjs")).sort();
  const chapters = files.map((f) => require(path.join(chaptersDir, f))).filter((c) => !only || c.id.startsWith(only));
  const body = [];
  const toc = [];
  chapters.forEach((chapter, index) => {
    const no = index + 1;
    const counter = { n: 0 };
    toc.push(`<li class="ch"><a href="#c-${no}"><span class="t">${no}. ${esc(chapter.title)}</span><span class="dots"></span></a></li>`);
    const sections = chapter.sections.map((section, i) => {
      toc.push(`<li class="sec"><a href="#s-${no}-${i + 1}"><span class="t">${no}.${i + 1} ${esc(section.title)}</span><span class="dots"></span></a></li>`);
      return renderSection(chapter, no, section, i + 1, counter);
    });
    body.push(`<article class="chapter"><header><div class="no">Chapter ${no}</div><h1 id="c-${no}">${esc(chapter.title)}</h1><p>${esc(chapter.intro || "")}</p></header>${sections.join("\n")}</article>`);
  });

  const coverShot = path.join(shotsDir, "01-getting-started", "cover.jpg");
  const today = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Linaé Clinic Management System: User Guide</title><style>${CSS}</style>
<script>window.PagedConfig = { auto: true, after: () => { window.__pagedDone = true; } };</script>
<script src="file://${PAGED}"></script></head><body>
<section class="cover"><div class="brand">Linaé · Skin, Hair &amp; Aesthetic Clinic</div><h1>Clinic Management System<br>User Guide</h1>
<div class="sub">How to do every task in the app, screen by screen: front desk, consultation, pharmacy, stock, reports and administration.</div>
${fs.existsSync(coverShot) ? `<img src="file://${coverShot}" alt="">` : ""}
<div class="meta"><span>For doctors, reception, pharmacy and admin staff</span><span>${today}</span></div></section>
<section class="front"><h1>Contents</h1><ul class="toc">${toc.join("")}</ul></section>
<section class="front"><h1>How to read this guide</h1>
<p>Each chapter follows one item in the menu on the left of the app. Within a chapter, each section is one task. A section tells you who normally does the task, gives the steps in order, and shows the screen.</p>
<table class="conventions">
<tr><td><b>Bold text</b></td><td>The exact words on a button, tab or field in the app.</td></tr>
<tr><td><span style="display:inline-block;min-width:16pt;height:16pt;border-radius:8pt;background:#e11d48;color:#fff;font:700 9pt/16pt Inter;text-align:center">1</span></td><td>A red numbered marker on a screenshot. It points at the part of the screen that the matching step or table row describes. The markers are added for this guide and do not appear in the app.</td></tr>
<tr><td><b>Who uses this</b></td><td>The roles that normally do the task. If a page is missing from your menu, your role does not include it.</td></tr>
<tr><td><b>Tip</b></td><td>A faster way, or something that saves a mistake.</td></tr>
<tr><td><b>Take care</b></td><td>An action that cannot be undone, or that changes stock or money.</td></tr>
</table>
<p>The screenshots show a demonstration clinic with made-up patients, medicines and bills. No real patient appears anywhere in this guide. Amounts are in Indian rupees and dates are in day/month/year order, as in the app.</p></section>
${body.join("\n")}</body></html>`;

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const htmlFile = path.join(root, "output/guide/guide.html");
  fs.mkdirSync(path.dirname(htmlFile), { recursive: true });
  fs.writeFileSync(htmlFile, html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log(`page error: ${e.message}`));
  await page.goto(`file://${htmlFile}`, { waitUntil: "load", timeout: 0 });
  await page.waitForFunction(() => window.__pagedDone === true, null, { timeout: 600000 });
  const pages = await page.locator(".pagedjs_page").count();
  await page.pdf({ path: outFile, preferCSSPageSize: true, printBackground: true });
  await browser.close();
  console.log(`${chapters.length} chapters, ${pages} pages -> ${outFile} (${(fs.statSync(outFile).size / 1048576).toFixed(1)} MB)`);
})();
