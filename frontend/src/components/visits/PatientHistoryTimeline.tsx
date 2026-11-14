'use client';

import { useState } from 'react';
import { VisitStatus } from '@cms/shared-types';
import { Activity, FileText, Stethoscope } from 'lucide-react';
import { displayClinicDateTime, displayUtcDate } from '@/lib/date-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api';
import PatientHistoryVisitCard from '@/components/visits/PatientHistoryVisitCard';
import { usePatientHistory } from '@/components/visits/usePatientHistory';


type PrescriptionSummaryProps = {
  prescription: unknown;
  onPrint?: () => void;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}


function personName(person: unknown): string | undefined {
  if (!isPlainObject(person)) return undefined;
  const full = [person.firstName, person.lastName]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' ');
  if (full) return full;
  return typeof person.name === 'string' && person.name.trim() ? person.name : undefined;
}

function normalizePrescription(prescription: unknown) {
  if (!isPlainObject(prescription)) {
    return null;
  }

  const itemsRaw = prescription.items;
  let items: Array<Record<string, unknown>> = [];
  if (Array.isArray(itemsRaw)) {
    items = itemsRaw as Array<Record<string, unknown>>;
  } else if (typeof itemsRaw === 'string' && itemsRaw.trim()) {
    try {
      const parsed = JSON.parse(itemsRaw);
      if (Array.isArray(parsed)) {
        items = parsed as Array<Record<string, unknown>>;
      }
    } catch (error) {
      console.error('Failed to parse prescription items', error);
    }
  }

  return {
    prescriptionNumber: typeof prescription.prescriptionNumber === 'string' ? prescription.prescriptionNumber : undefined,
    createdAt: displayClinicDateTime(prescription.createdAt as string | Date | undefined, '') || null,
    status: typeof prescription.status === 'string' ? prescription.status : undefined,
    doctor: personName(prescription.doctor),
    patient: personName(prescription.patient),
    notes: typeof prescription.notes === 'string' ? prescription.notes : undefined,
    instructions: typeof prescription.instructions === 'string' ? prescription.instructions : undefined,
    pharmacistNotes: typeof prescription.pharmacistNotes === 'string' ? prescription.pharmacistNotes : undefined,
    reviewDate: displayUtcDate((prescription as Record<string, unknown>).reviewDate as string | Date | undefined, '') || null,
    metadata: isPlainObject(prescription.metadata) ? prescription.metadata : undefined,
    items,
  };
}

