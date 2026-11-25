import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QueryPurchaseLearningMetricsDto } from '../dto/pharmacy-purchase-invoice.dto';

async function failingProperties(query: Record<string, unknown>) {
  const errors = await validate(plainToInstance(QueryPurchaseLearningMetricsDto, query));
  return errors.map((error) => error.property);
}

describe('QueryPurchaseLearningMetricsDto', () => {
  it.each([
    [{ to: '2026-02-31' }, 'to'],
    [{ from: '2026-02-30', to: '2026-03-10' }, 'from'],
    [{ to: '2026-13-01' }, 'to'],
  ])('rejects %j on %s', async (query, property) => {
    expect(await failingProperties(query)).toContain(property);
  });

  it.each([
    [{ to: '2026-02-28' }],
    [{ from: '2026-01-01', to: '2026-02-28' }],
    [{ to: '2026-11-30T12:00:00Z' }],
    [{}],
  ])('accepts %j', async (query) => {
    expect(await failingProperties(query)).toEqual([]);
  });
});
