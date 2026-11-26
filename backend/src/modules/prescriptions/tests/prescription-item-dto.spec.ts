import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  CreatePrescriptionDto,
  CreatePrescriptionPadDto,
  UpdatePrescriptionDto,
} from '../dto/prescription.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const identity = { patientId: 'patient', doctorId: 'doctor' };
const medicine = { drugName: 'Moisturiser', dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', durationUnit: 'DAYS' };

const validate = (metatype: new () => object, body: object) =>
  pipe.transform(body, { type: 'body', metatype });

const rejection = async (metatype: new () => object, body: object): Promise<string[]> => {
  try {
    await validate(metatype, body);
  } catch (error) {
    if (error instanceof BadRequestException) return (error.getResponse() as { message: string[] }).message;
    throw error;
  }
  return [];
};

describe('prescription medicine duration', () => {
  it.each([
    ['create', CreatePrescriptionDto, { ...identity, visitId: 'visit' }],
    ['pad', CreatePrescriptionPadDto, identity],
  ])('accepts a medicine with no duration on %s', async (_name, metatype, body) => {
    expect(await rejection(metatype, { ...body, items: [medicine] })).toEqual([]);
  });

  it('accepts a medicine with no duration when editing a prescription', async () => {
    expect(await rejection(UpdatePrescriptionDto, { items: [medicine] })).toEqual([]);
  });

  it('keeps a supplied duration of at least one', async () => {
    const body = { ...identity, visitId: 'visit' };
    expect(await rejection(CreatePrescriptionDto, { ...body, items: [{ ...medicine, duration: 7 }] })).toEqual([]);
    for (const duration of [0, -3]) {
      expect(await rejection(CreatePrescriptionDto, { ...body, items: [{ ...medicine, duration }] }))
        .toEqual(['items.0.duration must not be less than 1']);
    }
  });
});