function PrescriptionSummary({ prescription, onPrint }: PrescriptionSummaryProps) {
  const normalized = normalizePrescription(prescription);

  if (!normalized) {
    return <p className="text-sm text-red-600">Unable to display prescription data.</p>;
  }

  const {
    prescriptionNumber,
    createdAt,
    status,
    doctor,
    patient,
    notes,
    instructions,
    pharmacistNotes,
    reviewDate,
    items,
  } = normalized;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Prescription Overview</h3>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {prescriptionNumber && (
            <div>
              <span className="text-gray-600">Prescription #:</span>
              <span className="ml-2 text-gray-900">{prescriptionNumber}</span>
            </div>
          )}
          {status && (
            <div>
              <span className="text-gray-600">Status:</span>
              <span className="ml-2 text-gray-900 capitalize">{status.toLowerCase()}</span>
            </div>
          )}
          {createdAt && (
            <div>
              <span className="text-gray-600">Created:</span>
              <span className="ml-2 text-gray-900">{createdAt}</span>
            </div>
          )}
          {reviewDate && (
            <div>
              <span className="text-gray-600">Review Date:</span>
              <span className="ml-2 text-gray-900">{reviewDate}</span>
            </div>
          )}
          {doctor && (
            <div>
              <span className="text-gray-600">Doctor:</span>
              <span className="ml-2 text-gray-900">{/^dr\.?\s/i.test(doctor) ? doctor : `Dr. ${doctor}`}</span>
            </div>
          )}
          {patient && (
            <div>
              <span className="text-gray-600">Patient:</span>
              <span className="ml-2 text-gray-900">{patient}</span>
            </div>
          )}
        </div>
      </div>

      <div>
        <h4 className="text-md font-medium text-gray-900">Medications</h4>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No medication items recorded.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {items.map((item, idx) => {
              const name = typeof item.drugName === 'string' ? item.drugName : typeof item.name === 'string' ? item.name : `Medication ${idx + 1}`;
              const dosage = typeof item.dosage === 'string' ? item.dosage : item.dosage ? String(item.dosage) : undefined;
              const frequency = typeof item.frequency === 'string' ? item.frequency : undefined;
              const duration =
                typeof item.duration === 'string' && item.duration.trim()
                  ? item.duration
                  : typeof item.duration === 'number' && Number.isFinite(item.duration)
                    ? String(item.duration)
                    : undefined;
              const durationUnit = typeof item.durationUnit === 'string' ? item.durationUnit : undefined;
              const instructionsText = typeof item.instructions === 'string' ? item.instructions : undefined;
              const additional: string[] = [];

              if (typeof item.applicationSite === 'string') {
                additional.push(`Application site: ${item.applicationSite}`);
              }
              if (typeof item.applicationAmount === 'string') {
                additional.push(`Amount: ${item.applicationAmount}`);
              }
              if (typeof item.dayPart === 'string') {
                additional.push(`Day part: ${item.dayPart}`);
              }
              if (typeof item.pulseRegimen === 'string') {
                additional.push(`Pulse regimen: ${item.pulseRegimen}`);
              }
              if (typeof item.foodInstructions === 'string') {
                additional.push(`Food instructions: ${item.foodInstructions}`);
              }
              if (typeof item.taperSchedule === 'string') {
                additional.push(`Taper schedule: ${item.taperSchedule}`);
              }
              if (item.pregnancyWarning) {
                additional.push('Pregnancy warning');
              }
              if (item.photosensitivityWarning) {
                additional.push('Photosensitivity warning');
              }
              if (typeof item.weightMgPerKgPerDay === 'number') {
                additional.push(`Weight-based dose: ${item.weightMgPerKgPerDay} mg/kg/day`);
              }
              if (typeof item.calculatedDailyDoseMg === 'number') {
                additional.push(`Calculated daily dose: ${item.calculatedDailyDoseMg} mg`);
              }
              if (typeof item.washOffAfterMinutes === 'number') {
                additional.push(`Wash off after: ${item.washOffAfterMinutes} minutes`);
              }

              return (
                <div key={idx} className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{name}</p>
                      <p className="text-sm text-gray-600">
                        {dosage && <span className="mr-2">Dosage: {dosage}</span>}
                        {frequency && <span className="mr-2">Frequency: {frequency.replaceAll('_', ' ')}</span>}
                        {duration && <span className="mr-2">Duration: {duration}{durationUnit ? ` ${durationUnit.toLowerCase()}` : ''}</span>}
                      </p>
                      {instructionsText && (
                        <p className="text-sm text-gray-700 mt-1">Instructions: {instructionsText}</p>
                      )}
                      {additional.length > 0 && (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                          {additional.map((entry, additionalIdx) => (
                            <li key={additionalIdx}>{entry}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(notes || instructions || pharmacistNotes) && (
        <div className="space-y-3">
          {notes && (
            <div>
              <h4 className="text-md font-medium text-gray-900">Notes</h4>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{notes}</p>
            </div>
          )}
          {instructions && (
            <div>
              <h4 className="text-md font-medium text-gray-900">General Instructions</h4>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{instructions}</p>
            </div>
          )}
          {pharmacistNotes && (
            <div>
              <h4 className="text-md font-medium text-gray-900">Pharmacist Notes</h4>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{pharmacistNotes}</p>
            </div>
          )}
        </div>
      )}

      {onPrint && (
        <DialogFooter>
          <Button variant="outline" onClick={onPrint}>Print</Button>
        </DialogFooter>
      )}
    </div>
  );
}
export function PatientHistoryTimeline({ patientId }: { patientId: string }) {
  const { entries: history, loading, error: historyError, refresh } = usePatientHistory(patientId);
  const [viewingPrescription, setViewingPrescription] = useState<{
    visitId: string;
    prescriptionId: string;
  } | null>(null);
  const [prescriptionsCache, setPrescriptionsCache] = useState<Record<string, unknown>>({});
  const [prescriptionLoading, setPrescriptionLoading] = useState(false);
  const [prescriptionError, setPrescriptionError] = useState<string | null>(null);

  if (historyError) return <div role="alert" className="p-4 text-red-700">Unable to load patient history. {historyError} <Button onClick={() => void refresh()}>Retry</Button></div>;

  if (loading) {
    return (
      <LoadingSkeleton label="Loading visit history…" />
    );
  }

  if (!patientId) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p>Select a patient to view their visit history</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p>No documented history to show</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="whitespace-nowrap text-lg font-medium text-gray-900">Patient History</h3>
          <Badge variant="secondary" className="shrink-0 whitespace-nowrap">{history.length === 1 ? '1 Record' : `${history.length} Records`}</Badge>
        </div>
        <Button variant="ghost" size="sm" className="-mr-2 ml-auto shrink-0 px-2" onClick={() => void refresh()}>Refresh</Button>
      </div>
      
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
        
        <div className="space-y-6">
          {history.map((visit, index) => {
            const isProcedure = JSON.stringify(visit.scribeJson ?? visit.visitType ?? '')
              .toLowerCase()
              .includes('procedure');
            const hasPrescription = !!visit.prescription?.id;
            
            return (
              <div key={visit.id} className="relative flex items-start space-x-4">
                <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center ${
                  index === 0 
                    ? 'bg-blue-100 border-blue-500 text-blue-600'
                    : 'bg-gray-100 border-gray-300 text-gray-500'
                }`}>
                  {isProcedure ? (
                    <Activity className="h-4 w-4" />
                  ) : (
                    <Stethoscope className="h-4 w-4" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <PatientHistoryVisitCard
                    visit={visit as unknown as Record<string, unknown>}
                    visitLabel={visit.entryType === 'appointment' ? 'Appointment' : index === 0 ? 'Most recent record' : undefined}
                    highlight={index === 0}
                    resumeLabel={visit.status === VisitStatus.COMPLETED ? 'Open visit' : undefined}
                    onResume={
                      visit.id
                        ? () => {
                            window.location.href = `/dashboard/visits?visitId=${encodeURIComponent(visit.id)}`;
                          }
                        : undefined
                    }
                    footerActions={
                      hasPrescription ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const prescriptionId = visit.prescription!.id;
                            setViewingPrescription({ visitId: visit.id, prescriptionId });
                            if (!prescriptionsCache[prescriptionId]) {
                              setPrescriptionError(null);
                              setPrescriptionLoading(true);
                              void apiClient
                                .getPrescription(prescriptionId)
                                .then((data) => {
                                  setPrescriptionsCache((prev) => ({
                                    ...prev,
                                    [prescriptionId]: data,
                                  }));
                                })
                                .catch((error: unknown) => {
                                  console.error('Failed to load prescription', error);
                                  setPrescriptionError(
                                    'Unable to load prescription. Please try again.'
                                  );
                                })
                                .finally(() => {
                                  setPrescriptionLoading(false);
                                });
                            }
                          }}
                        >
                          View Prescription
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog
        open={!!viewingPrescription}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setViewingPrescription(null);
            setPrescriptionError(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Prescription Details</DialogTitle>
            <DialogDescription>
              Review the medications and instructions issued during this visit.
            </DialogDescription>
          </DialogHeader>

          {prescriptionLoading && <p className="text-sm text-gray-500">Loading prescription…</p>}
          {prescriptionError && <p className="text-sm text-red-600">{prescriptionError}</p>}

          {!prescriptionLoading && viewingPrescription && !prescriptionError && (
            <PrescriptionSummary
              prescription={prescriptionsCache[viewingPrescription.prescriptionId]}
              onPrint={() => window.print()}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
