const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const revision = process.argv[2];
const root = path.resolve(__dirname, '../..');
const files = ['frontend/src/components/visits/MedicalVisitForm.tsx', 'frontend/src/components/visits/PrescriptionBuilder.tsx', 'frontend/src/components/visits/VisitPhotos.tsx'];
const patterns = { versionReceipt: /acknowledgeMutationVersion|acknowledgeVisitVersion|visitVersionRef\.current\s*=|onVisitSaved|onVisitVersion/, conflict: /status\s*===?\s*409|onClinicalConflict|automaticSaveBlocked|blockAutomaticSave/, mutation: /apiClient\.(updateVisit|createVisit|completeVisit|createPrescription|updatePrescription)|api\.(visits|prescriptions)\.(update|create|complete)|savePrescription|export.*PDF/ };
const census = files.map(file => {
  if (!fs.existsSync(path.join(root, file))) return { file, unavailable: true };
  const source = revision ? execFileSync('git', ['show', revision + ':' + file], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, file), 'utf8');
  const lines = source.split('\n');
  return { file, boundaries: Object.fromEntries(Object.entries(patterns).map(([kind, expression]) => [kind, lines.flatMap((text, index) => expression.test(text) ? [{ line: index + 1, text: text.trim() }] : [])])) };
});
console.log(JSON.stringify({ revision: revision || 'working tree', premise: 'Every clinical mutation conflict reaches the parent form conflict gate before later version acknowledgements.', census }, null, 2));
