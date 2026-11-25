'use client';

import { displayClinicDateTime } from '@/lib/date-display';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient } from '@/lib/api';
import { UserRole } from '@cms/shared-types';
import { Activity, Settings, Save, User } from 'lucide-react';
import type { ProcedureVisitResponse, StaffSummary, VisitSummary } from '@/lib/types';
import { QuickGuide } from '@/components/common/QuickGuide';
import { resolveDefaultDoctorId } from '@/lib/default-visit-doctor';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/lib/utils';
import { PatientPicker } from '@/components/procedures/PatientPicker';
import { ProcedureDetails } from '@/components/procedures/ProcedureDetails';
import { ProcedureAccessDialog } from '@/components/procedures/ProcedureAccessDialog';
import type { MyProcedureAccess } from '@/components/procedures/procedure-access';
import {
  BODY_PARTS,
  MACHINES,
  SKIN_TYPES,
  emptyProcedure,
  machineSpec,
  parseVisitProcedure,
  repeatAsNewSession,
  toVisitRequest,
  totalShots,
  type MachineId,
  type PatientRef,
  type ProcedureRecord,
  type SkinTypes,
  type StoredProcedure,
} from '@/components/procedures/procedure-record';

const HISTORY_SCAN_LIMIT = 100;

type Loadable<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T };

interface Staff {
  doctors: StaffSummary[];
  nurses: StaffSummary[];
  defaultDoctorId: string;
  access: MyProcedureAccess;
}

interface History {
  procedures: StoredProcedure[];
  scannedAll: boolean;
}

const usersOf = (res: unknown): StaffSummary[] =>
  Array.isArray(res) ? res : ((res as { users?: StaffSummary[] })?.users ?? []);

const visitsOf = (payload: ProcedureVisitResponse | VisitSummary[] | undefined): VisitSummary[] => {
  if (Array.isArray(payload)) return payload;
  return payload?.visits ?? payload?.data ?? [];
};

const nonNegative = (value: string) => Math.max(0, Number.parseInt(value, 10) || 0);

const SKIN_FIELDS: Array<{ key: keyof SkinTypes; label: string; placeholder: string; format: (v: string) => string }> = [
  { key: 'fitzpatrick', label: 'Fitzpatrick Type', placeholder: 'Select type', format: (v) => `Type ${v}` },
  { key: 'robert', label: 'Robert Type', placeholder: 'Select type', format: (v) => v },
  { key: 'scar', label: 'Scar Type', placeholder: 'Select type', format: (v) => v },
  { key: 'herpes', label: 'Herpes Status', placeholder: 'Select status', format: (v) => v },
];

