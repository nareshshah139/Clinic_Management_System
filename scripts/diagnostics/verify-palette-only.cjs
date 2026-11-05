const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const postcss = require('postcss');

const root = path.resolve(__dirname, '../..');
const baseline = process.argv[2] || '6a3d401';
const candidate = process.argv[3];
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const families = '(?:gray|slate|zinc|neutral|stone|green|emerald|lime|blue|sky|cyan|teal|amber|yellow|orange|red|rose|purple|violet|indigo|fuchsia|pink)-(?:50|100|200|300|400|500|600|700|800|900|950)';
const semantic = '(?:background|foreground|card|popover|primary|secondary|muted|accent|border|input|ring|current|transparent|white|black|success|warning|info|highlight|destructive|sidebar|calendar-(?:procedure|consultation))(?:-foreground|-soft|-text|-border|-accent|-primary)?';
const colors = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:text|bg|border(?:-[trblxy])?|ring|divide|from|via|to|fill|stroke)-(?:${families}|${semantic}|\\[#[0-9a-fA-F]{3,8}\\])(?:/[\\d.]+)?(?![\\w-])`, 'g');
const printer = ts.createPrinter({ removeComments: true });

/**
 * @cc [owner:nareshshah139,label:verification] palette-only-source-comparison
 * Comparison MUST reject non-color source changes relative to the supplied baseline.
 * Color literals and class tokens are excluded, but control flow, text, scheduling
 * geometry, event handlers and every non-color class MUST remain identical.
 */
function normalizedSource(file, text) {
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const normalized = ts.transform(tree, [context => {
    function visit(node) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        let value = node.text;
        if (/^(?:#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s]+\)|var\(--(?:foreground|muted|border|card|success|warning|highlight|calendar)[a-z-]*\)|color-mix\(in oklab, var\(--(?:calendar-[a-z-]+|highlight-soft)\) 55%, var\(--card\)\))$/.test(value)) value = 'COLOR';
        else value = value.replace(colors, 'COLOR').replace(/#[0-9a-fA-F]{3,8}\b|var\(--(?:border|foreground|muted|calendar-[a-z-]+)\)/g, 'COLOR');
        return ts.isStringLiteral(node) ? ts.factory.createStringLiteral(value) : ts.factory.createNoSubstitutionTemplateLiteral(value);
      }
      if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        const value = node.text.replace(colors, 'COLOR');
        if (ts.isTemplateHead(node)) return ts.factory.createTemplateHead(value);
        if (ts.isTemplateMiddle(node)) return ts.factory.createTemplateMiddle(value);
        return ts.factory.createTemplateTail(value);
      }
      return ts.visitEachChild(node, visit, context);
    }
    return node => ts.visitNode(node, visit);
  }]).transformed[0];
  return printer.printFile(normalized);
}

function nonColorCss(text) {
  const tree = postcss.parse(text);
  tree.walkComments(comment => comment.remove());
  tree.walkDecls(decl => {
    if ((decl.prop.startsWith('--') && !/^--(?:app-text|radius|text-|font-)/.test(decl.prop)) || /^(?:color|background(?:-color|-image|-clip)?|-webkit-background-clip|border-color|outline-color|caret-color|scrollbar-color|--tw-ring-color)$/.test(decl.prop)) decl.remove();
  });
  for (let pass = 0; pass < 3; pass++) tree.walk(node => {
    if (Array.isArray(node.nodes) && !node.nodes.length) node.remove();
  });
  return tree.toString().replace(/\s+/g, ' ').trim();
}

const files = git('diff', '--name-only', baseline, ...(candidate ? [candidate] : []), '--', 'frontend/src').trim().split('\n').filter(Boolean);
let checked = 0;
for (const file of files) {
  const before = git('show', `${baseline}:${file}`);
  const after = candidate ? git('show', `${candidate}:${file}`) : fs.readFileSync(path.join(root, file), 'utf8');
  if (/\.[jt]sx?$/.test(file)) {
    const left = normalizedSource(file, before);
    const right = normalizedSource(file, after);
    const first = [...left].findIndex((value, index) => value !== right[index]);
    assert.ok(left === right, `Non-color source change in ${file} at ${first}\nBefore ${left.slice(first - 100, first + 200)}\nAfter ${right.slice(first - 100, first + 200)}`);
    checked++;
  } else if (file.endsWith('.css')) {
    assert.equal(nonColorCss(after), nonColorCss(before), `Non-color CSS change in ${file}`);
    checked++;
  } else assert.equal(after, before, `Unexpected source type ${file}`);
}
console.log(JSON.stringify({ baseline, candidate: candidate || 'working-tree', changedSourceFiles: checked, nonColorChanges: 0 }));
