import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const ts = require('typescript');
const root = path.resolve(new URL('../../frontend/src', import.meta.url).pathname);
const write = process.argv.includes('--write');
const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const targets = [...files(path.join(root, 'app/dashboard')).filter(file => file.endsWith('/page.tsx')), path.join(root, 'components/inventory/InventoryWorkspace.tsx')];
const changes = [];

for (const file of targets) {
  const source = fs.readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const elements = node => ts.isJsxElement(node) ? node.children.filter(child => (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || (ts.isJsxExpression(child) && child.expression))) : [];
  const tag = node => !node ? '' : ts.isJsxElement(node) ? node.openingElement.tagName.getText(tree) : ts.isJsxSelfClosingElement(node) ? node.tagName.getText(tree) : '';
  function visit(node) {
    if (ts.isJsxElement(node) && ['div', 'header'].includes(tag(node))) {
      const children = elements(node);
      const first = children[0];
      const nested = first && tag(first) === 'div' ? elements(first) : [];
      const heading = nested[0];
      const description = nested[1];
      const outerClass = node.openingElement.attributes.getText(tree);
      if (heading && tag(heading) === 'PageHeader' && ts.isJsxSelfClosingElement(heading) && nested.length <= 2 && (!description || tag(description) === 'p') && children.length > 1 && /\bflex\b/.test(outerClass)) {
        const props = heading.attributes.getText(tree);
        const descriptionProp = description && !/\bdescription=/.test(props) ? ` description={<>${source.slice(description.openingElement.end, description.closingElement.getStart(tree)).trim()}</>}` : '';
        const actions = children.slice(1).map(child => child.getText(tree)).join('\n');
        edits.push({ start: node.getStart(tree), end: node.end, value: `<PageHeader ${props}${descriptionProp} actions={<>${actions}</>} />` });
        return;
      }
      if (tag(first) === 'PageHeader' && ts.isJsxSelfClosingElement(first) && children.length === 2 && tag(children[1]) === 'p') {
        const paragraph = children[1];
        edits.push({ start: node.getStart(tree), end: node.end, value: `<PageHeader ${first.attributes.getText(tree)} description={<>${source.slice(paragraph.openingElement.end, paragraph.closingElement.getStart(tree)).trim()}</>} />` });
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!edits.length) continue;
  const updated = edits.sort((a, b) => b.start - a.start).reduce((text, edit) => text.slice(0, edit.start) + edit.value + text.slice(edit.end), source);
  changes.push({ file: path.relative(root, file), headers: edits.length });
  if (write) fs.writeFileSync(file, updated);
}
process.stdout.write(JSON.stringify({ mode: write ? 'write' : 'check', changes }) + '\n');
