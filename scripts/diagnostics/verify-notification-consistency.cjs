const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../../frontend/src');

/**
 * @cc [owner:nareshshah139,label:verification] native-popup-inventory
 * Report direct alert, confirm and prompt calls in application JS/TS, including window,
 * globalThis and self members. Exclude test/spec files and occurrences in comments or strings.
 */
function nativePopups(directory = root) {
  const calls = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      calls.push(...nativePopups(file));
      continue;
    }
    if (!/\.[jt]sx?$/.test(file) || /\.(test|spec)\./.test(file)) continue;
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText(source);
        if (/^(?:(?:window|globalThis|self)\.)?(alert|confirm|prompt)$/.test(name)) {
          let parent = node.parent;
          while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
          calls.push({
            file: path.relative(root, file),
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
            kind: name.split('.').pop(),
            message: node.arguments.map(arg => arg.getText(source)).join(', '),
            async: !!parent?.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword),
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return calls;
}

if (require.main === module) {
  const calls = nativePopups();
  if (process.argv.includes('--inventory')) {
    process.stdout.write(JSON.stringify(calls));
  } else {
    for (const call of calls) console.error(`${call.file}:${call.line} uses native ${call.kind}`);
    console.log(`Native browser popups in application source: ${calls.length}`);
    process.exitCode = calls.length ? 1 : 0;
  }
}

module.exports = { nativePopups };
