#!/usr/bin/env node
// check-attachment.cjs proves every @cc rule is attached to some declaration. It cannot see a rule
// that slid onto a different declaration, or one whose text changed. This compares both against a base revision.
// Usage: node scripts/contracts/compare-attachment.cjs <base-rev> [--removed-with-its-surface <file>:<rule> ...]
// The flag names a rule whose whole surface was deleted on purpose; it is printed, not failed.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const bin = path.join(root, 'node_modules', '.bin', 'cc-check');
const [base, ...rest] = process.argv.slice(2);
if (!base) throw Error('Usage: compare-attachment.cjs <base-rev>');
const acknowledged = new Set(rest.filter((arg, i) => rest[i - 1] === '--removed-with-its-surface'));
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024 }).toString();
const supported = /\.(ts|tsx|mts|cts|py|pyi)$/;

function rules(file) {
  let out;
  try {
    out = execFileSync(bin, ['list', '--no-global', file], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch (error) {
    throw Error(`cc-check failed on ${file}: ${String(error.stderr || error.message).trim()}`);
  }
  const found = new Map();
  for (const block of out.split(/^◆ /m).slice(1)) {
    const [head, scope, ...rest] = block.split('\n');
    const name = head.replace(/:\d+\s*$/, '').trim();
    const declaration = scope.trim().split(' · ')[0];
    const text = rest.filter((line) => line.trim().startsWith('>')).map((line) => line.trim()).join('\n');
    found.set(name, { declaration, text });
  }
  return found;
}

function rulesAt(rev, file) {
  let source;
  try {
    source = execFileSync('git', ['show', `${rev}:${file}`], { cwd: root, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return new Map();
  }
  if (!source.includes('@cc [')) return new Map();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-base-'));
  const copy = path.join(dir, path.basename(file));
  fs.writeFileSync(copy, source);
  try {
    return rules(copy);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const changed = git('diff', '--name-status', '-M', `${base}...HEAD`).trim().split('\n').filter(Boolean)
  .map((line) => line.split('\t'))
  .map(([status, from, to]) => ({ status: status[0], before: from, after: status[0] === 'R' ? to : from }))
  .filter(({ before }) => supported.test(before));

const live = (file) => (fs.existsSync(path.join(root, file)) ? rules(path.join(root, file)) : new Map());
// A rule stated in two files survives the deletion of one of them when the other still states it word for word.
const statedElsewhere = (name, text, except) =>
  git('grep', '-l', `@cc .*] ${name}$`, '--', '*.ts', '*.tsx').trim().split('\n').filter((f) => f && f !== except)
    .some((f) => live(f).get(name)?.text === text);

const problems = [];
const removed = [];
let compared = 0;
for (const { before, after } of changed) {
  const then = rulesAt(base, before);
  if (!then.size) continue;
  const now = live(after);
  for (const [name, was] of then) {
    compared++;
    const is = now.get(name);
    if (!is) {
      if (acknowledged.has(`${before}:${name}`)) removed.push(`${before}: rule ${name} was removed with its surface`);
      else if (!statedElsewhere(name, was.text, after)) problems.push(`${before}: rule ${name} is gone (was on ${was.declaration})`);
    } else if (is.declaration !== was.declaration) problems.push(`${after}: rule ${name} moved from ${was.declaration} to ${is.declaration}`);
    else if (is.text !== was.text) problems.push(`${after}: rule ${name} text changed`);
  }
}

console.log(`Compared ${compared} rules in ${changed.length} changed files against ${base}.`);
if (removed.length) console.log(removed.join('\n'));
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Every rule is on the same declaration with the same text.');
