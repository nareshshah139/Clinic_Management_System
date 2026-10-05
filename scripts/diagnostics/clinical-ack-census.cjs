const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const files = ['frontend/src/components/visits/MedicalVisitForm.tsx', 'frontend/src/components/visits/PrescriptionBuilder.tsx', 'frontend/src/components/visits/VisitPhotos.tsx'];
const patterns = { versionReceipt: /acknowledgeVisitVersion|visitVersionRef\.current\s*=|onVisitSaved|onVisitVersion/, conflict: /status\s*===?\s*409|onClinicalConflict|automaticSaveBlocked|blockAutomaticSave/, mutation: /api\.(visits|prescriptions)\.(update|create|complete)|savePrescription|export.*PDF/ };
const census = files.map(file => {
  if (!fs.existsSync(path.join(root, file))) return { file, unavailable: true };
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
  return { file, boundaries: Object.fromEntries(Object.entries(patterns).map(([kind, expression]) => [kind, lines.flatMap((text, index) => expression.test(text) ? [{ line: index + 1, text: text.trim() }] : [])])) };
});
console.log(JSON.stringify({ premise: 'Every clinical mutation conflict reaches the parent form conflict gate before later version acknowledgements.', census }, null, 2));
