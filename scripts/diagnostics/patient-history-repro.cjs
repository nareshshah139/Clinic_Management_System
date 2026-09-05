// Regression checks for the diagnosed history defects. Uses synthetic fixtures only.
// Run from the repository root. This script never connects to a database.
const { execFileSync } = require('child_process');
execFileSync('npm', ['test', '--workspace=backend', '--', '--runInBand', '--runTestsByPath',
  'src/modules/visits/tests/patient-history.contract.spec.ts',
  'src/modules/prescriptions/tests/prescription-clinical-transaction.spec.ts'], { stdio: 'inherit' });
execFileSync('npm', ['test', '--workspace=frontend', '--', '--runInBand', '--runTestsByPath',
  '__tests__/visits/PatientHistoryVisitCard.test.tsx', '__tests__/visits/patient-history-api.test.ts',
  '__tests__/visits/usePatientHistory.test.tsx', '__tests__/visits/VisitsPage.test.tsx',
  '__tests__/visits/VisitsPage.history-navigation.test.tsx', '__tests__/visits/history-visibility.test.ts',
  '__tests__/visits/MedicalVisitForm.saving.test.tsx'], { stdio: 'inherit' });
