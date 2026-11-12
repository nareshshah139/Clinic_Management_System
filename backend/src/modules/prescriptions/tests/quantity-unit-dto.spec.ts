import { ValidationPipe } from '@nestjs/common';
import { PrescriptionTemplateDto, UpdatePrescriptionDto } from '../dto/prescription.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const item = { drugName: 'Tab. Flutas 150 mg', dosage: 1, dosageUnit: 'TABLET', frequency: 'ONCE_DAILY', duration: 10, durationUnit: 'DAYS' };

it('keeps a quantity the doctor counted in strips with its unit', async () => {
  const saved = await pipe.transform({ items: [{ ...item, quantity: 2, quantityUnit: 'STRIPS' }] }, { type: 'body', metatype: UpdatePrescriptionDto });
  expect(saved.items[0]).toMatchObject({ quantity: 2, quantityUnit: 'STRIPS' });
  const template = await pipe.transform({ name: 'Tinea', items: [{ ...item, quantity: 1, quantityUnit: 'TUBES' }] }, { type: 'body', metatype: PrescriptionTemplateDto });
  expect(template.items[0]).toMatchObject({ quantity: 1, quantityUnit: 'TUBES' });
});

it('leaves a tablet count without a unit and rejects a unit that is not a selling unit', async () => {
  const saved = await pipe.transform({ items: [{ ...item, quantity: 10 }] }, { type: 'body', metatype: UpdatePrescriptionDto });
  expect(saved.items[0].quantityUnit).toBeUndefined();
  await expect(pipe.transform({ items: [{ ...item, quantity: 10, quantityUnit: 'TABLET' }] }, { type: 'body', metatype: UpdatePrescriptionDto })).rejects.toThrow();
});
