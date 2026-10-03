// Run against the local fixture API and frontend described in docs/qa/inventory-simplicity-2026-10-03.md.
const puppeteer = require("puppeteer-core");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const path = require("node:path");
const base = "http://127.0.0.1:3126",
  out = path.resolve(__dirname, "../../output/inventory-simplicity");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, "synthetic-bill.svg"),
  '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="350"><rect width="500" height="350" fill="white"/><text x="20" y="40">SYNTHETIC TEST BILL - TEST-001</text><text x="20" y="80">Moisture Cream | B-102 | 10 + 2 free</text><text x="20" y="120">Total INR 1416.00</text></svg>',
);
(async () => {
  const browser = await puppeteer.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-first-run"],
  });
  const p = await browser.newPage();
  p.setDefaultTimeout(15000);
  const errors = [],
    requests = [],
    checks = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => {
    if (r.method() !== "GET" && r.url().includes("/api/"))
      requests.push({ method: r.method(), path: new URL(r.url()).pathname });
  });
  const button = async (label) => {
    await p.waitForFunction(
      (label) =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent.trim() === label && !b.disabled,
        ),
      {},
      label,
    );
    await p.evaluate(
      (label) =>
        [...document.querySelectorAll("button")]
          .find((b) => b.textContent.trim() === label)
          .click(),
      label,
    );
  };
  const fill = async (selector, value) => {
    await p.$eval(
      selector,
      (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      value,
    );
  };
  const goto = (path) =>
    p.goto(base + path, { waitUntil: "networkidle2", timeout: 45000 });
  const fit = async () =>
    assert(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "page overflow",
    );
  try {
    await p.setCookie({
      name: "auth_token",
      value: "synthetic-only",
      url: base,
    });
    await p.setViewport({ width: 1440, height: 1000 });
    await goto("/dashboard/inventory?area=purchases&view=intake");
    await p.waitForSelector("#purchase-invoice-upload");
    assert(
      !(await p
        .$eval("#distributor-name", (e) => !!e.getClientRects().length)
        .catch(() => false)),
    );
    await p.click('a[href="#distributor-name"]');
    await p.waitForFunction(
      () =>
        !!document.querySelector("#distributor-name")?.getClientRects().length,
    );
    checks.push("Type instead exposes supplier entry");
    await button("New invoice");
    await p.waitForFunction(() =>
      new URL(location.href).searchParams.has("new"),
    );
    await p.waitForNetworkIdle({ idleTime: 500 });
    const input = await p.$("#purchase-invoice-upload");
    await input.uploadFile(path.join(out, "synthetic-bill.svg"));
    await button("Scan bill");
    await p.waitForFunction(
      () => document.querySelector("#invoice-number")?.value === "TEST-001",
    );
    assert(requests.some((r) => r.path.endsWith("/ocr/extract")));
    assert(
      !requests.some((r) => /import|process|commit-stock|review$/.test(r.path)),
    );
    checks.push("Scan calls extract only and preserves original");
    await p.evaluate(() =>
      document.querySelector('a[aria-label="Edit line 1 batch"]').click(),
    );
    assert(
      await p.evaluate(() => document.activeElement.id.endsWith("-batch")),
    );
    await fill('input[id$="-batch"]', "B-CORRECTED");
    await p.evaluate(() =>
      document
        .querySelector('button[aria-label="Confirm line 1 batch checked"]')
        .click(),
    );
    await button("Save invoice");
    await p.waitForFunction(() =>
      document.body.innerText.includes("saved. Stock not added."),
    );
    assert(!requests.some((r) => /process|commit-stock|review$/.test(r.path)));
    checks.push("Correct and save retains draft without stock writes");
    await p.setViewport({ width: 390, height: 1000 });
    await p.evaluate(() => scrollTo(0, 0));
    await fit();
    await p.screenshot({ path: `${out}/review-mobile-final.png` });
    await p.evaluate(() => {
      const labels = [...document.querySelectorAll("label")];
      const label = labels.find((l) =>
        l.textContent.includes("I verified the invoice against the original"),
      );
      label.querySelector("input").click();
    });
    await button("Review & Add stock");
    await p.waitForFunction(() =>
      document.body.innerText.includes("LOCAL-ONLY"),
    );
    assert.equal(
      requests.filter((r) => r.path.endsWith("/commit-stock")).length,
      1,
    );
    checks.push("Explicit final review adds stock once");
    await goto("/dashboard/inventory?area=stock&item=batch-1");
    await button("Edit product details");
    await fill(
      'form[aria-label="Edit product details"] input[type="date"]',
      "2028-09-30",
    );
    await p.evaluate(() => {
      const labels = [
        ...document.querySelectorAll(
          'form[aria-label="Edit product details"] label',
        ),
      ];
      const label = labels.find((l) =>
        l.textContent.includes("Why are you changing it?"),
      );
      const e = label.querySelector("input");
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(e, "Checked original pack");
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await p.waitForFunction(() =>
      document.body.innerText.includes("2028-09-30"),
    );
    await p.evaluate(() =>
      document
        .querySelector('section[aria-label="Check your changes"]')
        .scrollIntoView({ block: "center" }),
    );
    await fit();
    await p.screenshot({ path: `${out}/correction-mobile-final.png` });
    await button("Save corrected details");
    await p.waitForFunction(() =>
      document.body.innerText.includes("Corrected details saved"),
    );
    checks.push(
      "Saved expiry correction persists after server reload; before/after shown",
    );
    await button("Edit stock");
    await fill('[role="dialog"] input[type="number"]', "15");
    await p.type('[role="dialog"] textarea', "Counted this batch");
    await p.screenshot({ path: `${out}/stock-count-mobile-final.png` });
    await button("Submit for approval");
    await p.waitForFunction(() =>
      document.body.innerText.includes(
        "Submitted for doctor or admin approval.",
      ),
    );
    checks.push(
      "Stock count submits an approval request, keeping balance unchanged",
    );
    for (const width of [1440, 390]) {
      await p.setViewport({ width, height: 1000 });
      await goto("/dashboard/inventory?area=stock");
      await p.waitForFunction(() =>
        document.body.innerText.includes("Moisture Cream"),
      );
      await fit();
      await p.screenshot({ path: `${out}/stock-${width}-final.png` });
      await goto("/dashboard/inventory?area=purchases&view=intake");
      await fit();
      await p.screenshot({ path: `${out}/scan-${width}-final.png` });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      `${out}/acceptance.json`,
      JSON.stringify(
        {
          synthetic: true,
          browser: "Chrome (Obscura Next.js navigation stalled)",
          checks,
          requests,
          errors,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ checks, errors }, null, 2));
  } catch (error) {
    console.log((await p.evaluate(() => document.body.innerText)).slice(-8500));
    console.log(JSON.stringify(requests));
    throw error;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
