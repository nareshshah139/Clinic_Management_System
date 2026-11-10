import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PharmacyReportQueryDto } from '../dto/pharmacy-reports.dto';
import { PharmacyReportsService } from '../pharmacy-reports.service';

const emptyMargin = {
  rows: [],
  totals: { salesAmount: 0, purchase: 0, netGst: 0, profit: 0, profitPercent: null, itemCount: 0, unknownCost: { lineCount: 0, itemCount: 0, salesAmount: 0 } },
};

it('exports the item margin with the same filters the screen applies', async () => {
  const getItemMargin = jest.fn().mockResolvedValue(emptyMargin);
  const reports = new PharmacyReportsService({} as any, { getItemMargin } as any);
  const query = plainToInstance(PharmacyReportQueryDto, {
    from: '2026-11-01', to: '2026-11-30', q: 'gel', marginType: 'RETURNS', field: 'NAME',
    tag: 'Retinoid', category: 'Acne', manufacturer: 'Galderma', itemType: 'MEDICINE', cost: 'LOSS',
  });

  await reports.report('item-margin', query, { branchId: 'branch' });

  expect(getItemMargin).toHaveBeenCalledWith(
    {
      startDate: '2026-11-01', endDate: '2026-11-30', search: 'gel', type: 'RETURNS', searchField: 'NAME',
      tag: 'Retinoid', category: 'Acne', manufacturer: 'Galderma', itemType: 'MEDICINE', costStatus: 'LOSS',
    },
    'branch',
  );
});

it('rejects an unknown margin filter value instead of widening the export', async () => {
  const errors = await validate(plainToInstance(PharmacyReportQueryDto, { from: '2026-11-01', marginType: 'EVERYTHING', cost: 'CHEAP' }));
  expect(errors.map((e) => e.property).sort()).toEqual(['cost', 'marginType']);
});
