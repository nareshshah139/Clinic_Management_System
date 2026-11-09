"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { planCoverage, edgeKey } = require("./plan.cjs");
const { runModel } = require("./run.cjs");

const model = {
  id: "selftest-toggle",
  title: "Self-test: toggle with a broken edge",
  initial: "Closed",
  states: { Closed: { label: "Closed" }, Open: { label: "Open" }, Saved: { label: "Saved", terminal: true } },
  transitions: [
    { from: "Closed", event: "toggle", to: "Open" },
    { from: "Open", event: "toggle", to: "Closed" },
    { from: "Open", event: "save", to: "Saved" },
    { from: "Closed", event: "breakIt", to: "Open" },
  ],
};

const paths = planCoverage(model);
const planned = new Set(paths.flat().map(edgeKey));
assert.equal(planned.size, model.transitions.length, "planner covers every transition");
assert.throws(
  () => planCoverage({ ...model, states: { ...model.states, Orphan: {} } }),
  /unreachable states Orphan/,
  "planner rejects unreachable states",
);

const html = `<button id=t onclick="document.body.dataset.s=document.body.dataset.s==='open'?'closed':'open'">t</button>
<button id=s onclick="document.body.dataset.s='saved'">s</button><script>document.body.dataset.s='closed'</script>`;

const driver = {
  reset: async ({ page }) => page.setContent(html),
  actions: {
    toggle: async ({ page }) => page.click("#t"),
    save: async ({ page }) => page.click("#s"),
    breakIt: async () => {},
  },
  checks: {
    Closed: async ({ page }, check) => check((await page.getAttribute("body", "data-s")) === "closed", "body says closed"),
    Open: async ({ page }, check) => check((await page.getAttribute("body", "data-s")) === "open", "body says open"),
    Saved: async ({ page }, check) => check((await page.getAttribute("body", "data-s")) === "saved", "body says saved"),
  },
};

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cov-selftest-"));
  const summary = await runModel({ model, driver }, { baseUrl: "", apiUrl: "", outDir: dir, shotDir: dir });
  assert.equal(summary.transitions.total, 4);
  assert.equal(summary.transitions.passed, 3, "three real transitions pass");
  assert.equal(summary.transitions.failed, 1, "the no-op edge fails because its target check fails");
  assert.deepEqual(summary.uncovered, [], "a failed edge does not hide the edges planned after it");
  assert.equal(summary.states.passed, 3, "each state is reached correctly by some edge");
  assert.equal(summary.states.failed, 0, "the blame stays on the broken edge, not on Open");
  assert.ok(summary.failures.some((f) => f.at === "Closed --breakIt--> Open"), "failure names the broken edge");
  assert.ok(fs.existsSync(path.join(dir, "selftest-toggle.svg")), "graph rendered");
  console.log("harness selftest ok", JSON.stringify({ states: summary.states, transitions: summary.transitions }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
