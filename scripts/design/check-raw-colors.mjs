#!/usr/bin/env node
// Fails when frontend/src/components or frontend/src/app use a raw Tailwind palette class, a hex
// color, or a dark: variant outside scripts/design/raw-colors-allowlist.json.
// Usage: node scripts/design/check-raw-colors.mjs [--summary]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, darkVariantPattern, hexPattern, lineOf, loadAllowlist, rawClassPattern, walk } from './raw-colors.mjs';

const summaryOnly = process.argv.includes('--summary');
const allowed = loadAllowlist();
const kinds = { class: rawClassPattern, hex: hexPattern, dark: darkVariantPattern };
const totals = { class: 0, hex: 0, dark: 0, allowed: 0 };
const perFile = [];
const findings = [];

for (const file of ['frontend/src/components', 'frontend/src/app'].flatMap((dir) => walk(path.join(ROOT, dir)))) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  const counts = { class: 0, hex: 0, dark: 0 };
  for (const [kind, pattern] of Object.entries(kinds)) {
    for (const m of text.matchAll(pattern())) {
      if (allowed(rel, kind, m[0])) { totals.allowed++; continue; }
      counts[kind]++;
      totals[kind]++;
      findings.push(`${rel}:${lineOf(text, m.index)}  ${kind}  ${m[0]}`);
    }
  }
  if (counts.class + counts.hex + counts.dark) perFile.push({ rel, ...counts });
}

perFile.sort((a, b) => (b.class + b.hex + b.dark) - (a.class + a.hex + a.dark));
if (!summaryOnly) findings.forEach((f) => console.log(f));
for (const f of perFile.slice(0, summaryOnly ? 25 : perFile.length)) {
  console.log(`${String(f.class).padStart(5)} class ${String(f.hex).padStart(4)} hex ${String(f.dark).padStart(4)} dark  ${f.rel}`);
}
console.log(`raw palette classes: ${totals.class}, hex literals: ${totals.hex}, dark: variants: ${totals.dark} (allowlisted: ${totals.allowed})`);
if (totals.class + totals.hex + totals.dark > 0) {
  console.log('Use a token from frontend/src/app/globals.css (run node scripts/design/tokenize-colors.mjs), or add a justified entry to scripts/design/raw-colors-allowlist.json.');
  process.exit(1);
}
