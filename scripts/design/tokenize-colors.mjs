#!/usr/bin/env node
// Rewrites raw Tailwind palette classes (and Tailwind palette hex and rgb() values in inline styles) to
// the semantic tokens in frontend/src/app/globals.css, drops dead `dark:` variants, and gives a hover or
// active background that collapsed onto its resting token a visible change (`hover:bg-X/90`).
// Safe to rerun: every rewrite produces text that none of the rewrites match again.
// Usage: node scripts/design/tokenize-colors.mjs [--dry-run] [paths...]   (default: frontend/src frontend/__tests__)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, darkVariantPattern, hexPattern, isNeutralInk, loadAllowlist, rawClassPattern, rgbPattern, sameTokenStatePairs, walk } from './raw-colors.mjs';

const MAP = {
  families: {
    slate: 'gray', gray: 'gray', zinc: 'gray', neutral: 'gray', stone: 'gray',
    red: 'destructive', rose: 'destructive',
    green: 'success', emerald: 'success', teal: 'success', lime: 'success',
    amber: 'warning', yellow: 'warning', orange: 'warning',
    blue: 'info', sky: 'info', cyan: 'info', indigo: 'info',
    violet: 'highlight', purple: 'highlight', fuchsia: 'highlight', pink: 'highlight',
  },
  // Per property: [up to shade, gray token, status suffix ('' is the solid status color)].
  bands: {
    bg: [[200, 'muted', 'soft'], [400, 'border', 'border'], [600, 'muted-foreground', ''], [950, 'foreground', '']],
    text: [[200, 'muted', 'foreground'], [500, 'muted-foreground', ''], [600, 'muted-foreground', 'text'], [950, 'foreground', 'text']],
    border: [[300, 'border', 'border'], [400, 'border', ''], [600, 'muted-foreground', ''], [950, 'foreground', '']],
    divide: [[950, 'border', 'border']],
    ring: [[300, 'border', 'border'], [950, 'ring', '']],
    outline: [[300, 'ring', 'border'], [950, 'ring', '']],
    placeholder: [[950, 'muted-foreground', 'text']],
    paint: [[200, 'muted', 'soft'], [400, 'border', ''], [600, 'muted-foreground', ''], [950, 'foreground', '']],
  },
  // Interaction variants name a role of their own: a light gray hover surface is the accent, a focus color is the ring.
  states: [
    { variants: /(?:^|:)(?:hover|active|group-hover|peer-hover|data-\[state=[\w-]+\])(?::|$)/, properties: ['bg'], family: 'gray', upTo: 200, token: 'accent' },
    { variants: /(?:^|:)(?:focus|focus-visible|focus-within)(?::|$)/, properties: ['ring', 'border', 'outline'], token: 'ring' },
  ],
  // Tailwind palette values written as hex in inline styles, keyed to [palette family, shade].
  hex: {
    '#f9fafb': ['gray', 50], '#fafafa': ['neutral', 50], '#f3f4f6': ['gray', 100], '#e5e7eb': ['gray', 200], '#e2e8f0': ['slate', 200],
    '#d1d5db': ['gray', 300], '#cbd5e1': ['slate', 300], '#9ca3af': ['gray', 400], '#94a3b8': ['slate', 400], '#6b7280': ['gray', 500],
    '#64748b': ['slate', 500], '#4b5563': ['gray', 600], '#475569': ['slate', 600], '#374151': ['gray', 700], '#1f2937': ['gray', 800], '#111827': ['gray', 900],
    '#ef4444': ['red', 500], '#dc2626': ['red', 600], '#b91c1c': ['red', 700],
    '#f0fdf4': ['green', 50], '#22c55e': ['green', 500], '#16a34a': ['green', 600], '#15803d': ['green', 700], '#10b981': ['emerald', 500], '#059669': ['emerald', 600],
    '#dbeafe': ['blue', 100], '#ede9fe': ['violet', 100], '#facc15': ['yellow', 400],
    '#fef3c7': ['amber', 100], '#fcd34d': ['amber', 300], '#fbbf24': ['amber', 400], '#f59e0b': ['amber', 500], '#a16207': ['yellow', 700], '#ea580c': ['orange', 600],
    '#93c5fd': ['blue', 300], '#3b82f6': ['blue', 500], '#2563eb': ['blue', 600], '#1d4ed8': ['blue', 700], '#1e40af': ['blue', 800], '#0ea5e9': ['sky', 500],
    '#d8b4fe': ['purple', 300], '#a855f7': ['purple', 500], '#8b5cf6': ['violet', 500], '#9333ea': ['purple', 600], '#6b21a8': ['purple', 800],
  },
  // The style property a hex value is assigned to decides which band it reads from.
  hexProperties: [
    [/(?<![\w-])(?:background-color|backgroundColor|background)\s*[:=]/g, 'bg'],
    [/(?<![\w-])(?:border(?:-(?:top|right|bottom|left))?(?:-color)?|border(?:Top|Right|Bottom|Left)?(?:Color)?|outline|box-shadow|boxShadow)\s*[:=]/g, 'border'],
    [/(?<![\w-])(?:stroke|fill)\s*[:=]/g, 'paint'],
    [/(?<![\w-])color\s*[:=]/g, 'text'],
  ],
};

