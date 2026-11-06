#!/usr/bin/env node
const { execFile, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const run = promisify(execFile);
const root = path.resolve(__dirname, '..', '..');
const bin = path.join(root, 'node_modules', '.bin', 'cc-check');
const supported = /\.(ts|tsx|mts|cts|py|pyi)$/;

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean)
    .filter((f) => !f.split('/').some((part) => part === 'verification' || part === 'node_modules'))
    .map((f) => path.join(root, f));
}

const cc = (...args) => run(bin, args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const reason = (error) => String(error.stderr || error.message).trim();

async function checkSource(file) {
  const rel = path.relative(root, file);
  const declared = (fs.readFileSync(file, 'utf8').match(/@cc \[/g) || []).length;
  try {
    await cc('format', file);
    const { stdout } = await cc('list', '--no-global', file);
    const attached = (stdout.match(/^◆ /gm) || []).length;
    const failure = attached === declared ? null : `${rel}: ${declared} @cc directives, ${attached} attached to a declaration`;
    return { declared, attached, failure };
  } catch (error) {
    return { declared: 0, attached: 0, failure: `${rel}: cc-check failed: ${reason(error)}` };
  }
}

async function checkContractsFile(file) {
  try {
    await cc('format', file);
    return { declared: 0, attached: 0, failure: null };
  } catch (error) {
    return { declared: 0, attached: 0, failure: `${path.relative(root, file)}: cc-check failed: ${reason(error)}` };
  }
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

async function main() {
  const targets = process.argv.slice(2).map((p) => path.resolve(p));
  const candidates = targets.length ? targets : trackedFiles();
  const contractFiles = candidates.filter((f) => path.basename(f) === 'CONTRACTS');
  const sources = candidates.filter((f) => supported.test(f) && !f.endsWith('.d.ts') && fs.existsSync(f)
    && fs.readFileSync(f, 'utf8').includes('@cc ['));
  const limit = Math.max(2, os.cpus().length);
  const results = [
    ...(await pool(sources, limit, checkSource)),
    ...(await pool(contractFiles, limit, checkContractsFile)),
  ];
  const declared = results.reduce((sum, r) => sum + r.declared, 0);
  const attached = results.reduce((sum, r) => sum + r.attached, 0);
  const failures = results.map((r) => r.failure).filter(Boolean).sort();
  console.log(`${contractFiles.length} CONTRACTS files, ${sources.length} files, ${declared} directives, ${attached} attached`);
  for (const failure of failures) console.error(failure);
  process.exit(failures.length ? 1 : 0);
}

main();
