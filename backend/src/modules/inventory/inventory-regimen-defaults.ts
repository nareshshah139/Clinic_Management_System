import { BadRequestException } from '@nestjs/common';

// Shared by the standard inventory API and the product-details workspace.
export function inventoryRegimenDefaults(input: Record<string, any>, existing: Record<string, any> = {}) {
  const data: Record<string, any> = {};
  if (input.defaultDuration !== undefined) {
    const value = input.defaultDuration;
    data.defaultDuration = value == null || value === '' ? null : Number(value);
    if (data.defaultDuration != null && (!Number.isSafeInteger(data.defaultDuration) || data.defaultDuration < 1 || data.defaultDuration > 2147483647)) {
      throw new BadRequestException('Default duration must be a positive whole number');
    }
  }
  for (const key of ['defaultDurationUnit', 'defaultFrequency', 'defaultTiming', 'defaultInstructions']) {
    if (input[key] === undefined) continue;
    if (input[key] != null && typeof input[key] !== 'string') throw new BadRequestException(`${key} must be text`);
    data[key] = input[key]?.trim() || null;
    if (data[key]?.length > (key === 'defaultInstructions' ? 2000 : 100)) throw new BadRequestException(`${key} is too long`);
  }
  if (data.defaultDurationUnit) {
    data.defaultDurationUnit = data.defaultDurationUnit.toUpperCase();
    if (!['DAYS', 'WEEKS', 'MONTHS', 'YEARS'].includes(data.defaultDurationUnit)) throw new BadRequestException('Invalid default duration unit');
  }
  const merged = { ...existing, ...data };
  if (merged.defaultDuration != null && !merged.defaultDurationUnit) throw new BadRequestException('Choose a unit for the default duration');
  return data;
}
