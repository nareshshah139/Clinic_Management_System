import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const GRAYS = ['slate', 'gray', 'zinc', 'neutral', 'stone'];
export const HUES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
export const PROPERTIES = ['bg', 'text', 'border(?:-[xytrblse])?', 'ring(?:-offset)?', 'fill', 'stroke', 'from', 'to', 'via', 'divide', 'outline', 'placeholder'];

const boundary = String.raw`(?<![\w-])`;
const core = String.raw`(!?)(${PROPERTIES.join('|')})-(${[...GRAYS, ...HUES].join('|')})-(\d{2,3})(\/(?:\d+|\[[^\]\s]+\]))?(!?)(?![\w-])`;

export const rawClassPattern = () => new RegExp(boundary + core, 'g');
export const hexPattern = () => /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g;
export const darkVariantPattern = () => /(?<![\w-])dark:[^\s'"`{}(),]+/g;

export const rgbPattern = () => /(?<![\w-])rgba?\(\s*(\d{1,3})[\s,_]+(\d{1,3})[\s,_]+(\d{1,3})(?:[\s,_/]+([\d.]+%?))?\s*\)/g;
// Black and white at any alpha are shadow and scrim ink, not palette colors.
export const isNeutralInk = (r, g, b) => r === g && g === b && (r === 0 || r === 255);

const STATE_OPACITY = { hover: '/90', 'group-hover': '/90', 'peer-hover': '/90', active: '/80' };

function splitVariants(token) {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < token.length; i++) {
    if (token[i] === '[') depth++;
    else if (token[i] === ']') depth--;
    else if (token[i] === ':' && depth === 0) last = i;
  }
  return [token.slice(0, last + 1), token.slice(last + 1)];
}

// A hover or active background naming the same token as the resting background in the same
// string literal shows no change. `fix` is the same token at reduced opacity, as button.tsx does;
// it is null when the utility already carries an opacity or an arbitrary value.
export function sameTokenStatePairs(text) {
  const pairs = [];
  for (const literal of text.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
    const present = new Set(literal[2].split(/\s+/));
    for (const { 0: token, index } of literal[2].matchAll(/\S+/g)) {
      const [variants, utility] = splitVariants(token);
      const chain = variants.split(':').slice(0, -1);
      const state = chain.pop();
      if (!(state in STATE_OPACITY) || !utility.startsWith('bg-')) continue;
      if (!present.has(chain.map((v) => `${v}:`).join('') + utility)) continue;
      pairs.push({ index: literal.index + 1 + index, token, fix: /[/[]/.test(utility) ? null : `${token}${STATE_OPACITY[state]}` });
    }
  }
  return pairs;
}

export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);

export function walk(target, files = []) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (SOURCE_EXTENSIONS.has(path.extname(target))) files.push(target);
    return files;
  }
  for (const entry of fs.readdirSync(target)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    walk(path.join(target, entry), files);
  }
  return files;
}

export function loadAllowlist() {
  const file = path.join(ROOT, 'scripts', 'design', 'raw-colors-allowlist.json');
  const entries = JSON.parse(fs.readFileSync(file, 'utf8')).entries;
  return (relPath, kind, value) => entries.some((entry) =>
    entry.file === relPath && entry.kind === kind && (!entry.values || entry.values.includes(value.replace(/\s+/g, '').toLowerCase())));
}

export const lineOf = (text, index) => text.slice(0, index).split('\n').length;
