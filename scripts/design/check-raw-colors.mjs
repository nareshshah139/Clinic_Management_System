#!/usr/bin/env node
// Fails when frontend/src/components or frontend/src/app use a raw Tailwind palette class, a hex
// color, an rgb()/rgba() palette color in script (black or white shadow ink is allowed), a dark:
// variant, or a hover/active background that repeats its resting token, outside
// scripts/design/raw-colors-allowlist.json.
// Usage: node scripts/design/check-raw-colors.mjs [--summary]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, darkVariantPattern, hexPattern, isNeutralInk, lineOf, loadAllowlist, rawClassPattern, rgbPattern, sameTokenStatePairs, walk } from './raw-colors.mjs';

const summaryOnly = process.argv.includes('--summary');
const allowed = loadAllowlist();
const matches = (pattern) => (text) => [...text.matchAll(pattern())].map((m) => ({ index: m.index, value: m[0] }));
const kinds = {
  class: matches(rawClassPattern),
  hex: matches(hexPattern),
  dark: matches(darkVariantPattern),
  rgb: (text, rel) => rel.endsWith('.css') ? [] : [...text.matchAll(rgbPattern())]
    .filter((m) => !isNeutralInk(+m[1], +m[2], +m[3]))
    .map((m) => ({ index: m.index, value: m[0] })),
  state: (text) => sameTokenStatePairs(text).map((p) => ({ index: p.index, value: p.token })),
};
const totals = { ...Object.fromEntries(Object.keys(kinds).map((k) => [k, 0])), allowed: 0 };
const perFile = [];
const findings = [];

for (const file of ['frontend/src/components', 'frontend/src/app'].flatMap((dir) => walk(path.join(ROOT, dir)))) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  const counts = Object.fromEntries(Object.keys(kinds).map((k) => [k, 0]));
  for (const [kind, find] of Object.entries(kinds)) {
    for (const { index, value } of find(text, rel)) {
      if (allowed(rel, kind, value)) { totals.allowed++; continue; }
      counts[kind]++;
      totals[kind]++;
      findings.push(`${rel}:${lineOf(text, index)}  ${kind}  ${value}`);
    }
  }
  if (Object.values(counts).some(Boolean)) perFile.push({ rel, counts });
}

const sum = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);
perFile.sort((a, b) => sum(b.counts) - sum(a.counts));
if (!summaryOnly) findings.forEach((f) => console.log(f));
for (const f of perFile.slice(0, summaryOnly ? 25 : perFile.length)) {
  console.log(`${Object.entries(f.counts).map(([k, n]) => `${String(n).padStart(4)} ${k}`).join(' ')}  ${f.rel}`);
}
const { allowed: allowedCount, ...found } = totals;
console.log(`raw palette classes: ${found.class}, hex literals: ${found.hex}, rgb palette literals: ${found.rgb}, dark: variants: ${found.dark}, same-token hover/active backgrounds: ${found.state} (allowlisted: ${allowedCount})`);
if (sum(found) > 0) {
  console.log('Use a token from frontend/src/app/globals.css (run node scripts/design/tokenize-colors.mjs, which also gives a same-token hover an /90 opacity), or add a justified entry to scripts/design/raw-colors-allowlist.json.');
  process.exit(1);
}
