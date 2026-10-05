const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'output/inventory-visits-repair');
const fingerprint = () => {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'backend', 'frontend', 'shared-types', 'package.json', 'package-lock.json'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const file of [...new Set(files)]) {
    hash.update(file + '\0');
    hash.update(fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file)) : 'DELETED');
  }
  return hash.digest('hex');
};
const treeHash = directories => {
  const hash = createHash('sha256');
  const add = file => {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) return;
    if (fs.statSync(absolute).isDirectory()) {
      for (const child of fs.readdirSync(absolute).sort()) add(path.join(file, child));
    } else { hash.update(file + '\0'); hash.update(fs.readFileSync(absolute)); }
  };
  directories.forEach(add);
  return hash.digest('hex');
};
const artifactIdentity = () => ({
  backendRuntimeSha256: treeHash(['backend/dist', 'backend/node_modules/.prisma/client', 'node_modules/.prisma/client']),
  frontendBuildId: fs.readFileSync(path.join(root, 'frontend/.next/BUILD_ID'), 'utf8').trim(),
});
const run = workspace => new Promise((resolve, reject) => {
  const fd = fs.openSync(path.join(output, `build-${workspace}.log`), 'w', 0o600);
  const child = spawn('npm', ['run', 'build', '--workspace=' + workspace], { cwd: root, env: { ...process.env, NEXT_PUBLIC_API_PROXY: 'http://127.0.0.1:4107' }, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(Error(`${workspace} build failed (${code})`)));
});
/**
 * @cc [owner:nareshshah139,label:verification] source-bound-local-build
 * A successful local build receipt requires successful frontend/backend builds with unchanged
 * source bytes across the build. It records source identity and both resulting build identities.
 */
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const sourceSha256 = fingerprint();
  await run('shared-types');
  const builds = await Promise.allSettled([run('backend'), run('frontend')]);
  for (const result of builds) if (result.status === 'rejected') throw result.reason;
  assert.equal(fingerprint(), sourceSha256, 'Source changed while building; build again');
  const report = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceSha256, ...artifactIdentity(), builtAt: new Date().toISOString(), outcome: 'VERIFIED' };
  fs.writeFileSync(path.join(output, 'local-build.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
module.exports = { fingerprint, artifactIdentity };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
