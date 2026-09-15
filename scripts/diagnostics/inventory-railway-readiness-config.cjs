// Scoped infrastructure updates only: deployment health gates and a new DB snapshot.
// Never deploys code, restores a backup, or writes application records.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '../..');
const out = root + '/output/diagnostics/inventory-production-readiness';
const projectId = '0806df25-906b-48f3-ab72-fa0650431661';
const environmentId = '7caa633a-2f44-426f-a36f-7ac9b479bad8';
const volumeInstanceId = '5f12162e-c440-4f88-be25-fe922c5418e0';
const services = [
  { name: 'backend', id: 'c9b996ad-162c-4f5c-956e-786265e08a46', path: '/health' },
  { name: 'frontend', id: '8dea587e-1221-471a-9a5f-89fe0033dd99', path: '/login' },
];
const backupName = 'Pre-inventory-workflow-2026-09-15';
const auth = JSON.parse(fs.readFileSync('/Users/nshah/.railway/config.json')).user;
async function api(query, variables = {}) {
  const r = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (auth.token || auth.accessToken) },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000),
  });
  const d = await r.json();
  if (!r.ok || d.errors) throw Error(JSON.stringify(d.errors || { status: r.status }));
  return d.data;
}
const query = `query($projectId:String!,$volumeInstanceId:String!) {
  project(id:$projectId) { id name
    services {edges {node {id name serviceInstances {edges {node {
      environmentId healthcheckPath healthcheckTimeout latestDeployment {id status}
    }}}}}}
    volumes {edges {node {id volumeInstances {edges {node {id serviceId}}}}}}
  }
  backups:volumeInstanceBackupList(volumeInstanceId:$volumeInstanceId) {id name createdAt expiresAt}
}`;
async function main() {
  const before = await api(query, { projectId, volumeInstanceId });
  assert(before.project.volumes.edges.some(v => v.node.volumeInstances.edges.some(i =>
    i.node.id === volumeInstanceId && i.node.serviceId === 'b1b40cbe-f1c8-4afd-8488-5ac52e1e8c2a')));
  const report = { checkedAt: new Date().toISOString(), before, changes: [] };
  const save = () => fs.writeFileSync(out + '/railway-readiness-config.json', JSON.stringify(report, null, 2));
  save();
  for (const s of services) {
    const actual = before.project.services.edges.find(e => e.node.id === s.id)?.node;
    assert.equal(actual?.name, s.name);
    assert(actual.serviceInstances.edges.some(e => e.node.environmentId === environmentId));
    const result = await api(`mutation($environmentId:String!,$serviceId:String!,$input:ServiceInstanceUpdateInput!) {
      serviceInstanceUpdate(environmentId:$environmentId,serviceId:$serviceId,input:$input)
    }`, { environmentId, serviceId: s.id, input: { healthcheckPath: s.path, healthcheckTimeout: 300 } });
    assert.equal(result.serviceInstanceUpdate, true);
    report.changes.push({ service: s.name, healthcheckPath: s.path, healthcheckTimeout: 300 });
    save();
  }
  // The fixed name lets a retry recognize an already completed snapshot.
  const existing = before.backups.find(b => b.name === backupName);
  if (!existing) {
    report.backupRequest = await api(`mutation($name:String!,$volumeInstanceId:String!) {
      volumeInstanceBackupCreate(name:$name,volumeInstanceId:$volumeInstanceId) {workflowId}
    }`, { name: backupName, volumeInstanceId });
    save();
  }
  report.after = await api(query, { projectId, volumeInstanceId });
  for (const s of services) {
    const actual = report.after.project.services.edges.find(e => e.node.id === s.id).node.serviceInstances.edges
      .find(e => e.node.environmentId === environmentId).node;
    assert.equal(actual.healthcheckPath, s.path);
    assert.equal(actual.healthcheckTimeout, 300);
    const old = before.project.services.edges.find(e => e.node.id === s.id).node.serviceInstances.edges
      .find(e => e.node.environmentId === environmentId).node;
    assert.equal(actual.latestDeployment.id, old.latestDeployment.id, 'Unexpected code deployment');
  }
  save();
  console.log(JSON.stringify({ changes: report.changes, backupRequest: report.backupRequest, applicationDeploymentUnchanged: true }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
