import type { ReactNode } from 'react';
import { displayClinicDateTime } from '@/lib/date-display';
import { filledParameters, totalShots, type StoredProcedure } from './procedure-record';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children || '—'}</dd>
    </div>
  );
}

export function ProcedureDetails({ procedure, nurseName }: { procedure: StoredProcedure; nurseName: string }) {
  const { record } = procedure;
  const total = totalShots(record.shotCounts);
  const parameters = filledParameters(record.parameters);
  const skin = record.skinTypes;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Patient">{record.patient?.name}</Field>
        <Field label="Date">{displayClinicDateTime(record.visit.createdAt)}</Field>
        <Field label="Machine">{procedure.label}</Field>
        <Field label="Doctor">{procedure.doctorName}</Field>
        <Field label="Nurse/Therapist">{nurseName}</Field>
        <Field label="Session No.">{record.sessionNo}</Field>
        <Field label="Body parts">{record.bodyParts.join(', ')}</Field>
        <Field label="Shot count">
          {`${record.shotCounts.begin} → ${record.shotCounts.end} (total ${total ?? 'invalid'})`}
        </Field>
        <Field label="Fitzpatrick">{skin.fitzpatrick && `Type ${skin.fitzpatrick}`}</Field>
        <Field label="Robert">{skin.robert}</Field>
        <Field label="Scar">{skin.scar}</Field>
        <Field label="Herpes">{skin.herpes}</Field>
      </dl>

      <Field label="Indications">{record.indications}</Field>

      <div>
        <p className="text-xs text-muted-foreground">Parameters</p>
        {parameters.length === 0 ? (
          <p className="text-sm text-foreground">—</p>
        ) : (
          <table className="mt-1 w-full border-collapse text-sm">
            <tbody>
              {parameters.map(([name, passes]) => (
                <tr key={name} className="border-b border-border">
                  <th scope="row" className="w-32 py-1 pr-3 text-left font-medium">{name}</th>
                  <td className="py-1 text-left">
                    {passes.map(([pass, value]) => (passes.length === 1 && pass === 1 ? value : `Pass ${pass}: ${value}`)).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Field label="Notes">{record.notes}</Field>
    </div>
  );
}
