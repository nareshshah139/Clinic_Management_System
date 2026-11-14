#!/usr/bin/env node
// Rewrites every raw <select> in frontend/src (outside components/ui) to the shared NativeSelect,
// keeping its props and children and only the layout classes (width, margin, flex placement) of its
// className; NativeSelect owns the look. Safe to rerun: a tree with no raw <select> is left as is.
// Usage: node scripts/design/native-select.mjs [--check] [paths...]
//   --check  write nothing; list raw <select> and selects without an accessible name, exit 1 if any.
import fs from 'node:fs';
import path from 'node:path';
import { twMerge } from 'tailwind-merge';
import { ROOT, lineOf, walk } from './raw-colors.mjs';

const check = process.argv.includes('--check');
const targets = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const SRC = path.join(ROOT, 'frontend/src');
const UI = path.join(SRC, 'components/ui') + path.sep;
const IMPORT = "import { NativeSelect } from '@/components/ui/native-select';";
const LAYOUT = /^(?:-?m[trblxyse]?-|w-|min-w-|max-w-|flex-|basis-|grow|shrink|self-|justify-self-|place-self-|col-|row-|order-|block$|hidden$)/;

function tagEnd(text, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (depth > 0 && (c === '"' || c === "'" || c === '`')) quote = c;
    else if (depth === 0 && (c === '"' || c === "'")) quote = c;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return i;
  }
  throw new Error(`unterminated <select at ${start}`);
}

function attribute(tag, name) {
  const at = tag.search(new RegExp(`\\s${name}=`));
  if (at < 0) return null;
  const valueStart = tag.indexOf('=', at) + 1;
  const open = tag[valueStart];
  let end;
  if (open === '"' || open === "'") end = tag.indexOf(open, valueStart + 1) + 1;
  else {
    let depth = 0;
    for (end = valueStart; end < tag.length; end++) {
      if (tag[end] === '{') depth++;
      else if (tag[end] === '}' && --depth === 0) { end++; break; }
    }
  }
  return { start: at, end, value: tag.slice(valueStart, end) };
}

const layoutOnly = (classes) => twMerge(classes.split(/\s+/).filter((cls) => cls && LAYOUT.test(cls.split(':').pop())));

function constantClasses(name, text, file) {
  const own = text.match(new RegExp(`const ${name}\\s*=\\s*(["'\`])([\\s\\S]*?)\\1`));
  if (own) return own[2];
  const from = text.match(new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`))?.[1];
  if (!from) return null;
  const base = from.startsWith('@/') ? path.join(SRC, from.slice(2)) : path.resolve(path.dirname(file), from);
  const target = ['.ts', '.tsx', '/index.ts'].map((ext) => base + ext).find((f) => fs.existsSync(f));
  return target ? constantClasses(name, fs.readFileSync(target, 'utf8'), target) : null;
}

function rewriteClassName(tag, warn, text, file) {
  const attr = attribute(tag, 'className');
  if (!attr) return tag;
  let kept;
  if (/^["']/.test(attr.value)) kept = layoutOnly(attr.value.slice(1, -1));
  else if (/\?|&&|\|\|/.test(attr.value)) { warn('conditional className kept as is'); return tag; }
  else {
    const literals = [...attr.value.matchAll(/(["'])((?:(?!\1).)*)\1|`([^`]*)`/g)].map((m) => m[2] ?? m[3]);
    const code = attr.value
      .replace(/`([^`]*)`/g, (_, body) => [...body.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]).join(' '))
      .replace(/(["'])(?:(?!\1).)*\1/g, '');
    const names = [...code.matchAll(/\b([A-Za-z_]\w*)\b(?!\s*\()/g)].map((m) => m[1]);
    const constants = names.map((name) => constantClasses(name, text, file));
    if (constants.includes(null)) { warn(`className uses ${names.join(', ')} which is not a string constant; kept as is`); return tag; }
    kept = layoutOnly([...constants, ...literals.map((l) => l.replace(/\$\{[^}]*\}/g, ' '))].join(' '));
  }
  let start = attr.start;
  while (/\s/.test(tag[start - 1])) start--;
  return tag.slice(0, start) + (kept ? `${tag.slice(start, attr.start + 1)}className="${kept}"` : '') + tag.slice(attr.end);
}

// true when named; else the text of an unattached sibling <label> right before it, to copy into aria-label.
function accessibleName(text, start, tag) {
  if (/\saria-label(?:ledby)?=/.test(tag)) return true;
  const id = attribute(tag, 'id');
  if (id && text.includes(`htmlFor=${id.value}`)) return true;
  const before = text.slice(0, start);
  if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) return true;
  return before.match(/<label(?![^>]*htmlFor)[^>]*>([^<{]+)<\/label>\s*$/)?.[1].trim() ?? false;
}

function addImport(text) {
  if (text.includes(IMPORT)) return text;
  const imports = [...text.matchAll(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm)];
  const at = imports.length ? imports.at(-1).index + imports.at(-1)[0].length : (text.match(/^\s*(['"])use client\1;?/)?.[0].length ?? 0);
  return `${text.slice(0, at)}\n${IMPORT}${text.slice(at)}`;
}

const files = (targets.length ? targets.map((t) => path.resolve(t)) : [SRC])
  .flatMap((t) => walk(t))
  .filter((f) => f.endsWith('.tsx') && !f.startsWith(UI));
const problems = [];
let converted = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const original = fs.readFileSync(file, 'utf8');
  let text = original;
  for (const tagName of ['NativeSelect', 'select']) {
    for (let at = text.indexOf(`<${tagName}`); at >= 0; at = text.indexOf(`<${tagName}`, at + 1)) {
      if (/[\w.]/.test(text[at + tagName.length + 1])) continue;
      const end = tagEnd(text, at);
      const tag = text.slice(at, end + 1);
      const where = `${rel}:${lineOf(text, at)}`;
      const name = accessibleName(text, at, tag);
      if (name !== true && (check || !name)) problems.push(`${where}  select has no accessible name (add aria-label, a label htmlFor or a wrapping label)`);
      if (tagName === 'NativeSelect') continue;
      if (check) { problems.push(`${where}  raw <select>; use NativeSelect from components/ui/native-select`); continue; }
      const label = typeof name === 'string' ? ` aria-label="${name.replaceAll('"', '&quot;')}"` : '';
      const rewritten = rewriteClassName(tag, (msg) => problems.push(`${where}  ${msg}`), text, file).replace(/^<select/, `<NativeSelect${label}`);
      text = text.slice(0, at) + rewritten + text.slice(end + 1);
      converted++;
    }
  }
  if (check || text === original) continue;
  text = addImport(text.replaceAll('</select>', '</NativeSelect>'));
  fs.writeFileSync(file, text);
}

if (!check) console.log(`converted ${converted} raw <select> to NativeSelect`);
for (const line of problems) console.log(line);
if (check && problems.length) process.exit(1);
if (check) console.log('native-select: no raw <select> outside components/ui, every select is named');