export default function ProceduresPage() {
  const { toast } = useToast();
  const [staff, setStaff] = useState<Loadable<Staff>>({ status: 'loading' });
  const [record, setRecord] = useState<ProcedureRecord>(() => emptyProcedure());
  const [activeTab, setActiveTab] = useState('new');
  const [historyPatient, setHistoryPatient] = useState<PatientRef | null>(null);
  const [history, setHistory] = useState<Loadable<History>>({ status: 'loading' });
  const [details, setDetails] = useState<StoredProcedure | null>(null);
  const [saving, setSaving] = useState(false);
  const historyRequest = useRef(0);

  const loadStaff = useCallback(async () => {
    setStaff({ status: 'loading' });
    try {
      const [doctorsRes, nursesRes, access] = await Promise.all([
        apiClient.getUsers({ role: UserRole.DOCTOR, limit: 50 }),
        apiClient.getUsers({ role: UserRole.NURSE, limit: 50 }),
        apiClient.getMyProcedureAccess(),
      ]);
      let defaultDoctorId = '';
      try {
        const me = await apiClient.get<{ id?: string; role?: string }>('/auth/me');
        defaultDoctorId = resolveDefaultDoctorId({ role: me?.role, userId: me?.id, current: '' });
      } catch (error) {
        console.error('Failed to resolve signed-in user:', error);
      }
      setStaff({ status: 'ready', data: { doctors: usersOf(doctorsRes), nurses: usersOf(nursesRes), defaultDoctorId, access } });
      setRecord((prev) => ({ ...prev, doctorId: prev.doctorId || defaultDoctorId }));
    } catch (error) {
      setStaff({ status: 'error', message: getErrorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const loadHistory = useCallback(async (patientId?: string) => {
    const request = ++historyRequest.current;
    setHistory({ status: 'loading' });
    try {
      const res = await apiClient.getVisits({ ...(patientId ? { patientId } : {}), limit: HISTORY_SCAN_LIMIT });
      if (request !== historyRequest.current) return;
      const visits = visitsOf(res as ProcedureVisitResponse | VisitSummary[]);
      const procedures = visits.map(parseVisitProcedure).filter((p): p is StoredProcedure => p !== null);
      setHistory({ status: 'ready', data: { procedures, scannedAll: visits.length < HISTORY_SCAN_LIMIT } });
    } catch (error) {
      if (request !== historyRequest.current) return;
      setHistory({ status: 'error', message: getErrorMessage(error) });
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') void loadHistory(historyPatient?.id);
  }, [activeTab, historyPatient?.id, loadHistory]);

  const update = <K extends keyof ProcedureRecord>(field: K, value: ProcedureRecord[K]) =>
    setRecord((prev) => ({ ...prev, [field]: value }));

  const choosePatient = (patient: PatientRef | null) => {
    update('patient', patient);
    if (patient) setHistoryPatient(patient);
  };

  const chooseMachine = (machine: MachineId) =>
    setRecord((prev) => (prev.machine === machine ? prev : { ...prev, machine, parameters: {} }));

  const updateParameter = (name: string, pass: number, value: string) =>
    setRecord((prev) => ({
      ...prev,
      parameters: { ...prev.parameters, [name]: { ...prev.parameters[name], [pass]: value } },
    }));

  const toggleBodyPart = (part: string) =>
    setRecord((prev) => ({
      ...prev,
      bodyParts: prev.bodyParts.includes(part) ? prev.bodyParts.filter((p) => p !== part) : [...prev.bodyParts, part],
    }));

  const defaultDoctorId = staff.status === 'ready' ? staff.data.defaultDoctorId : '';
  const access = staff.status === 'ready' ? staff.data.access : null;
  const canRecord = access?.canRecord ?? false;
  const total = totalShots(record.shotCounts);

  /**
   * @cc [owner:nareshshah139,label:product] procedure-visit-payload
   * Saving a new procedure MUST go through the procedures endpoint and retain the selected therapist
   * inside the stored procedure details. Editing a loaded procedure MUST update that visit, not create
   * another. Missing required selections MUST prevent the save.
   */
  const saveProcedure = async () => {
    if (!record.patient || !record.doctorId || !record.machine) {
      toast({ variant: 'warning', title: 'Choose a patient, a doctor and a machine before saving.' });
      return;
    }
    if (total === null) {
      toast({ variant: 'warning', title: 'The end shot count is lower than the begin count.' });
      return;
    }

    setSaving(true);
    try {
      const request = toVisitRequest(record);
      if (request.kind === 'update') {
        await apiClient.updateProcedure(request.visitId, request.body);
        toast({ variant: 'success', title: 'Procedure updated' });
        setRecord({ ...emptyProcedure(defaultDoctorId), patient: record.patient });
        setHistoryPatient(record.patient);
        setActiveTab('history');
      } else {
        await apiClient.createProcedure(request.body);
        toast({ variant: 'success', title: 'Procedure saved' });
        setRecord({
          ...record,
          sessionNo: record.sessionNo + 1,
          shotCounts: { begin: 0, end: 0 },
          parameters: {},
          notes: '',
        });
      }
    } catch (error) {
      console.error('Failed to save procedure:', error);
      toast({ variant: 'destructive', title: 'Could not save the procedure', description: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const editProcedure = (procedure: StoredProcedure) => {
    setRecord(procedure.record);
    setDetails(null);
    setActiveTab('new');
  };

  const repeatProcedure = (procedure: StoredProcedure) => {
    setRecord(repeatAsNewSession(procedure));
    setDetails(null);
    setActiveTab('new');
  };

  const nurseName = (id: string) => {
    const nurse = staff.status === 'ready' ? staff.data.nurses.find((n) => n.id === id) : undefined;
    return nurse ? `${nurse.firstName} ${nurse.lastName}`.trim() : '';
  };

  const renderProcedureCard = (procedure: StoredProcedure) => {
    const { record: saved } = procedure;
    const shots = totalShots(saved.shotCounts);
    return (
      <Card key={saved.visit.id}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{saved.patient?.name}</CardTitle>
              <CardDescription>{displayClinicDateTime(saved.visit.createdAt)}</CardDescription>
            </div>
            <Badge variant="outline">{procedure.label}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {procedure.doctorName && <div className="col-span-2 flex items-center gap-2 text-muted-foreground"><User className="h-4 w-4" aria-hidden="true" />{procedure.doctorName}</div>}
            {procedure.editable && <div><dt className="inline text-muted-foreground">Session: </dt><dd className="inline">{saved.sessionNo}</dd></div>}
            {procedure.editable && <div><dt className="inline text-muted-foreground">Total shots: </dt><dd className="inline">{shots ?? 'invalid'}</dd></div>}
            {saved.bodyParts.length > 0 && <div className="col-span-2"><dt className="inline text-muted-foreground">Areas: </dt><dd className="inline">{saved.bodyParts.join(', ')}</dd></div>}
          </dl>
          {saved.notes && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{saved.notes}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {canRecord && procedure.editable && (
              <Button size="sm" variant="outline" onClick={() => editProcedure(procedure)}>Load &amp; Edit</Button>
            )}
            {canRecord && <Button size="sm" variant="outline" onClick={() => repeatProcedure(procedure)}>Repeat as new session</Button>}
            <Button size="sm" variant="ghost" onClick={() => setDetails(procedure)}>View Details</Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderMachineParametersTable = () => {
    if (!record.machine) return null;
    const machine = machineSpec(record.machine);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">{machine.name} Parameters</CardTitle>
          <CardDescription>Configure parameters for each pass</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-border">
              <thead>
                <tr className="bg-muted">
                  <th className="border border-border p-2 text-left font-medium">Parameter</th>
                  {Array.from({ length: machine.passes }, (_, i) => (
                    <th key={i} className="border border-border p-2 text-center font-medium">Pass {i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {machine.parameters.map((param, paramIndex) => (
                  <tr key={param} className={paramIndex % 2 === 0 ? 'bg-card' : 'bg-muted/40'}>
                    <th scope="row" className="border border-border p-2 text-left font-medium text-foreground">{param}</th>
                    {Array.from({ length: machine.passes }, (_, passIndex) => (
                      <td key={passIndex} className="border border-border p-1">
                        <Input
                          aria-label={`${param}, pass ${passIndex + 1}`}
                          placeholder={param.toLowerCase()}
                          value={record.parameters[param]?.[passIndex + 1] || ''}
                          onChange={(e) => updateParameter(param, passIndex + 1, e.target.value)}
                          className="text-xs"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderForm = (doctors: StaffSummary[], nurses: StaffSummary[]) => (
    <fieldset disabled={!canRecord} className="min-w-0 space-y-6">
      {record.visit && (
        <Alert>
          <AlertTitle>Editing the procedure from {displayClinicDateTime(record.visit.createdAt)}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Saving updates that visit. Patient and doctor stay as recorded.</span>
            <Button size="sm" variant="outline" onClick={() => setRecord(emptyProcedure(defaultDoctorId))}>Cancel editing</Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PatientPicker
            id="procedure-patient"
            label="Patient *"
            value={record.patient}
            onChange={choosePatient}
            clearLabel="Change"
            locked={Boolean(record.visit)}
          />

          <div>
            <label htmlFor="procedure-doctor" className="text-sm font-medium text-foreground">Doctor *</label>
            <Select value={record.doctorId} onValueChange={(value: string) => update('doctorId', value)} disabled={!canRecord || Boolean(record.visit)}>
              <SelectTrigger id="procedure-doctor">
                <SelectValue placeholder="Select doctor" />
              </SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="procedure-therapist" className="text-sm font-medium text-foreground">Nurse/Therapist</label>
            <Select value={record.therapistId} onValueChange={(value: string) => update('therapistId', value)} disabled={!canRecord}>
              <SelectTrigger id="procedure-therapist">
                <SelectValue placeholder="Select nurse" />
              </SelectTrigger>
              <SelectContent>
                {nurses.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Procedure Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="procedure-session" className="text-sm font-medium text-foreground">Session No.</label>
              <Input id="procedure-session" type="number" min={1} inputMode="numeric" value={record.sessionNo} onChange={(e) => update('sessionNo', Math.max(1, nonNegative(e.target.value)))} />
            </div>

            <div>
              <label htmlFor="procedure-shots-begin" className="text-sm font-medium text-foreground">Shot Count (Begin)</label>
              <Input id="procedure-shots-begin" type="number" min={0} inputMode="numeric" value={record.shotCounts.begin} onChange={(e) => update('shotCounts', { ...record.shotCounts, begin: nonNegative(e.target.value) })} />
            </div>

            <div>
              <label htmlFor="procedure-shots-end" className="text-sm font-medium text-foreground">Shot Count (End)</label>
              <Input id="procedure-shots-end" type="number" min={0} inputMode="numeric" value={record.shotCounts.end} aria-invalid={total === null} aria-describedby={total === null ? 'procedure-shots-error' : undefined} onChange={(e) => update('shotCounts', { ...record.shotCounts, end: nonNegative(e.target.value) })} />
              {total === null && <p id="procedure-shots-error" className="mt-1 text-xs text-destructive">End count is lower than the begin count.</p>}
            </div>

            <div>
              <label htmlFor="procedure-shots-total" className="text-sm font-medium text-foreground">Total Shots</label>
              <Input id="procedure-shots-total" value={total ?? '—'} disabled className="bg-muted" />
            </div>
          </div>

          <div>
            <p id="procedure-body-parts" className="text-sm font-medium text-foreground mb-2 block">Body Parts</p>
            <div role="group" aria-labelledby="procedure-body-parts" className="flex flex-wrap gap-2">
              {BODY_PARTS.map((part) => (
                <Button
                  key={part}
                  type="button"
                  variant={record.bodyParts.includes(part) ? 'default' : 'outline'}
                  aria-pressed={record.bodyParts.includes(part)}
                  size="sm"
                  onClick={() => toggleBodyPart(part)}
                >
                  {part}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="procedure-indications" className="text-sm font-medium text-foreground">Indications</label>
            <Textarea id="procedure-indications"
              placeholder="Enter procedure indications..."
              value={record.indications}
              onChange={(e) => update('indications', e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skin Type Assessment</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {SKIN_FIELDS.map(({ key, label, placeholder, format }) => (
            <div key={key}>
              <label htmlFor={`procedure-${key}`} className="text-sm font-medium text-foreground">{label}</label>
              <Select value={record.skinTypes[key]} onValueChange={(value: string) => update('skinTypes', { ...record.skinTypes, [key]: value })} disabled={!canRecord}>
                <SelectTrigger id={`procedure-${key}`}>
                  <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                  {SKIN_TYPES[key].map((option) => (
                    <SelectItem key={option} value={option}>{format(option)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Machine Selection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {(Object.keys(MACHINES) as MachineId[]).map((id) => (
              <Button
                key={id}
                type="button"
                variant={record.machine === id ? 'default' : 'outline'}
                aria-pressed={record.machine === id}
                className="h-14"
                onClick={() => chooseMachine(id)}
              >
                {machineSpec(id).name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {renderMachineParametersTable()}

      <Card>
        <CardHeader>
          <CardTitle>Additional Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Additional notes"
            placeholder="Enter any additional notes or observations..."
            value={record.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={4}
          />
        </CardContent>
      </Card>

      {canRecord && (
        <div className="flex justify-end">
          <Button onClick={saveProcedure} disabled={saving} size="lg" className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : record.visit ? 'Update Procedure' : 'Save Procedure'}
          </Button>
        </div>
      )}
    </fieldset>
  );

  const renderHistory = () => {
    if (history.status === 'loading') return <LoadingSkeleton variant="cards" label="Loading procedure history…" />;
    if (history.status === 'error') {
      return (
        <Alert variant="destructive">
          <AlertTitle>Could not load procedure history</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{history.message}</span>
            <Button size="sm" variant="outline" onClick={() => void loadHistory(historyPatient?.id)}>Try again</Button>
          </AlertDescription>
        </Alert>
      );
    }
    const { procedures, scannedAll } = history.data;
    if (procedures.length === 0) {
      const scope = historyPatient ? ` for ${historyPatient.name}` : '';
      return (
        <Card>
          <EmptyState
            icon={Activity}
            title={scannedAll ? `No procedures recorded${scope || ' yet'}` : `No procedures in the ${HISTORY_SCAN_LIMIT} most recent visits${scope}`}
            description={historyPatient ? 'Procedures saved for this patient will appear here.' : 'Choose a patient to search their full history.'}
          />
        </Card>
      );
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {procedures.map(renderProcedureCard)}
      </div>
    );
  };

  const historySummary = history.status !== 'ready'
    ? ''
    : `${history.data.procedures.length} procedure${history.data.procedures.length === 1 ? '' : 's'} for ${historyPatient?.name ?? 'all patients'}${history.data.scannedAll ? '' : ` in the ${HISTORY_SCAN_LIMIT} most recent visits`}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Procedures" actions={<>{access?.canConfigure && <ProcedureAccessDialog />}<QuickGuide
              title="Procedures guide"
              sections={[
                {
                  title: "Creating Procedures",
                  items: [
                    "Select patient, doctor, and nurse/therapist for the procedure",
                    "Choose the treatment machine (Endymed, Fotona, Soprano, Hydrafacial)",
                    "Fill in the session number and the body parts treated",
                    "Record begin and end shot counts and the skin type assessment"
                  ]
                },
                {
                  title: "Machine Parameters",
                  items: [
                    "Choosing a machine opens its own parameter table",
                    "Enter a value for each pass. Hydrafacial has one pass, the other machines eight",
                    "Patient, doctor and machine are required to save"
                  ]
                },
                {
                  title: "Procedure History",
                  items: [
                    "View past procedures for one patient or all patients",
                    "Load & Edit corrects a saved procedure in place",
                    "Repeat as new session copies the settings into the next session",
                    "View Details shows every recorded field"
                  ]
                }
              ]}
            /></>} />

      {access && !access.canRecord && (
        <Alert>
          <AlertDescription>Your role can view procedures but not record them. A doctor or admin can change this.</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="new">{record.visit ? 'Edit Procedure' : 'New Procedure'}</TabsTrigger>
          <TabsTrigger value="history">Procedure History</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-6">
          {staff.status === 'loading' && <LoadingSkeleton label="Loading doctors and nurses…" />}
          {staff.status === 'error' && (
            <Alert variant="destructive">
              <AlertTitle>Could not load the procedure form</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>{staff.message}</span>
                <Button size="sm" variant="outline" onClick={() => void loadStaff()}>Try again</Button>
              </AlertDescription>
            </Alert>
          )}
          {staff.status === 'ready' && renderForm(staff.data.doctors, staff.data.nurses)}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Procedure History</h3>
              <p className="text-sm text-muted-foreground" aria-live="polite">{historySummary}</p>
            </div>
            <div className="w-full max-w-sm">
              <PatientPicker
                id="procedure-history-patient"
                label="Filter by patient"
                value={historyPatient}
                onChange={setHistoryPatient}
                clearLabel="All patients"
              />
            </div>
          </div>
          {renderHistory()}
        </TabsContent>
      </Tabs>

      <Dialog open={details !== null} onOpenChange={(open: boolean) => { if (!open) setDetails(null); }}>
        <DialogContent className="max-w-2xl">
          {details && (
            <>
              <DialogHeader>
                <DialogTitle>{details.label}{details.editable ? ` · Session ${details.record.sessionNo}` : ''}</DialogTitle>
                <DialogDescription>{details.record.patient?.name}</DialogDescription>
              </DialogHeader>
              <ProcedureDetails procedure={details} nurseName={nurseName(details.record.therapistId)} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
