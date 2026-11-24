import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { BulkUpdateAppointmentsDto, UpdateAppointmentDto } from './update-appointment.dto';

const CUID = 'cmwufiiwb000a7dogl7bio4ii';
const body = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({ type: 'body', metatype });
const run = (value: unknown, metatype: ArgumentMetadata['metatype']) => diagnosticValidationPipe().transform(value, body(metatype));

describe('appointment DTO id validation', () => {
  describe('BulkUpdateAppointmentsDto.appointmentIds', () => {
    it('accepts database ids', async () => {
      await expect(run({ appointmentIds: [CUID, 'cmwufiixk000d7dog9kv9ow4r'], status: 'CONFIRMED' }, BulkUpdateAppointmentsDto))
        .resolves.toMatchObject({ appointmentIds: [CUID, 'cmwufiixk000d7dog9kv9ow4r'] });
    });

    it.each([[['']], [[123]], [[null]], ['not-an-array'], [undefined]])('refuses %p', async (appointmentIds) => {
      await expect(run({ appointmentIds, status: 'CONFIRMED' }, BulkUpdateAppointmentsDto)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('UpdateAppointmentDto.roomId', () => {
    it('accepts a database id', async () => {
      await expect(run({ roomId: CUID }, UpdateAppointmentDto)).resolves.toMatchObject({ roomId: CUID });
    });

    it('allows roomId to be omitted', async () => {
      await expect(run({ notes: 'n' }, UpdateAppointmentDto)).resolves.toMatchObject({ notes: 'n' });
    });

    it.each([[''], [42], [{}], [['x']]])('refuses %p', async (roomId) => {
      await expect(run({ roomId }, UpdateAppointmentDto)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
