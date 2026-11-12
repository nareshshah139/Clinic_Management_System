// Pharmacy Desk layout at 1280, 1440 and 390: the page title shows on the dark header,
// every figure tile shows its whole value, and the Partner Daily Sync form and line-item
// headers sit side by side without overlapping, with no sideways page scroll.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { bootStack } = require("../boot.cjs");
const { browserLogin } = require("./cr31-seed.cjs");

const root = path.resolve(__dirname, "../../..");
const out = process.env.SHOTS_DIR || path.join(root, "output/stack/pharmacy-desk-layout");
const VIEWPORTS = { 1280: { width: 1280, height: 800 }, 1440: { width: 1440, height: 900 }, 390: { width: 390, height: 844 } };
const WHO = (process.env.DESK_WHO || "pharmacist,reception").split(",");
const WIDTHS = (process.env.DESK_WIDTHS || "1280,1440,390").split(",");
const SALES = 248250.75;

async function seed(stack) {
  const db = stack.db;
  const patient = await db.patient.create({ data: { branchId: stack.branch.id, name: "Kavya Reddy", gender: "F", phone: "9876500031" } });
  await db.pharmacyInvoice.create({
    data: {
      branchId: stack.branch.id, patientId: patient.id, invoiceNumber: "PHI-DESK-001", status: "COMPLETED",
      subtotal: SALES, totalAmount: SALES, balanceAmount: 0, paymentMethod: "CASH", billingName: patient.name, billingPhone: patient.phone,
    },
  });
}

