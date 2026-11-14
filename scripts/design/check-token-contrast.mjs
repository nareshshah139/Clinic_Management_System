#!/usr/bin/env node
// Computes WCAG contrast for the color token pairs the app renders, straight from globals.css.
// Usage: node scripts/design/check-token-contrast.mjs [--markdown]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './raw-colors.mjs';

const css = fs.readFileSync(path.join(ROOT, 'frontend/src/app/globals.css'), 'utf8');
const STATUSES = ['success', 'warning', 'info', 'destructive', 'highlight'];
const SURFACES = ['background', 'card', 'muted', 'accent'];

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block in globals.css`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function resolve(tokens, name, seen = new Set()) {
  const value = tokens[name];
  if (value === undefined) throw new Error(`--${name} is not defined`);
  const ref = /^var\(--([\w-]+)\)$/.exec(value);
  if (!ref) return value;
  if (seen.has(name)) throw new Error(`--${name} refers to itself`);
  return resolve(tokens, ref[1], seen.add(name));
}

function rgb(value) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!hex) throw new Error(`token value ${value} is not a hex color`);
  const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (value) => { const [r, g, b] = rgb(value).map(linear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

function oklab(value) {
  const [r, g, b] = rgb(value).map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const distance = (a, b) => Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i]));

function pairs() {
  const list = [];
  const add = (fg, bg, min) => list.push([fg, bg, min]);
  for (const s of SURFACES) { add('foreground', s, 4.5); add('muted-foreground', s, 4.5); }
  add('card-foreground', 'card', 4.5);
  add('popover-foreground', 'popover', 4.5);
  add('primary-foreground', 'primary', 4.5);
  add('primary', 'background', 4.5);
  add('secondary-foreground', 'secondary', 4.5);
  add('accent-foreground', 'accent', 4.5);
  add('sidebar-foreground', 'sidebar', 4.5);
  add('sidebar-primary-foreground', 'sidebar-primary', 4.5);
  add('sidebar-accent-foreground', 'sidebar-accent', 4.5);
  add('ring', 'background', 3);
  for (const s of STATUSES) {
    add(`${s}-text`, 'background', 4.5);
    add(`${s}-text`, 'card', 4.5);
    add(`${s}-text`, `${s}-soft`, 4.5);
    add(`${s}-foreground`, s, 4.5);
    add(s, 'background', 4.5);
    add(s, 'card', 4.5);
  }
  return list;
}

const markdown = process.argv.includes('--markdown');
let failures = 0;
const themes = {
  'original palette (:root)': block(':root'),
  'branded palette (:root[data-palette="branded"])': { ...block(':root'), ...block(':root[data-palette="branded"]') },
  '.high-contrast': block('.high-contrast'),
};
for (const [theme, tokens] of Object.entries(themes)) {
  console.log(markdown ? `\n**${theme}**\n\n| foreground | background | ratio | min | |\n|---|---|---|---|---|` : `\n${theme}`);
  for (const [fg, bg, min] of pairs()) {
    const ratio = contrast(resolve(tokens, fg), resolve(tokens, bg));
    const ok = ratio >= min;
    if (!ok) failures++;
    const cells = [`--${fg}`, `--${bg}`, ratio.toFixed(2), min, ok ? 'pass' : 'FAIL'];
    console.log(markdown ? `| ${cells.join(' | ')} |` : `  ${cells[4].padEnd(4)} ${cells[2].padStart(5)}:1 (min ${min})  ${fg} on ${bg}`);
  }
  for (const [suffix, min] of [['', 0.1], ['-text', 0.08], ['-border', 0.06], ['-soft', 0.025]]) {
    const set = STATUSES.map((s) => [s, resolve(tokens, `${s}${suffix}`)]);
    let closest = null;
    for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) {
      const d = distance(set[i][1], set[j][1]);
      if (!closest || d < closest.d) closest = { d, a: set[i][0], b: set[j][0] };
    }
    if (closest.d < min) failures++;
    console.log(`  ${closest.d >= min ? 'pass' : 'FAIL'} closest status${suffix || ' solid'} pair: ${closest.a} / ${closest.b}, OKLab distance ${closest.d.toFixed(3)} (min ${min})`);
  }
}
if (failures) { console.log(`\n${failures} token pairs fail`); process.exit(1); }
console.log('\nall token pairs pass');
