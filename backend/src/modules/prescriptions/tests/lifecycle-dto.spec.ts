import { ValidationPipe } from '@nestjs/common';
import { ApproveRefillDto, RefillPrescriptionDto } from '../dto/prescription.dto';
import { QueryPrescriptionsDto, QueryRefillsDto } from '../dto/query-prescription.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const id = 'c' + '0'.repeat(24);
it('accepts generated CUIDs for refill commands and prescription query filters', async () => {
  expect(await pipe.transform({ prescriptionId: id }, { type: 'body', metatype: RefillPrescriptionDto })).toMatchObject({ prescriptionId: id });
  expect(await pipe.transform({ notes: 'Approved' }, { type: 'body', metatype: ApproveRefillDto })).toMatchObject({ notes: 'Approved' });
  expect(await pipe.transform({ prescriptionId: id }, { type: 'query', metatype: QueryRefillsDto })).toMatchObject({ prescriptionId: id });
  expect(await pipe.transform({ visitId: id, doctorId: id }, { type: 'query', metatype: QueryPrescriptionsDto })).toMatchObject({ visitId: id, doctorId: id });
});
it('preserves false filters and rejects non-boolean lifecycle filters', async () => {
  expect(await pipe.transform({ isExpired: 'false', hasRefills: 'false' }, { type: 'query', metatype: QueryPrescriptionsDto })).toMatchObject({ isExpired: false, hasRefills: false });
  await expect(pipe.transform({ isExpired: 'unknown' }, { type: 'query', metatype: QueryPrescriptionsDto })).rejects.toThrow();
});
