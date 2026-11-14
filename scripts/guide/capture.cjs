// Takes every screenshot of the user guide from the running guide stack.
// Usage: node scripts/guide/capture.cjs [--only <chapter-id-prefix>] [--shot <file>]
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { root, stack, login, api, db: openDb } = require("./lib.cjs");

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const only = flag("--only");
const onlyShot = flag("--shot");

const chaptersDir = path.join(__dirname, "chapters");
const outDir = path.join(root, "output/guide/shots");
const VIEWPORT = { width: 1440, height: 900 };

const HIDE_DEV_CHROME = `
  nextjs-portal, #__next-build-watcher, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; }
  .guide-mark { position: absolute; z-index: 2147483647; min-width: 26px; height: 26px; padding: 0 7px; border-radius: 13px; background: #e11d48; color: #fff;
    font: 700 14px/26px Inter, system-ui, sans-serif; text-align: center; box-shadow: 0 0 0 3px #fff, 0 2px 8px rgba(0,0,0,.35); pointer-events: none; }
  .guide-ring { position: absolute; z-index: 2147483646; border: 3px solid #e11d48; border-radius: 8px; box-shadow: 0 0 0 3px rgba(225,29,72,.18); pointer-events: none; }
`;

function helpers(page, seed) {
  const settle = async (ms = 700) => {
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(ms);
  };
  return {
    stack,
    seed,
    api,
    db: openDb,
    settle,
    /** Opens an app path such as "/dashboard/patients" and waits for it to finish loading. */
    goto: async (route, ms) => {
      await page.goto(stack.base + route, { waitUntil: "domcontentloaded", timeout: 120000 });
      await settle(ms);
    },
    /** Draws a numbered red badge with a ring around a locator. Cleared after the shot. */
    mark: async (locator, label) => {
      const target = typeof locator === "string" ? page.locator(locator).first() : locator.first();
      await target.scrollIntoViewIfNeeded().catch(() => {});
      const box = await target.boundingBox();
      if (!box) throw Error(`mark ${label}: element not visible`);
      await page.evaluate(
        ({ box, label }) => {
          const x = box.x + window.scrollX, y = box.y + window.scrollY;
          const ring = Object.assign(document.createElement("div"), { className: "guide-ring" });
          Object.assign(ring.style, { left: `${x - 5}px`, top: `${y - 5}px`, width: `${box.width + 10}px`, height: `${box.height + 10}px` });
          const badge = Object.assign(document.createElement("div"), { className: "guide-mark", textContent: String(label) });
          Object.assign(badge.style, { left: `${Math.max(2, x - 18)}px`, top: `${Math.max(2, y - 18)}px` });
          document.body.append(ring, badge);
        },
        { box, label },
      );
    },
    clearMarks: () => page.evaluate(() => document.querySelectorAll(".guide-mark, .guide-ring").forEach((el) => el.remove())),
  };
}

(async () => {
  const seedFile = path.join(root, "output/stack/guide/seed.json");
  const seed = fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, "utf8")) : {};
  const files = fs.readdirSync(chaptersDir).filter((f) => f.endsWith(".cjs")).sort();
  const browser = await chromium.launch();
  const pages = {};
  const pageFor = async (who) => {
    if (pages[who]) return pages[who];
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1.25, timezoneId: "Asia/Kolkata", locale: "en-IN" });
    await context.addInitScript((css) => {
      const add = () => document.head && document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css }));
      if (document.head) add();
      else document.addEventListener("DOMContentLoaded", add);
    }, HIDE_DEV_CHROME);
    const page = await context.newPage();
    if (who !== "anon") await login(page, who);
    return (pages[who] = page);
  };

  let failed = 0, taken = 0;
  for (const file of files) {
    const chapter = require(path.join(chaptersDir, file));
    if (only && !chapter.id.startsWith(only)) continue;
    const dir = path.join(outDir, chapter.id);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`\n# ${chapter.id} ${chapter.title}`);
    if (chapter.setup) {
      try {
        await chapter.setup(helpers(await pageFor("admin"), seed));
      } catch (error) {
        failed += 1;
        console.log(`  FAIL setup: ${String(error.message).split("\n")[0]}`);
      }
    }
    for (const section of chapter.sections)
      for (const shot of section.shots || []) {
        if (onlyShot && shot.file !== onlyShot) continue;
        const page = await pageFor(shot.as || "admin");
        const h = helpers(page, seed);
        const target = path.join(dir, `${shot.file}.jpg`);
        try {
          await page.setViewportSize(shot.viewport || VIEWPORT);
          await shot.run(page, h);
          await h.settle(shot.settle ?? 400);
          const element = shot.target ? (typeof shot.target === "string" ? page.locator(shot.target).first() : shot.target(page)) : null;
          if (element) await element.screenshot({ path: target, type: "jpeg", quality: 80 });
          else await page.screenshot({ path: target, type: "jpeg", quality: 80, fullPage: !!shot.fullPage });
          taken += 1;
          console.log(`  ok   ${shot.file}`);
        } catch (error) {
          failed += 1;
          console.log(`  FAIL ${shot.file}: ${String(error.message).split("\n")[0]}`);
          await page.screenshot({ path: path.join(dir, `${shot.file}.FAILED.jpg`), type: "jpeg", quality: 60 }).catch(() => {});
        } finally {
          await h.clearMarks().catch(() => {});
          if (shot.after) await shot.after(page, h).catch((e) => console.log(`  after ${shot.file}: ${e.message}`));
        }
      }
  }
  await browser.close();
  console.log(`\n${taken} shots taken, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
