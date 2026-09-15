#!/usr/bin/env node
// Syntax/traceability validation only. Semantic acceptance is documented separately.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const input = path.join(root, 'docs/product/inventory-workflow.acceptance.json');
const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const cc = process.argv[2] || 'cc-check';
const refresh = process.argv.includes('--refresh-locations');
const baselineEntries = [...data.features, ...data.supportingContracts];
const entries = [...baselineEntries, ...(data.implementationContracts || [])];
assert.equal(data.owner, 'nareshshah139', 'Acceptance contract owner must remain unchanged');
const ids = new Set();
assert.equal(data.features.length, 42, 'The 42 feature requirements must remain represented');
assert.equal(data.features.flatMap(feature => feature.criteria).length, 211, 'The 211 criteria must remain represented');
for (const feature of data.features) {
  assert(!ids.has(feature.id), `Duplicate feature ${feature.id}`); ids.add(feature.id);
  assert(feature.criteria.length && feature.pdfPages.length, `Missing coverage ${feature.id}`);
  for (const criterion of feature.criteria) {
    assert(!ids.has(criterion.id), `Duplicate criterion ${criterion.id}`); ids.add(criterion.id);
    assert(criterion.text && criterion.assessment && criterion.evidence, `Missing assessment ${criterion.id}`);
  }
}
const criteriaHash = crypto.createHash('sha256').update(JSON.stringify(data.features.flatMap(feature => feature.criteria.map(({ id, text }) => ({ id, text }))))).digest('hex');
assert.equal(criteriaHash, data.criteriaSha256, 'Criterion text or order changed; do not weaken acceptance during location refresh');
// Pinned to the unchanged 42-feature PDF baseline; implementation/evidence/location fields are excluded.
const immutableSpecification = {
  features: data.features.map(({ id, title, area, pdfPages, contract, obligation, criteria }) => ({ id, title, area, pdfPages, contract, obligation, criteria: criteria.map(({ id, text }) => ({ id, text })) })),
  supportingContracts: data.supportingContracts.map(({ contract, obligation, criterion }) => ({ contract, obligation, criterion })),
};
const specificationHash = crypto.createHash('sha256').update(JSON.stringify(immutableSpecification)).digest('hex');
assert.equal(specificationHash, '3889116fec6dd12bc0ae950563bc3c3647df2c3a6e26341b6c4a8001861ff1eb', 'The baseline features, contract IDs, obligations or criteria changed');
const contractIds = new Set(entries.map(entry => entry.contract));
assert.equal(contractIds.size, entries.length, 'Duplicate mapped contract ID');
assert.equal(baselineEntries.length, 50, 'The 50 existing contract IDs must remain represented');
const appearances = new Map([...contractIds].map(id => [id, []]));
function scan(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    if (item.isDirectory()) scan(absolute);
    else if (/\.(ts|tsx)$/.test(item.name)) {
      const source = fs.readFileSync(absolute, 'utf8');
      for (const match of source.matchAll(/@cc\s+\[([^\]]*)\]\s+([\w-]+)/g)) if (appearances.has(match[2])) appearances.get(match[2]).push({ file: path.relative(root, absolute), owner: match[1].match(/owner:([^,;\]]+)/)?.[1] });
    }
  }
}
scan(path.join(root, 'frontend/src')); scan(path.join(root, 'backend/src'));
for (const entry of entries) {
  const found = appearances.get(entry.contract);
  assert.equal(found.length, 1, `Contract ${entry.contract} must exist exactly once, including superseded files`);
  assert.equal(found[0].file, entry.file, `Wrong active file for ${entry.contract}`);
  assert.equal(found[0].owner, data.owner, `Owner changed for ${entry.contract}`);
}
function declarationName(anchor) {
  return anchor.match(/\b(?:function|class)\s+(\w+)/)?.[1] || anchor.match(/\b(?:const|let)\s+(\w+)/)?.[1] || anchor.match(/\b(\w+)\s*\(/)?.[1];
}
let failed = false;
const files = [];
for (const file of [...new Set(entries.map(entry => entry.file))]) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const declarations = [];
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isVariableDeclaration(node) || ts.isClassDeclaration(node)) && node.name && ts.isIdentifier(node.name)) declarations.push({ kind: ts.isFunctionDeclaration(node) ? 'function' : ts.isMethodDeclaration(node) ? 'method' : ts.isVariableDeclaration(node) ? 'variable' : 'class', name: node.name.text, line: parsed.getLineAndCharacterOfPosition(node.name.getStart(parsed)).line + 1 });
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const format = spawnSync(cc, ['format', file], { cwd: root, encoding: 'utf8' });
  const list = spawnSync(cc, ['list', file], { cwd: root, encoding: 'utf8' });
  const discovered = new Map([...String(list.stdout || '').matchAll(/◆\s+([\w-]+):\d+\s+scope:declaration\s+\w+\s+`([^`]+)`/g)].map(match => [match[1], match[2]]));
  const required = entries.filter(entry => entry.file === file);
  const missing = required.filter(entry => !discovered.has(entry.contract)).map(entry => entry.contract);
  for (const entry of required) {
    const lines = source.split('\n'), name = declarationName(entry.anchor);
    const kind = /\bfunction\b/.test(entry.anchor) ? 'function' : /\bclass\b/.test(entry.anchor) ? 'class' : /\b(const|let)\b/.test(entry.anchor) ? 'variable' : 'method';
    const declaration = declarations.filter(candidate => candidate.name === name && candidate.kind === kind);
    assert.equal(declaration.length, 1, `Ambiguous or missing declaration ${entry.anchor} for ${entry.contract}`);
    const block = [...source.matchAll(/\/\*\*[\s\S]*?\*\//g)].find(match => match[0].includes(`] ${entry.contract}\n`))?.[0];
    assert(block, `Missing contract prose ${entry.contract}`);
    const body = block.slice(block.indexOf(`] ${entry.contract}`) + entry.contract.length + 2).split('Acceptance:')[0].replace(/\*\/\s*$/, '').replace(/^\s*\*\s?/gm, '').replace(/\s/g, '');
    assert.equal(body, entry.obligation.replace(/\s/g, ''), `Contract obligation changed in source: ${entry.contract}`);
    const contractLine = lines.findIndex(line => line.includes(`] ${entry.contract}`)) + 1;
    assert(contractLine, `Missing contract comment ${entry.contract}`);
    assert.equal(discovered.get(entry.contract), name, `Contract attached to the wrong declaration: ${entry.contract}`);
    if (refresh) { entry.contractLine = contractLine; entry.declarationLine = declaration[0].line; }
    else {
      assert.equal(entry.contractLine, contractLine, `Stale contract line: ${entry.contract}; refresh locations after intentional source changes`);
      assert.equal(entry.declarationLine, declaration[0].line, `Stale declaration line: ${entry.contract}; refresh locations after intentional source changes`);
    }
  }
  const pass = format.status === 0 && list.status === 0 && !missing.length;
  failed ||= !pass;
  files.push({ file, contracts: required.length, status: pass ? 'PASS' : 'FAIL', missing, ...(pass ? {} : { error: String(format.error || list.error || format.stderr || list.stderr) }) });
}
if (refresh && !failed) fs.writeFileSync(input, JSON.stringify(data, null, 2) + '\n');
const result = {
  features: data.features.length,
  criteria: data.features.flatMap(feature => feature.criteria).length,
  criteriaSha256: criteriaHash,
  contracts: entries.length,
  baselineContracts: baselineEntries.length,
  implementationContracts: (data.implementationContracts || []).length,
  ownersPreserved: true,
  immutableSpecificationSha256: specificationHash,
  sourceObligationsPreserved: true,
  uniqueAcrossActiveAndSupersededFiles: true,
  declarationBindingsVerified: true,
  refreshedLocations: refresh,
  files,
  status: failed ? 'FAIL' : 'PASS',
  limit: 'Checks syntax, discovery, exact declaration binding and immutable criterion text. Does not verify feature behavior or close acceptance criteria.',
};
if (process.argv[3] && !process.argv[3].startsWith('--')) fs.writeFileSync(path.resolve(process.argv[3]), JSON.stringify(result, null, 2) + '\n');
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exitCode = failed ? 1 : 0;
