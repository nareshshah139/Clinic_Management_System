#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const bin = path.join(root, 'node_modules', '.bin', 'cc-check');
const skip = new Set(['node_modules', '.git', 'dist', '.next', 'coverage', 'verification', 'output']);
const supported = /\.(ts|tsx|mts|cts|py|pyi)$/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (supported.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

const targets = process.argv.slice(2).map((p) => path.resolve(p));
const files = (targets.length ? targets : walk(root)).filter((f) => fs.readFileSync(f, 'utf8').includes('@cc ['));
const failures = [];
let declared = 0;
let attached = 0;
for (const file of files) {
  const rel = path.relative(root, file);
  const inSource = (fs.readFileSync(file, 'utf8').match(/@cc \[/g) || []).length;
  let listed = 0;
  try {
    execFileSync(bin, ['format', file], { cwd: root, stdio: 'pipe' });
    const out = execFileSync(bin, ['list', '--no-global', file], { cwd: root, stdio: 'pipe' }).toString();
    listed = (out.match(/^◆ /gm) || []).length;
  } catch (error) {
    failures.push(`${rel}: cc-check failed: ${String(error.stderr || error.message).trim()}`);
    continue;
  }
  declared += inSource;
  attached += listed;
  if (listed !== inSource) failures.push(`${rel}: ${inSource} @cc directives, ${listed} attached to a declaration`);
}
console.log(`${files.length} files, ${declared} directives, ${attached} attached`);
for (const failure of failures) console.error(failure);
process.exit(failures.length ? 1 : 0);
