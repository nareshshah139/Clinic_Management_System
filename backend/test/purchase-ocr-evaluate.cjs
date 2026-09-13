// Explicitly opt in to external OCR. Calls extractDocumentDraft only; never DB routes.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  assert.equal(process.env.RUN_CODEX_LIVE_TESTS, '1', 'Set RUN_CODEX_LIVE_TESTS=1 to invoke external Codex OCR');
  require('ts-node').register({ project: path.join(__dirname, '../tsconfig.json'), transpileOnly: true });
  const { RequestContextService } = require('../src/shared/context/request-context.service');
  const { PrismaService } = require('../src/shared/database/prisma.service');
  const { PharmacyPurchaseInvoiceService } = require('../src/modules/pharmacy/pharmacy-purchase-invoice.service');
  const { generateFixtures } = require('./purchase-ocr-fixtures.cjs');
  const directory = path.resolve(process.argv[2] || '/tmp/purchase-ocr-20');
  const manifest = process.env.PHARMACY_OCR_FIXTURE_MANIFEST
    ? JSON.parse(await fs.readFile(process.env.PHARMACY_OCR_FIXTURE_MANIFEST, 'utf8'))
    : await generateFixtures(directory);
  await fs.mkdir(directory, { recursive: true });
  const prisma = new PrismaService(new RequestContextService());
  const service = new PharmacyPurchaseInvoiceService(prisma);
  const results = [];
  const compare = (actual, expected, location, errors) => {
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual) || actual.length !== expected.length) errors.push(`${location}: expected ${expected.length} rows, got ${actual?.length}`);
      expected.forEach((value, index) => compare(actual?.[index], value, `${location}[${index}]`, errors));
    } else if (expected !== null && typeof expected === 'object') {
      Object.entries(expected).forEach(([key, value]) => compare(actual?.[key], value, `${location}.${key}`, errors));
    } else if (typeof expected === 'number') {
      // GST allocation can round by one paisa; identities, quantities and prices must match exactly.
      const tolerance = /\.(gstAmount|lineTotal)$/.test(location) ? 0.010001 : 0.000001;
      if (typeof actual !== 'number' || Math.abs(actual - expected) > tolerance) errors.push(`${location}: expected ${expected}, got ${actual}`);
    } else if (String(actual ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') !== String(expected ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')) {
      errors.push(`${location}: expected ${expected}, got ${actual}`);
    }
  };
  try {
    for (const fixture of manifest.filter(f => !process.env.OCR_CASE_FILTER || path.basename(f.path).includes(process.env.OCR_CASE_FILTER))) {
      const started = Date.now();
      const errors = [];
      let result;
      try {
        const buffer = await fs.readFile(fixture.path);
        result = await service.extractDocumentDraft({ buffer, size: buffer.length, originalname: path.basename(fixture.path),
          mimetype: fixture.mimetype || 'image/jpeg' }, 'live-test-no-database');
        compare(result.draft, fixture.expected, 'draft', errors);
        const headerFlags = result.draft.ocrFlags || [];
        if (fixture.complete === false && !headerFlags.includes('document_completeness_unconfirmed')) errors.push('Missing page was not blocked by independent verification');
        if (fixture.complete === true) {
          if (headerFlags.length) errors.push(`Unexpected header flags: ${headerFlags.join(', ')}`);
          result.draft.items.forEach((row, index) => {
            if (row.ocrFlags?.length) errors.push(`Row ${index + 1} flags: ${row.ocrFlags.join(', ')}`);
            if (row.ocrConfidence < 0.98) errors.push(`Row ${index + 1} confidence below automatic-intake threshold`);
          });
        }
      } catch (error) { errors.push(error.message); }
      const entry = { file: path.basename(fixture.path), seconds: Math.round((Date.now() - started) / 1000),
        passed: errors.length === 0, errors, result };
      results.push(entry);
      await fs.writeFile(path.join(directory, 'results.json'), JSON.stringify(results, null, 2), { mode: 0o600 });
      console.log(JSON.stringify({ file: entry.file, seconds: entry.seconds, passed: entry.passed,
        rowCount: result?.draft.items.length, errors }));
    }
  } finally { await prisma.$disconnect(); }
  assert(results.length > 0, 'No matching fixtures');
  assert(results.every(result => result.passed), 'OCR evaluation failed; see results.json for exact comparisons');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
