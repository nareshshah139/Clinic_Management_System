import { Skeleton } from '@/components/ui/skeleton';
import { visitIdentity } from '@/lib/visit-identity';
import { visitTypeLabel } from '@/components/appointments/appointment-calendars';
import type { RecordState } from './useRecordById';

type IdentityPatient = Parameters<typeof visitIdentity>[0];
type IdentityDoctor = Parameters<typeof visitIdentity>[1];
type IdentityAppointment = Parameters<typeof visitIdentity>[2];

interface VisitIdentityBarProps {
  patient: RecordState<IdentityPatient>;
  /** Omitted when the viewer is the visit's doctor. */
  doctor?: RecordState<NonNullable<IdentityDoctor>>;
  appointment?: IdentityAppointment;
  className?: string;
}

const SEPARATOR = ' · ';

export function VisitIdentityBar({ patient, doctor, appointment, className = '' }: VisitIdentityBarProps) {
  const frame = `text-sm text-gray-700 ${className}`;

  if (patient.status === 'loading' || patient.status === 'idle') {
    return (
      <div className={frame} role="status" aria-label="Loading patient">
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
    );
  }

  if (patient.status === 'missing') {
    return (
      <p className={frame} data-testid="visit-identity">
        Patient: not available
      </p>
    );
  }

  const identity = visitIdentity(
    patient.record,
    doctor?.status === 'ready' ? doctor.record : null,
    appointment,
  );
  const patientPart = [identity.name, identity.age !== null ? String(identity.age) : null, identity.sex]
    .filter(Boolean)
    .join(SEPARATOR);
  const segments = [
    patientPart,
    identity.doctorName ? `Doctor: ${identity.doctorName}` : null,
    identity.slot,
    identity.visitType && visitTypeLabel(identity.visitType),
  ].filter(Boolean);

  return (
    <p className={frame} data-testid="visit-identity">
      <span className="font-medium text-gray-900">{segments[0]}</span>
      {segments.slice(1).map((segment) => (
        <span key={segment}>
          {SEPARATOR}
          {segment}
        </span>
      ))}
    </p>
  );
}
