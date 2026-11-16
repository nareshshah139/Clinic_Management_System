import { BadRequestException } from '@nestjs/common';
import { medicineNameParts, medicineNameIssues, type MedicineNameFields } from '@cms/shared-types/medicine-name';

/**
 * @cc [owner:nareshshah139,label:product] medicine-structured-input
 * A new medicine MUST record a brand and known form, with strength unless topical or explicitly
 * a combination product. Validation MUST not infer composition or alter stock identity or packs.
 */
export function medicinePresentationData(input: MedicineNameFields & { name?: string }) {
  const fields = medicineNameParts(input.name, input);
  const issues = medicineNameIssues(fields);
  if (issues.length) throw new BadRequestException(issues.join('. '));
  return fields;
}
