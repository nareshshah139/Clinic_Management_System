import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const ts = require('typescript');
const root = path.resolve(new URL('../../frontend/src', import.meta.url).pathname);
const write = process.argv.includes('--write');
const target = process.argv.find(argument => argument.startsWith('--target='))?.slice(9);
const excluded = /(?:\.spec\.|\.test\.|\/printStyles\.|\/pdf-export\.|\/api-types\.)/;
const families = { green: 'success', emerald: 'success', lime: 'success', blue: 'info', sky: 'info', cyan: 'info', teal: 'info', amber: 'warning', yellow: 'warning', orange: 'warning', red: 'destructive', rose: 'destructive', purple: 'highlight', violet: 'highlight', indigo: 'highlight', fuchsia: 'highlight', pink: 'highlight' };

/**
 * @cc [owner:nareshshah139,label:product] visual-token-migration-boundary
 * Only class tokens and JSX presentation nodes may change. Printed HTML strings,
 * clinical values, event handlers and scheduling geometry MUST remain unchanged.
 */
function migrateClasses(value, menu = false) {
  if (value.includes('<') || value.includes(';') || value.includes('font-size:')) return value;
  const solid = value.match(/(?:^|[\s"'`])(?:[\w-]+:)*bg-(green|emerald|lime|blue|sky|cyan|teal|amber|yellow|orange|red|rose|purple|violet|indigo|fuchsia|pink)-(?:500|600|700|800|900)(?:\s|$)/);
  const foreground = solid ? `${families[solid[1]]}-foreground` : 'primary-foreground';
  return value.replace(/(?<![\w-])((?:(?:[\w-]+|\[[^\]]+\]):)*)(text|bg|border(?:-[trblxy])?|ring|divide|from|via|to|fill|stroke)-(gray|slate|zinc|neutral|stone|green|emerald|lime|blue|sky|cyan|teal|amber|yellow|orange|red|rose|purple|violet|indigo|fuchsia|pink)-(50|100|200|300|400|500|600|700|800|900|950)(\/[\d.]+)?(?![\w-])/g, (_, prefix, property, color, shade, opacity = '') => {
    const level = Number(shade);
    const neutral = !families[color];
    const semantic = families[color];
    let token;
    if (neutral) {
      if (property === 'text' || property === 'fill' || property === 'stroke') token = level >= 700 ? 'foreground' : 'muted-foreground';
      else if (/^(border|divide)/.test(property)) token = 'border';
      else if (property === 'ring') token = 'ring';
      else token = level <= 50 ? 'background' : level <= 200 ? 'muted' : level <= 400 ? 'border' : 'primary';
    } else {
      if (property === 'text' || property === 'fill' || property === 'stroke') token = `${semantic}-text`;
      else if (/^(border|divide|ring)/.test(property)) token = `${semantic}-border`;
      else token = level <= 200 ? `${semantic}-soft` : semantic;
    }
    return `${prefix}${property}-${token}${opacity}`;
  }).replace(/(?<![\w-])bg-white(?![\w-])/g, 'bg-card')
    .replace(/(?<![\w-])text-white(?![\w-])/g, `text-${foreground}`)
    .replace(/(?<![\w-])text-black(?![\w-])/g, 'text-foreground')
    .replace(/(?<![\w-])border-white(?![\w-])/g, 'border-current')
    .replace(/text-\[(?:10|11)px\]/g, 'text-xs')
    .replace(/rounded-\[(?:7|8)px\]/g, 'rounded-md')
    .replace(/rounded-\[(?:10|12|14|16|20|24|28|29|30)px\]/g, 'rounded-lg')
    .replace(/(?<![\w-])rounded(?![\w-])/g, 'rounded-md')
    .replace(/shadow-\[[^\]]+\]/g, menu ? 'shadow-md' : 'shadow-sm')
    .replace(/(?<![\w-])shadow(?:-2xl|-xl|-lg|-md)?(?![\w-])/g, menu ? 'shadow-md' : 'shadow-sm')
    .replaceAll('bg-[var(--sidebar, var(--card))]', 'bg-sidebar');
}

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}

function replace(source, edits) {
  return edits.sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.value + text.slice(edit.end), source);
}

function importComponent(source, symbol, module) {
  if (new RegExp(`import[^;]*\\b${symbol}\\b[^;]*from`).test(source)) return source;
  const firstImport = source.search(/^import\s/m);
  const declaration = `import { ${symbol} } from '${module}';\n`;
  return firstImport >= 0 ? source.slice(0, firstImport) + declaration + source.slice(firstImport) : declaration + source;
}

