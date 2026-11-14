import { UserRole } from '@cms/shared-types';

interface DefaultDoctorInput {
  role: string | undefined;
  userId: string | undefined;
  current: string;
}

export function resolveDefaultDoctorId({ role, userId, current }: DefaultDoctorInput): string {
  if (current) return current;
  if (role === UserRole.DOCTOR && userId) return userId;
  return '';
}
