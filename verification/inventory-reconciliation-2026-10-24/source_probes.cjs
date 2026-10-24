/**
 * @cc [owner:nareshshah139,label:verification] service-recovery-evidence
 * This runner MUST execute the real service regression suite and report failures faithfully.
 * Its database is an in-memory transactional fixture; results MUST NOT claim PostgreSQL isolation.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-proof-'));
const output = path.join(dir, 'jest.json');
const run = spawnSync(process.execPath, [path.join(root, 'node_modules/jest/bin/jest.js'), '--runInBand',
  'src/modules/inventory/tests/inventory-reconciliation.spec.ts', '--json', '--outputFile', output],
  { cwd: path.join(root, 'backend'), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
if (!fs.existsSync(output)) { process.stderr.write(run.stderr || String(run.error)); process.exit(1); }
const data = JSON.parse(fs.readFileSync(output));
const result = { scope: 'Real service methods with transactional in-memory test doubles. Not a live database proof.',
  passed: data.numPassedTests, failed: data.numFailedTests,
  tests: data.testResults.flatMap(suite => suite.assertionResults.map(test => ({ name: test.fullName, status: test.status, failures: test.failureMessages }))) };
fs.writeFileSync(path.join(__dirname, 'source-results.json'), JSON.stringify(result, null, 2) + '\n');
fs.rmSync(dir, { recursive: true });
console.log(`${result.passed} service regression tests passed; ${result.failed} failed.`);
process.exit(run.status === 0 && result.failed === 0 ? 0 : 1);
