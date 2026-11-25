import { IsIn, IsOptional } from 'class-validator';

export const PATIENT_SORT_FIELDS = ['name', 'age', 'lastVisit', 'createdAt'] as const;
export type PatientSortField = (typeof PATIENT_SORT_FIELDS)[number];
export type PatientSortOrder = 'asc' | 'desc';

export class ListPatientsSortDto {
  @IsOptional()
  @IsIn(PATIENT_SORT_FIELDS)
  sortBy?: PatientSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: PatientSortOrder;
}
