import { ArgumentMetadata } from '@nestjs/common';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { DoctorVisitsQueryDto } from '../dto/query-visit.dto';

const query: ArgumentMetadata = { type: 'query', metatype: DoctorVisitsQueryDto };

describe('GET /visits/doctor/:doctorId query', () => {
  it('converts limit from the query string to a number', async () => {
    await expect(diagnosticValidationPipe().transform({ limit: '8' }, query)).resolves.toMatchObject({ limit: 8 });
  });

  it('rejects a limit that is not a whole number from 1 to 100', async () => {
    await expect(diagnosticValidationPipe().transform({ limit: 'abc' }, query)).rejects.toThrow();
    await expect(diagnosticValidationPipe().transform({ limit: '500' }, query)).rejects.toThrow();
  });
});
