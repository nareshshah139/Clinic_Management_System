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
    entry.file === relPath && entry.kind === kind && (!entry.values || entry.values.includes(value.toLowerCase())));
}

export const lineOf = (text, index) => text.slice(0, index).split('\n').length;
