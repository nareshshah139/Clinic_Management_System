const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const beforeRoot = path.resolve(process.argv[2] || path.join(root, 'tmp/ux-improvements-baseline/src'));
const afterRoot = path.join(root, 'frontend/src');
const printer = ts.createPrinter({ removeComments: true });

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}

/**
 * @cc [owner:nareshshah139,label:verification] network-call-preservation
 * Source comparison MUST report any changed fetch or apiClient call relative to
 * the supplied baseline. A clean result proves only this bounded call comparison.
 */
function networkCalls(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(source);
      if (expression === 'fetch' || expression.startsWith('apiClient.')) calls.push(printer.printNode(ts.EmitHint.Unspecified, node, source));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return calls.sort();
}

const changed = [];
const callChanges = [];
for (const oldFile of files(beforeRoot).filter(file => /\.[jt]sx?$/.test(file))) {
  const relative = path.relative(beforeRoot, oldFile);
  const current = path.join(afterRoot, relative);
  if (!fs.existsSync(current)) {
    callChanges.push({ file: relative, issue: 'Source file removed' });
    continue;
  }
  if (fs.readFileSync(oldFile, 'utf8') === fs.readFileSync(current, 'utf8')) continue;
  changed.push(relative);
  const before = networkCalls(oldFile);
  const after = networkCalls(current);
  if (JSON.stringify(before) !== JSON.stringify(after)) callChanges.push({ file: relative, before, after });
}
const output = path.join(root, 'tmp/ux-improvements-verification');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'source-results.json'), JSON.stringify({ baseline: beforeRoot, changed, callChanges }, null, 2));
console.log(JSON.stringify({ changedFiles: changed.length, networkCallChanges: callChanges.length, changedNetworkFiles: callChanges.map(change => change.file) }));
if (callChanges.length) process.exitCode = 1;
