const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/inventory-visits-repair/railway-snapshot.json');
const auth = JSON.parse(fs.readFileSync('/Users/nshah/.railway/config.json')).user;
const projectId = '0806df25-906b-48f3-ab72-fa0650431661';
const volumeInstanceId = '5f12162e-c440-4f88-be25-fe922c5418e0';
const name = 'Pre-inventory-visits-repair-2026-10-05';
async function api(query, variables) {
  const response = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (auth.token || auth.accessToken) },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok || result.errors) throw Error(JSON.stringify(result.errors || { status: response.status }));
  return result.data;
}
const save = report => {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const temporary = out + '.tmp';
  const fd = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(report, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, out);
};
/**
 * @cc [owner:nareshshah139,label:safety] scoped-railway-backup
 * Creating a backup requires the expected clinic project and Postgres volume relationship.
 * A durable attempt journal prevents automatic retries after an uncertain response. Only a
 * present, unexpired backup produces VERIFIED and exit zero; no records are downloaded.
 */
async function main() {
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out)) : { projectId, volumeInstanceId, name };
  assert.equal(report.projectId, projectId);
  assert.equal(report.volumeInstanceId, volumeInstanceId);
  assert.equal(report.name, name);
  const result = await api(`query($projectId:String!,$volumeInstanceId:String!) {
    project(id:$projectId) { id volumes {edges {node {id volumeInstances {edges {node {id serviceId}}}}}} }
    backups:volumeInstanceBackupList(volumeInstanceId:$volumeInstanceId) {id name createdAt expiresAt}
  }`, { projectId, volumeInstanceId });
  assert(result.project.volumes.edges.some(v => v.node.volumeInstances.edges.some(i =>
    i.node.id === volumeInstanceId && i.node.serviceId === 'b1b40cbe-f1c8-4afd-8488-5ac52e1e8c2a')));
  report.checkedAt = new Date().toISOString();
  report.backup = result.backups.find(b => b.name === name && b.id && Number.isFinite(Date.parse(b.createdAt)) && (!b.expiresAt || Date.parse(b.expiresAt) > Date.now()));
  if (report.backup) {
    report.outcome = 'VERIFIED';
  } else if (!report.attempt && process.argv.includes('--create')) {
    report.attempt = { startedAt: new Date().toISOString(), state: 'UNCERTAIN' };
    report.outcome = 'NOT VERIFIED';
    save(report);
    report.request = await api(`mutation($name:String!,$volumeInstanceId:String!) {
      volumeInstanceBackupCreate(name:$name,volumeInstanceId:$volumeInstanceId) {workflowId}
    }`, { name, volumeInstanceId });
    report.attempt.state = 'REQUESTED';
    report.outcome = 'REQUESTED';
  } else {
    report.outcome = 'NOT VERIFIED';
  }
  save(report);
  if (report.outcome !== 'VERIFIED') process.exitCode = 2;
  console.log(JSON.stringify(report, null, 2));
}
async function exclusive() {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const lock = out + '.lock';
  const fd = fs.openSync(lock, 'wx', 0o600);
  try { fs.writeFileSync(fd, String(process.pid)); await main(); }
  finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
exclusive().catch(error => { console.error(error.message); process.exitCode = 1; });
