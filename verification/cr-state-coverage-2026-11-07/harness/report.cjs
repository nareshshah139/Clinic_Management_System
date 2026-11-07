"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { edgeKey } = require("./plan.cjs");

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

function coverage(model, result) {
  const stateStatus = {};
  for (const s of Object.keys(model.states)) stateStatus[s] = "unvisited";
  const edgeStatus = {};
  for (const t of model.transitions) edgeStatus[edgeKey(t)] = { status: "uncovered", runs: 0 };
  for (const run of result.paths) {
    for (const step of run.steps) {
      if (step.kind === "state") {
        if (step.ok) stateStatus[step.state] = "passed";
        else if (stateStatus[step.state] !== "passed") stateStatus[step.state] = "failed";
      } else {
        const e = edgeStatus[step.edge];
        e.runs += 1;
        if (!step.ok) e.status = "failed";
        else if (e.status !== "failed") e.status = "passed";
      }
    }
  }
  const states = Object.values(stateStatus);
  const edges = Object.values(edgeStatus);
  return {
    stateStatus,
    edgeStatus,
    states: { total: states.length, passed: states.filter((s) => s === "passed").length, failed: states.filter((s) => s === "failed").length },
    transitions: { total: edges.length, passed: edges.filter((e) => e.status === "passed").length, failed: edges.filter((e) => e.status === "failed").length },
  };
}

function toDot(model, cov) {
  const fill = { passed: "#d1fadf", failed: "#fee4e2", unvisited: "#eaecf0" };
  const line = { passed: "#039855", failed: "#d92d20", unvisited: "#98a2b3" };
  const pct = (c) => `${c.passed}/${c.total} (${((100 * c.passed) / c.total).toFixed(0)}%)`;
  const out = [
    `digraph "${esc(model.id)}" {`,
    `  graph [rankdir=LR, fontname="Helvetica", fontsize=13, labelloc=t, label="${esc(model.title)}\\nstates ${pct(cov.states)} · transitions ${pct(cov.transitions)}", pad=0.3, nodesep=0.45, ranksep=0.7];`,
    `  node [shape=box, style="rounded,filled", fontname="Helvetica", fontsize=11, penwidth=1.6];`,
    `  edge [fontname="Helvetica", fontsize=9, penwidth=1.4, arrowsize=0.7];`,
    `  __start [shape=point, width=0.15, label=""];`,
    `  __start -> "${esc(model.initial)}";`,
  ];
  for (const [id, s] of Object.entries(model.states)) {
    const st = cov.stateStatus[id];
    out.push(`  "${esc(id)}" [label="${esc(s.label || id)}", fillcolor="${fill[st]}", color="${line[st]}"${s.terminal ? ", peripheries=2" : ""}];`);
  }
  for (const t of model.transitions) {
    const e = cov.edgeStatus[edgeKey(t)];
    const color = e.status === "passed" ? line.passed : e.status === "failed" ? line.failed : line.unvisited;
    const style = e.status === "uncovered" ? "dashed" : "solid";
    out.push(`  "${esc(t.from)}" -> "${esc(t.to)}" [label="${esc(t.label || t.event)}${e.runs > 1 ? ` ×${e.runs}` : ""}", color="${color}", fontcolor="${color}", style=${style}];`);
  }
  out.push("}");
  return out.join("\n");
}

function writeReport(model, result, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const cov = coverage(model, result);
  const dot = toDot(model, cov);
  const base = path.join(dir, model.id);
  fs.writeFileSync(`${base}.dot`, dot);
  execFileSync("dot", ["-Tsvg", `${base}.dot`, "-o", `${base}.svg`]);
  execFileSync("dot", ["-Tpng", "-Gdpi=144", `${base}.dot`, "-o", `${base}.png`]);
  const summary = {
    model: model.id,
    title: model.title,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    states: cov.states,
    transitions: cov.transitions,
    uncovered: Object.entries(cov.edgeStatus).filter(([, e]) => e.status === "uncovered").map(([k]) => k),
    failures: result.paths.flatMap((p, i) => p.steps.filter((s) => !s.ok).map((s) => ({ path: i + 1, at: s.edge || s.state, error: s.error }))),
    paths: result.paths.map((p, i) => ({
      path: i + 1,
      ok: p.steps.every((s) => s.ok),
      events: p.steps.filter((s) => s.kind === "edge").map((s) => s.edge),
      assertions: p.steps.filter((s) => s.kind === "state").map((s) => ({ state: s.state, ok: s.ok, checks: s.checks, error: s.error })),
    })),
  };
  fs.writeFileSync(`${base}.coverage.json`, JSON.stringify(summary, null, 2));
  return summary;
}

module.exports = { coverage, toDot, writeReport };