const changes = [];
for (const file of files(root).filter(file => /\.[jt]sx?$/.test(file) && !excluded.test(file) && (!target || path.relative(root, file).startsWith(target)))) {
  const original = fs.readFileSync(file, 'utf8');
  let source = original;
  let tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const raw = source.slice(node.getStart(tree), node.end);
      const value = /(?:Doctor|Receptionist)Tour\.tsx$/.test(file) && raw.includes('<')
        ? raw.replace(/class=(["'])(.*?)\1/g, (_, quote, classes) => `class=${quote}${migrateClasses(classes)}${quote}`)
        : migrateClasses(raw, /components\/ui\/(?:dialog|dropdown-menu|select|tooltip|popover)\.tsx$/.test(file));
      if (value !== raw) edits.push({ start: node.getStart(tree), end: node.end, value });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  source = replace(source, edits);
  tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const presentationEdits = [];
  const imports = new Set();
  function jsx(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const name = opening.tagName.getText(tree);
      const classAttribute = opening.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(tree) === 'className');
      const classText = classAttribute?.initializer?.getText(tree) || '';
      const empty = !ts.isJsxElement(node) || node.children.every(child => ts.isJsxText(child) && !child.text.trim());
      if ((name === 'Loader2' || name === 'LoaderCircle' || (name === 'div' && empty)) && classText.includes('animate-spin') && !file.endsWith('/spinner.tsx')) {
        const attributes = opening.attributes.getText(tree).replace(/\banimate-spin\b/g, '').replace(/\bborder(?:-[a-zA-Z0-9/-]+)?\b/g, '').replace(/\brounded-full\b/g, '');
        presentationEdits.push({ start: node.getStart(tree), end: node.end, value: `<Spinner ${attributes.trim()} />` });
        imports.add('Spinner');
        return;
      }
      if (name === 'h1' && ts.isJsxElement(node) && !file.endsWith('/page-header.tsx') && !file.endsWith('/login/page.tsx')) {
        const content = source.slice(node.openingElement.end, node.closingElement.getStart(tree)).trim();
        const attributes = opening.attributes.properties.filter(attr => !(ts.isJsxAttribute(attr) && attr.name.getText(tree) === 'className')).map(attr => attr.getText(tree)).join(' ');
        presentationEdits.push({ start: node.getStart(tree), end: node.end, value: `<PageHeader title={<>${content}</>} ${attributes}/>` });
        imports.add('PageHeader');
        return;
      }
      if ((name === 'td' || name === 'TableCell' || name === 'th' || name === 'TableHead') && ts.isJsxElement(node)) {
        const content = source.slice(node.openingElement.end, node.closingElement.getStart(tree));
        const numeric = /\b(?:formatCurrency|toFixed|toLocaleString|totalAmount|amount|quantity|unitPrice|stockQty|balance|subtotal|taxAmount|netAmount|rate|mrp|totalCost)\b/.test(content) && !/<(?:Input|Button|Select|div|span|p|Link)\b/.test(content);
        if (numeric && classAttribute && ts.isStringLiteral(classAttribute.initializer) && !classText.includes('tabular-nums')) {
          presentationEdits.push({ start: classAttribute.initializer.getStart(tree) + 1, end: classAttribute.initializer.end - 1, value: classAttribute.initializer.text.replace(/text-(left|center)/g, 'text-right') + ' text-right tabular-nums' });
        } else if (numeric && !classAttribute) {
          presentationEdits.push({ start: opening.tagName.end, end: opening.tagName.end, value: ' className="text-right tabular-nums"' });
        }
      }
    }
    ts.forEachChild(node, jsx);
  }
  jsx(tree);
  source = replace(source, presentationEdits);
  for (const name of imports) source = importComponent(source, name, name === 'Spinner' ? '@/components/ui/spinner' : '@/components/ui/page-header');
  source = source.replace(/import \{([^}]+)\} from (['"][^'"]+['"]);?/g, (statement, names, module) => {
    const outside = source.replace(statement, '');
    const kept = names.split(',').filter(name => {
      const symbol = name.trim();
      return !['Loader2', 'LoaderCircle', 'Spinner'].includes(symbol) || new RegExp(`\\b${symbol}\\b`).test(outside);
    });
    if (kept.length === names.split(',').length) return statement;
    return kept.length ? `import {${kept.join(',')}} from ${module};` : '';
  });
  if (source !== original) {
    changes.push({ file: path.relative(root, file), classLiterals: edits.length, presentationNodes: presentationEdits.length });
    if (write) fs.writeFileSync(file, source);
  }
}
process.stdout.write(JSON.stringify({ mode: write ? 'write' : 'check', files: changes.length, changes }) + '\n');
