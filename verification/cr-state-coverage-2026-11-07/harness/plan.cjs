"use strict";

const edgeKey = (t) => `${t.from} --${t.event}--> ${t.to}`;

function validateModel(model) {
  const states = new Set(Object.keys(model.states));
  if (!states.has(model.initial)) throw Error(`${model.id}: initial ${model.initial} is not a state`);
  const seen = new Set();
  for (const t of model.transitions) {
    if (!states.has(t.from)) throw Error(`${model.id}: unknown from-state ${t.from}`);
    if (!states.has(t.to)) throw Error(`${model.id}: unknown to-state ${t.to}`);
    const k = edgeKey(t);
    if (seen.has(k)) throw Error(`${model.id}: duplicate transition ${k}`);
    seen.add(k);
  }
  const reachable = new Set([model.initial]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of model.transitions) {
      if (reachable.has(t.from) && !reachable.has(t.to)) {
        reachable.add(t.to);
        grew = true;
      }
    }
  }
  const unreachable = [...states].filter((s) => !reachable.has(s));
  if (unreachable.length) throw Error(`${model.id}: unreachable states ${unreachable.join(", ")}`);
}

function shortestPathToUncovered(model, from, uncovered, blocked) {
  const queue = [[from, []]];
  const visited = new Set([from]);
  while (queue.length) {
    const [state, path] = queue.shift();
    const outgoing = model.transitions.filter((t) => t.from === state && !blocked.has(edgeKey(t)));
    const target = outgoing.find((t) => uncovered.has(edgeKey(t)));
    if (target) return [...path, target];
    for (const t of outgoing) {
      if (!visited.has(t.to)) {
        visited.add(t.to);
        queue.push([t.to, [...path, t]]);
      }
    }
  }
  return null;
}

function planNextPath(model, uncovered, blocked = new Set(), maxSteps = 14) {
  const pending = new Set(uncovered);
  let state = model.initial;
  const path = [];
  for (;;) {
    const hop = shortestPathToUncovered(model, state, pending, blocked);
    if (!hop) break;
    if (path.length && path.length + hop.length > maxSteps) break;
    for (const t of hop) {
      path.push(t);
      pending.delete(edgeKey(t));
    }
    state = path[path.length - 1].to;
  }
  return path.length ? path : null;
}

function planCoverage(model, { maxSteps = 14 } = {}) {
  validateModel(model);
  const uncovered = new Set(model.transitions.map(edgeKey));
  const paths = [];
  for (let path = planNextPath(model, uncovered, new Set(), maxSteps); path; path = planNextPath(model, uncovered, new Set(), maxSteps)) {
    for (const t of path) uncovered.delete(edgeKey(t));
    paths.push(path);
  }
  return paths;
}

module.exports = { edgeKey, validateModel, planNextPath, planCoverage };