/** Runs in the page: every geometry fact the checks below read. */
function measure() {
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  };
  // The rendered text's extent, not the element's box: a squeezed label's text spills out of its box.
  const ink = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { left: Math.min(r.left, b.left), right: Math.max(r.right, b.right), top: Math.min(r.top, b.top), bottom: Math.max(r.bottom, b.bottom) };
  };
  const overlaps = (els) => {
    const hits = [];
    for (let i = 0; i < els.length; i++)
      for (let j = i + 1; j < els.length; j++) {
        const a = ink(els[i]);
        const b = ink(els[j]);
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5)
          hits.push(`${els[i].textContent.trim()} / ${els[j].textContent.trim()}`);
      }
    return hits;
  };
  const clipped = (el) => el.scrollWidth > el.clientWidth + 1 || ink(el).right > box(el).right + 1;
  const lines = (el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight || "20"));
  const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const luminance = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => {
    const [x, y] = [luminance(rgb(a)), luminance(rgb(b))].sort((m, n) => n - m);
    return Math.round(((x + 0.05) / (y + 0.05)) * 10) / 10;
  };

  const header = document.querySelector("main section");
  const h1 = header?.querySelector("h1");
  const pill = [...(header?.querySelectorAll("span") || [])].find((s) => s.textContent.trim() === "Command center");
  const headerTop = header ? box(header).top + parseFloat(getComputedStyle(header).paddingTop) : 0;
  const tiles = [...(header?.querySelectorAll("p") || [])]
    .filter((p) => ["Sales", "Invoices", "Stock", "Packages"].includes(p.textContent.trim()) && p.nextElementSibling)
    .map((label) => {
      const value = label.nextElementSibling;
      return { label: label.textContent.trim(), text: value.textContent.trim(), clipped: clipped(value), width: Math.round(box(label.parentElement).width) };
    });

  const card = [...document.querySelectorAll("[data-slot=card]")].find((c) => /Manual Daily Entry/.test(c.querySelector("[data-slot=card-title]")?.textContent || ""));
  const labels = card ? ["partner-date", "partner-id", "partner-name", "partner-user"].map((id) => card.querySelector(`label[for=${id}]`)) : [];
  const inputs = card ? ["partner-date", "partner-id", "partner-name", "partner-user"].map((id) => card.querySelector(`#${id}`)) : [];
  const heads = card ? [...card.querySelectorAll("thead th")].filter((th) => th.textContent.trim()) : [];
  const lineInputs = card ? [...card.querySelectorAll("tbody tr:first-child input, tbody tr:first-child button[role=combobox]")] : [];

  return {
    overflow: Math.max(document.scrollingElement.scrollWidth - window.innerWidth, 0),
    title: h1 ? { text: h1.textContent.trim(), height: Math.round(box(h1).height), contrast: contrast(getComputedStyle(h1).color, getComputedStyle(header).backgroundColor) } : null,
    gapAboveFirstLine: h1 && pill ? Math.round(Math.min(box(h1).top, box(pill).top) - headerTop) : null,
    pillBesideTitle: h1 && pill ? box(pill).top < box(h1).bottom && box(pill).bottom > box(h1).top : null,
    tiles,
    card: card
      ? {
          width: Math.round(box(card).width),
          labelOverlaps: overlaps(labels),
          labelsClippedOrWrapped: labels.filter((l) => clipped(l) || lines(l) > 1).map((l) => l.textContent.trim()),
          narrowestInput: Math.round(Math.min(...inputs.map((i) => box(i).width))),
          headOverlaps: overlaps(heads),
          headsClipped: heads.filter(clipped).map((h) => h.textContent.trim()),
          narrowestLineInput: Math.round(Math.min(...lineInputs.map((i) => box(i).width))),
        }
      : null,
  };
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "pharmacy-desk-layout" });
  let browser;
  let failed = 0;
  const check = (label, ok, detail) => {
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : ` :: ${JSON.stringify(detail)}`}`);
  };
  try {
    console.log(`BOOT base=${stack.base}`);
    await seed(stack);
    browser = await chromium.launch();
    for (const who of WHO) {
      let storageState;
      for (const width of WIDTHS) {
        const tag = `${who}-${width}`;
        const context = await browser.newContext({ viewport: VIEWPORTS[width], ...(storageState && { storageState }) });
        const page = await context.newPage();
        page.setDefaultTimeout(60000);
        if (!storageState) {
          await browserLogin(stack, page, who);
          storageState = await context.storageState();
        }
        await page.goto(`${stack.base}/dashboard/pharmacy?section=desk`, { waitUntil: "domcontentloaded", timeout: 240000 });
        await page.getByText("Manual Daily Entry").first().waitFor({ timeout: 240000 });
        await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
        if (who === "pharmacist") await page.getByText(/₹\s?2,?48,?250/).first().waitFor({ timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(300);

        const m = await page.evaluate(measure);
        console.log(`MEASURE ${tag} ${JSON.stringify(m)}`);
        const desktop = width !== "390";
        check(`${tag} no sideways page scroll`, m.overflow === 0, m.overflow);
        check(`${tag} the page title "Pharmacy Desk" is an h1 readable on the dark header (contrast >= 4.5)`, m.title?.text === "Pharmacy Desk" && m.title.contrast >= 4.5, m.title);
        check(`${tag} no empty band above the title line (<= 4px)`, m.gapAboveFirstLine !== null && m.gapAboveFirstLine <= 4, m.gapAboveFirstLine);
        if (desktop) check(`${tag} the Command center pill sits beside the title`, m.pillBesideTitle === true, m.pillBesideTitle);
        if (who === "pharmacist") {
          check(`${tag} four figure tiles`, m.tiles.map((t) => t.label).join() === "Sales,Invoices,Stock,Packages", m.tiles);
          check(`${tag} no figure tile truncates its value`, m.tiles.length === 4 && m.tiles.every((t) => !t.clipped), m.tiles);
          const sales = m.tiles.find((t) => t.label === "Sales");
          check(`${tag} the Sales tile shows the whole amount`, /^₹2,?48,?250\.75$/.test(sales?.text || ""), sales);
        } else {
          check(`${tag} no figure tiles for a role that cannot sell`, m.tiles.length === 0, m.tiles);
        }
        check(`${tag} Manual Daily Entry: the four field labels do not overlap`, m.card && m.card.labelOverlaps.length === 0, m.card);
        check(`${tag} Manual Daily Entry: each field label is on one line, unclipped`, m.card && m.card.labelsClippedOrWrapped.length === 0, m.card);
        check(`${tag} Manual Daily Entry: every field input is at least 140px wide`, m.card && m.card.narrowestInput >= 140, m.card);
        check(`${tag} Manual Daily Entry: line-item headers do not overlap or clip`, m.card && m.card.headOverlaps.length === 0 && m.card.headsClipped.length === 0, m.card);
        check(`${tag} Manual Daily Entry: every line-item input is at least 64px wide`, m.card && m.card.narrowestLineInput >= 64, m.card);

        const height = await page.evaluate(() => Math.max(document.querySelector("main")?.scrollHeight ?? 0, document.documentElement.scrollHeight) + 80);
        await page.setViewportSize({ width: VIEWPORTS[width].width, height: Math.min(Math.max(height, VIEWPORTS[width].height), 9000) });
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(out, `${process.env.SHOT_PREFIX || ""}desk-${tag}.png`), fullPage: true });
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await stack.stop();
  }
  console.log(failed ? `PHARMACY-DESK-LAYOUT FAIL ${failed}` : "PHARMACY-DESK-LAYOUT PASS");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("PHARMACY-DESK-LAYOUT FAIL", e);
  process.exit(1);
});
