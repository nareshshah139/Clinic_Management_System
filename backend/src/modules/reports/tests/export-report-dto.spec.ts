import 'reflect-metadata';
import { ExportReportDto } from '../dto/reports.dto';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';

const validate = (body: unknown) =>
  diagnosticValidationPipe().transform(body, { type: 'body', metatype: ExportReportDto });

describe('ExportReportDto through the global validation pipe', () => {
  it('keeps the report type and format the frontend sends', async () => {
    const out = await validate({ reportType: 'PATIENT', exportFormat: 'CSV', parameters: { startDate: '2026-10-25', endDate: '2026-11-24' } });
    expect(out).toMatchObject({ reportType: 'PATIENT', exportFormat: 'CSV' });
  });

  it('rejects a report type the service cannot export', async () => {
    await expect(validate({ reportType: 'PATIENTS', exportFormat: 'CSV', parameters: {} })).rejects.toMatchObject({ status: 400 });
  });
});
