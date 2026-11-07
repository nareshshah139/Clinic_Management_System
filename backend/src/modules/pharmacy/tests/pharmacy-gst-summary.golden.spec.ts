import { PharmacyComplianceService } from '../pharmacy-compliance.service';
import { gstFixturePrisma } from './gst-summary.fixture';
import golden from './gst-summary.golden.json';

describe('GST summary output', () => {
  it('matches the output captured before the slab helpers moved to gst-slabs.ts', async () => {
    const service = new PharmacyComplianceService(gstFixturePrisma() as any);
    const { scope, period, ...result } = await service.getGstSummary(
      { startDate: '2026-11-01', endDate: '2026-11-30' },
      'branch-1',
    );
    expect(scope.draftsExcluded).toBe(true);
    expect(period.startDate).toBe(scope.startDate);
    expect(JSON.parse(JSON.stringify(result))).toEqual(golden);
  });
});
