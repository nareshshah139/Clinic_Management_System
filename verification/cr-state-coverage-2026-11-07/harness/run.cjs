"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { validateModel, planNextPath, edgeKey } = require("./plan.cjs");
const { writeReport } = require("./report.cjs");

function makeCheck(log) {
  return (ok, message) => {
    log.push({ ok: Boolean(ok), message });
    if (!ok) throw Error(`check failed: ${message}`);
  };
}

const errText = (err) => String((err && err.message) || err).slice(0, 500);

async function runModel(spec, opts) {
  const { model, driver } = spec;
  validateModel(model);
  const maxSteps = model.maxSteps || 14;
  const shotDir = path.join(opts.shotDir, model.id);
  fs.mkdirSync(shotDir, { recursive: true });
  const browser = await chromium.launch();
  const result = { startedAt: new Date().toISOString(), paths: [] };
  const shared = {};
  const uncovered = new Set(model.transitions.map(edgeKey));
  const blocked = new Set();
  if (driver.setup) await driver.setup({ baseUrl: opts.baseUrl, apiUrl: opts.apiUrl, shared });
  try {
    for (let i = 0; ; i++) {
      const planned = planNextPath(model, uncovered, blocked, maxSteps);
      if (!planned) break;
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
      const page = await context.newPage();
      const ctx = { page, context, baseUrl: opts.baseUrl, apiUrl: opts.apiUrl, shared, vars: {}, pathIndex: i + 1 };
      const steps = [];
      result.paths.push({ planned: planned.map(edgeKey), steps });
      const shot = (n, state) =>
        page.screenshot({ path: path.join(shotDir, `p${String(i + 1).padStart(2, "0")}-s${String(n).padStart(2, "0")}-${state}.png`) }).catch(() => {});
      const assertState = async (state, n) => {
        const checks = [];
        try {
          const fn = driver.checks[state];
          if (!fn) throw Error(`no check for state ${state}`);
          await fn(ctx, makeCheck(checks));
          steps.push({ kind: "state", state, ok: true, checks });
        } catch (err) {
          steps.push({ kind: "state", state, ok: false, checks, error: errText(err) });
          throw err;
        } finally {
          await shot(n, state);
        }
      };
      let current = null;
      try {
        await driver.reset(ctx);
        await assertState(model.initial, 0);
        for (const [n, t] of planned.entries()) {
          current = t;
          const action = driver.actions[t.event];
          if (!action) throw Error(`no action for event ${t.event}`);
          await action(ctx, t);
          await assertState(t.to, n + 1);
          steps.push({ kind: "edge", edge: edgeKey(t), ok: true });
          uncovered.delete(edgeKey(t));
          current = null;
        }
      } catch (err) {
        if (current) {
          steps.push({ kind: "edge", edge: edgeKey(current), ok: false, error: errText(err) });
          uncovered.delete(edgeKey(current));
          blocked.add(edgeKey(current));
        } else {
          for (const t of planned) {
            uncovered.delete(edgeKey(t));
            blocked.add(edgeKey(t));
          }
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    if (driver.teardown) await driver.teardown({ shared }).catch(() => {});
    await browser.close();
  }
  result.finishedAt = new Date().toISOString();
  return writeReport(model, result, opts.outDir);
}

async function main() {
  const files = process.argv.slice(2);
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const apiUrl = process.env.API_URL || "http://localhost:4000";
  const root = path.resolve(__dirname, "..");
  const outDir = process.env.OUT_DIR || path.join(root, "results");
  const shotDir = process.env.SHOT_DIR || path.join(root, "../../output/diagnostics/cr-state-coverage/screenshots");
  let failed = false;
  for (const file of files) {
    const spec = require(path.resolve(file));
    const summary = await runModel(spec, { baseUrl, apiUrl, outDir, shotDir });
    console.log(`${summary.model}: states ${summary.states.passed}/${summary.states.total}, transitions ${summary.transitions.passed}/${summary.transitions.total}, failures ${summary.failures.length}`);
    for (const f of summary.failures) console.log(`  FAIL path ${f.path} at ${f.at}: ${f.error}`);
    for (const u of summary.uncovered) console.log(`  UNCOVERED ${u}`);
    if (summary.failures.length || summary.uncovered.length) failed = true;
  }
  process.exitCode = failed ? 1 : 0;
}

if (require.main === module) main();

module.exports = { runModel };