const bandProperty = (property) =>
  property.startsWith('border') ? 'border' : property.startsWith('ring') ? 'ring'
    : ['from', 'via', 'to', 'fill', 'stroke'].includes(property) ? 'paint' : property;

function tokenFor(property, palette, shade, variants = '') {
  const family = MAP.families[palette];
  const band = bandProperty(property);
  for (const state of MAP.states) {
    if (state.variants.test(variants) && state.properties.includes(band) && (!state.family || state.family === family) && (!state.upTo || shade <= state.upTo)) {
      return state.token;
    }
  }
  const [, grayToken, suffix] = MAP.bands[band].find(([upTo]) => shade <= upTo) ?? MAP.bands[band].at(-1);
  if (family === 'gray') return grayToken;
  return suffix ? `${family}-${suffix}` : family;
}

function variantsBefore(text, index) {
  let start = index;
  while (start > 0 && !/[\s'"`{}(),]/.test(text[start - 1])) start--;
  return text.slice(start, index);
}

function rewriteClasses(text) {
  let count = 0;
  const out = text.replace(rawClassPattern(), (match, bang, property, palette, shade, opacity = '', trailingBang, offset, whole) => {
    count++;
    return `${bang}${property}-${tokenFor(property, palette, Number(shade), variantsBefore(whole, offset))}${opacity}${trailingBang}`;
  });
  return { out, count };
}

function dropDarkVariants(text) {
  let count = 0;
  const out = text
    .replace(new RegExp(String.raw`[ \t]+` + darkVariantPattern().source, 'g'), () => { count++; return ''; })
    .replace(new RegExp(String.raw`(?<=['"\`])` + darkVariantPattern().source + String.raw`[ \t]*`, 'g'), () => { count++; return ''; });
  return { out, count };
}

function hexProperty(linePrefix) {
  let best = null;
  for (const [pattern, band] of MAP.hexProperties) {
    for (const m of linePrefix.matchAll(pattern)) if (!best || m.index > best.index) best = { index: m.index, band };
  }
  return best?.band ?? null;
}

function paletteVar(key, whole, offset) {
  const palette = MAP.hex[key];
  const lineStart = whole.lastIndexOf('\n', offset) + 1;
  let contextStart = lineStart;
  for (let i = 0; i < 3 && contextStart > 0; i++) contextStart = whole.lastIndexOf('\n', contextStart - 2) + 1;
  // A value on its own line (a ternary branch, an array push) takes the property from the lines just above.
  const band = hexProperty(whole.slice(lineStart, offset)) ?? hexProperty(whole.slice(contextStart, lineStart));
  if (!palette || !band) return null;
  return `var(--${tokenFor(band === 'paint' ? 'fill' : band, palette[0], palette[1])})`;
}

function rewriteHex(text, relPath, allowed) {
  let count = 0;
  const unmapped = [];
  const out = text.replace(hexPattern(), (hex, offset, whole) => {
    if (allowed(relPath, 'hex', hex)) return hex;
    const value = paletteVar(hex.toLowerCase(), whole, offset);
    if (!value) {
      unmapped.push(`${hex}@${whole.slice(0, offset).split('\n').length}`);
      return hex;
    }
    count++;
    return value;
  });
  return { out, count, unmapped };
}

const toHex = (...channels) => `#${channels.map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`;

function rewriteRgb(text, relPath, allowed) {
  let count = 0;
  const unmapped = [];
  const out = text.replace(rgbPattern(), (literal, r, g, b, alpha, offset, whole) => {
    if (isNeutralInk(+r, +g, +b) || allowed(relPath, 'rgb', literal)) return literal;
    const value = paletteVar(toHex(r, g, b), whole, offset);
    if (!value) {
      unmapped.push(`${literal.replace(/\s+/g, '')}@${whole.slice(0, offset).split('\n').length}`);
      return literal;
    }
    count++;
    const percent = alpha === undefined ? 100 : Math.round(alpha.endsWith('%') ? parseFloat(alpha) : Number(alpha) * 100);
    return percent >= 100 ? value : `color-mix(in srgb, ${value} ${percent}%, transparent)`;
  });
  return { out, count, unmapped };
}

function distinguishStates(text) {
  const fixes = sameTokenStatePairs(text).filter((pair) => pair.fix);
  let out = text;
  for (const { index, token, fix } of fixes.reverse()) out = out.slice(0, index) + fix + out.slice(index + token.length);
  return { out, count: fixes.length };
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targets = args.filter((a) => !a.startsWith('--'));
const roots = (targets.length ? targets : ['frontend/src', 'frontend/__tests__']).map((t) => path.resolve(ROOT, t));
const allowed = loadAllowlist();
const hexScope = (rel) => rel.startsWith('frontend/src/components/') || rel.startsWith('frontend/src/app/');

const totals = { classes: 0, dark: 0, hex: 0, rgb: 0, states: 0, files: 0 };
const rows = [];
for (const file of roots.flatMap((r) => walk(r))) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const before = fs.readFileSync(file, 'utf8');
  const inlineScope = hexScope(rel) && !rel.endsWith('.css');
  const none = (text) => ({ out: text, count: 0, unmapped: [] });
  const classes = rewriteClasses(before);
  const dark = dropDarkVariants(classes.out);
  const hex = inlineScope ? rewriteHex(dark.out, rel, allowed) : none(dark.out);
  const rgb = inlineScope ? rewriteRgb(hex.out, rel, allowed) : none(hex.out);
  const states = distinguishStates(rgb.out);
  if (states.out !== before) {
    totals.files++;
    if (!dryRun) fs.writeFileSync(file, states.out);
  }
  const row = { rel, classes: classes.count, dark: dark.count, hex: hex.count, rgb: rgb.count, states: states.count, unmapped: [...hex.unmapped, ...rgb.unmapped] };
  for (const key of ['classes', 'dark', 'hex', 'rgb', 'states']) totals[key] += row[key];
  if (row.classes + row.dark + row.hex + row.rgb + row.states || row.unmapped.length) rows.push(row);
}

const changes = (r) => r.classes + r.dark + r.hex + r.rgb + r.states;
rows.sort((a, b) => changes(b) - changes(a));
for (const r of rows) {
  const left = r.unmapped.length ? `  unmapped: ${r.unmapped.join(' ')}` : '';
  console.log(`${String(r.classes).padStart(5)} classes ${String(r.dark).padStart(4)} dark ${String(r.hex).padStart(4)} hex ${String(r.rgb).padStart(4)} rgb ${String(r.states).padStart(4)} states  ${r.rel}${left}`);
}
console.log(`${dryRun ? 'would change' : 'changed'} ${totals.files} files: ${totals.classes} palette classes, ${totals.dark} dark: variants, ${totals.hex} hex values, ${totals.rgb} rgb values, ${totals.states} same-token hover/active backgrounds`);
