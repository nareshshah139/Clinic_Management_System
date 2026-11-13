// Boots a fresh seeded stack, replays every journey on it, and writes the scorecard.
// Usage: STACK_DATABASE_URL=... node scripts/ux/journeys/run-all.cjs <label> [--compare <label>] [--only id,id]
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { bootStack } = require("../../stack/boot.cjs");
const { seed } = require("./seed.cjs");
const { root } = require("./lib.cjs");

const args = process.argv.slice(2);
const label = args[0] && !args[0].startsWith("--") ? args[0] : "scratch";
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const only = flag("--only")?.split(",");
const scoreFile = (name) => path.join(root, "docs/ux-flow/scorecards", `${name}.json`);
const RAW_INTERACTION = /(?<!\bui)\.(click|fill|press|pressSequentially|type|check|uncheck|selectOption|tap|dblclick|setInputFiles|dispatchEvent|hover|evaluate)\(/;

function journeyFiles() {
  return fs.readdirSync(__dirname).filter((f) => /^j\d+-.*\.cjs$/.test(f)).sort();
}

function assertCounted(file) {
  const lines = fs.readFileSync(path.join(__dirname, file), "utf8").split("\n");
  const raw = lines.map((line, i) => ({ line, n: i + 1 })).filter(({ line }) => RAW_INTERACTION.test(line));
  if (raw.length) throw Error(`${file} interacts outside ui.* (uncounted): ${raw.map((r) => `L${r.n}`).join(", ")}`);
}

(async () => {
  const files = journeyFiles().filter((f) => !only || only.some((id) => f.startsWith(id)));
  files.forEach(assertCounted);
  const stack = await bootStack({ label: `ux-${label}` });
  const browser = await chromium.launch();
  const rows = [];
  try {
    const seeded = await seed(stack);
    const info = { base: stack.base, api: stack.api, users: stack.users, branch: stack.branch, seeded };
    for (const file of files) {
      const { run } = require(path.join(__dirname, file));
      const r = await run({ info, browser, label });
      rows.push({ id: r.id, title: r.title, ok: r.ok, actions: r.count, decisions: r.openDecisions, reentry: r.reentry.length, screens: r.screens.length, goal: r.goal, error: r.error });
      console.log(`${r.ok ? "PASS" : "FAIL"} ${r.id} actions=${r.count} decisions=${r.openDecisions} reentry=${r.reentry.length} screens=${r.screens.length}${r.error ? ` :: ${r.error}` : ""}`);
    }
  } finally {
    await browser.close();
    await stack.stop();
  }
  if (!only) {
    fs.mkdirSync(path.dirname(scoreFile(label)), { recursive: true });
    fs.writeFileSync(scoreFile(label), JSON.stringify(rows, null, 2) + "\n");
  }
  const base = flag("--compare");
  let regressed = false;
  if (base) {
    const before = Object.fromEntries(JSON.parse(fs.readFileSync(scoreFile(base), "utf8")).map((r) => [r.id, r]));
    console.log(`\n${"journey".padEnd(44)} ${base.padStart(9)} ${label.padStart(9)}  delta`);
    for (const r of rows) {
      const b = before[r.id];
      if (!b) continue;
      const delta = r.actions - b.actions;
      if (delta > 0) regressed = true;
      console.log(`${`${r.id} ${r.title}`.slice(0, 44).padEnd(44)} ${String(b.actions).padStart(9)} ${String(r.actions).padStart(9)}  ${delta > 0 ? "+" : ""}${delta}`);
    }
    const sum = (list) => list.reduce((n, r) => n + r.actions, 0);
    const shared = rows.filter((r) => before[r.id]);
    console.log(`${"TOTAL".padEnd(44)} ${String(sum(shared.map((r) => before[r.id]))).padStart(9)} ${String(sum(shared)).padStart(9)}`);
  }
  process.exit(rows.every((r) => r.ok) && !regressed ? 0 : 1);
})();
