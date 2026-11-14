'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiClient } from '@/lib/api';
import { getISTDateString } from '@/lib/utils';
import { APPROVALS, DAILY_COLLECTION, EXPIRING_LIST, LOW_STOCK_LIST, stockLeft, type BillDue, type ClinicAlerts } from '@/lib/dashboard-links';
import type { AppointmentInSlot, ClinicBillAccess } from '@/lib/types';
import { ITEM_REQUEST_APPROVER_ROLES } from '@/lib/inventory-item-requests';
import { formatRupee } from '@/components/pharmacy/reports/report-format';
import type { DailyCollectionReport } from '@/components/pharmacy/reports/report-types';
import { billHref } from '@/components/pharmacy/sales/sales-bill-model';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppointmentBillDialog } from '@/components/appointments/AppointmentBillDialog';
import { NO_BILL_ACCESS, toRow } from './TodaysAppointments';
import { LoadFailureState, loadFailure, type LoadFailure } from './load-failure';

export type Loadable<T> = { status: 'loading' } | { status: 'error'; failure: LoadFailure } | { status: 'ready'; value: T };

function useLoad<T>(fetch: () => Promise<T>): [Loadable<T>, () => void] {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });
  const load = useCallback(() => {
    fetch().then(
      (value) => setState({ status: 'ready', value }),
      (error) => setState({ status: 'error', failure: loadFailure(error) }),
    );
  }, [fetch]);
  useEffect(load, [load]);
  return [state, load];
}

function Loaded<T>({ state, subject, onRetry, children }: { state: Loadable<T>; subject: string; onRetry: () => void; children: (value: T) => ReactNode }) {
  if (state.status === 'loading') return <p role="status" className="text-sm text-gray-500">Loading {subject}…</p>;
  if (state.status === 'error') return <LoadFailureState failure={state.failure} subject={subject} onRetry={onRetry} />;
  return <>{children(state.value)}</>;
}

const ALWAYS_SHOWN_MODES = new Set(['CASH', 'UPI', 'CARD']);

const fetchCollection = () => apiClient.get<DailyCollectionReport>('/pharmacy/reports/daily-collection', { from: getISTDateString() });

export function CollectionFigure() {
  const [state, retry] = useLoad(fetchCollection);
  const pharmacyOnly = state.status === 'ready' && !state.value.wholeDay;
  return (
    <Card className="relative gap-3">
      <CardHeader>
        <CardTitle className="text-base">
          <Link href={DAILY_COLLECTION} className="after:absolute after:inset-0 hover:underline">
            {pharmacyOnly ? 'Pharmacy collection today' : "Today's collection"}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Loaded state={state} subject="today's collection" onRetry={retry}>
          {(report) => {
            const whole = report.wholeDay;
            const total = whole ? whole.total : report.collection.expectedTotal;
            const modes = whole
              ? whole.modes.map((m) => ({ mode: m.mode, label: m.label, amount: m.total }))
              : report.collection.modes.map((m) => ({ mode: m.mode, label: m.label, amount: m.expected }));
            return (
              <div className="space-y-1">
                <p className="text-3xl font-semibold tabular-nums">{formatRupee(total)}</p>
                {whole && <Parts parts={[`Clinic ${formatRupee(whole.clinic)}`, `Pharmacy ${formatRupee(whole.pharmacy)}`]} />}
                <Parts parts={modes.filter((m) => ALWAYS_SHOWN_MODES.has(m.mode) || m.amount !== 0).map((m) => `${m.label} ${formatRupee(m.amount)}`)} />
              </div>
            );
          }}
        </Loaded>
      </CardContent>
    </Card>
  );
}

function Parts({ parts }: { parts: string[] }) {
  return (
    <p className="text-sm text-gray-700 tabular-nums">
      {parts.map((part, i) => (
        <span key={part}>{i > 0 && ' · '}<span className="whitespace-nowrap">{part}</span></span>
      ))}
    </p>
  );
}

type BillAppointment = NonNullable<BillDue['appointment']>;
type OpenBill = { booked: BillAppointment; appointment: AppointmentInSlot; access: ClinicBillAccess };

/** The bill dialog takes the appointment as the calendar row has it, so read that row from the doctor's day. */
async function billOf(booked: BillAppointment): Promise<OpenBill | null> {
  const schedule = await apiClient.getDoctorSchedule(booked.doctorId, booked.day);
  const row = schedule?.appointments?.find((a) => a.id === booked.id);
  return row ? { booked, appointment: toRow(row), access: schedule.billingAccess ?? NO_BILL_ACCESS } : null;
}

export function BillsDue({ alerts, onRetry, onBillChanged = onRetry, title = 'Bills due' }: { alerts: Loadable<ClinicAlerts>; onRetry: () => void; onBillChanged?: () => void; title?: string }) {
  const [open, setOpen] = useState<OpenBill | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const canTakePayment = alerts.status === 'ready' && !!alerts.value.canTakePayment;

  const openBill = async (bill: BillDue) => {
    setOpenError(null);
    const found = bill.appointment ? await billOf(bill.appointment).catch(() => null) : null;
    if (found) setOpen(found);
    else setOpenError(`Couldn't open the bill for ${bill.patient?.name ?? bill.invoiceNo}. Try again from the calendar.`);
  };
  const onPaid = async () => {
    onBillChanged();
    if (open) setOpen(await billOf(open.booked).catch(() => open));
  };

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Loaded state={alerts} subject="bills due" onRetry={onRetry}>
          {(value) => {
            const bills = value.billsDue ?? [];
            if (!bills.length) return <p className="text-sm text-gray-500">None.</p>;
            const more = (value.counts?.billsDue ?? bills.length) - bills.length;
            return (
              <div className="space-y-2">
                <p className="text-3xl font-semibold tabular-nums">{formatRupee(value.billsDueBalance ?? 0)}</p>
                <ul className="space-y-1" aria-label={title}>
                  {bills.map((bill) => {
                    const name = bill.patient?.name ?? bill.invoiceNo;
                    const content = (
                      <>
                        <span className="truncate">{name}</span>
                        <span className="shrink-0 font-medium tabular-nums">{formatRupee(bill.balance)}</span>
                      </>
                    );
                    return (
                      <li key={bill.id}>
                        {canTakePayment && bill.appointment ? (
                          <button type="button" onClick={() => void openBill(bill)} aria-label={`${name} ${formatRupee(bill.balance)}`}
                            className="flex w-full justify-between gap-3 rounded px-1 text-left text-sm hover:bg-gray-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                            {content}
                          </button>
                        ) : (
                          <div className="flex justify-between gap-3 px-1 text-sm">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {more > 0 && <p className="text-xs text-gray-500">and {more} more</p>}
                {openError && <p role="alert" className="text-sm text-red-700">{openError}</p>}
              </div>
            );
          }}
        </Loaded>
      </CardContent>
      {open && (
        <AppointmentBillDialog appointment={open.appointment} access={open.access} onClose={() => setOpen(null)} onChanged={onPaid} />
      )}
    </Card>
  );
}

const fetchApprovals = async (canApproveNewItems: boolean) => {
  const [overview, newItems] = await Promise.all([
    apiClient.get<{ pendingEdits?: number | null }>('/inventory/workspace/overview'),
    canApproveNewItems ? apiClient.getInventoryItemRequestPendingCount() : Promise.resolve(null),
  ]);
  if (overview?.pendingEdits == null && newItems == null) return null;
  return (overview?.pendingEdits ?? 0) + (newItems?.count ?? 0);
};

/** Price, stock and new-medicine requests waiting for this approver. */
export function ApprovalsFigure({ role }: { role: string }) {
  const canApproveNewItems = ITEM_REQUEST_APPROVER_ROLES.includes(role);
  const fetch = useCallback(() => fetchApprovals(canApproveNewItems), [canApproveNewItems]);
  const [state, retry] = useLoad(fetch);
  if (state.status === 'ready' && state.value === null) return null;
  return (
    <Card className="relative gap-3">
      <CardHeader>
        <CardTitle className="text-base">
          <Link href={APPROVALS} className="after:absolute after:inset-0 hover:underline">Waiting for approval</Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Loaded state={state} subject="requests to approve" onRetry={retry}>
          {(count) => <p className="text-3xl font-semibold tabular-nums">{count}</p>}
        </Loaded>
      </CardContent>
    </Card>
  );
}

export function NeedsAttention({ alerts, onRetry }: { alerts: Loadable<ClinicAlerts>; onRetry: () => void }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">Needs attention</CardTitle>
      </CardHeader>
      <CardContent>
        <Loaded state={alerts} subject="stock alerts" onRetry={onRetry}>
          {(value) => (
            <div className="grid gap-4 md:grid-cols-2">
              <StockList href={LOW_STOCK_LIST} title={`Low stock (${value.counts?.lowStockAlerts ?? 0})`}
                rows={(value.lowStockAlerts ?? []).map((i) => [i.itemId, i.itemName, stockLeft(i)])} />
              <StockList href={EXPIRING_LIST} title={`Expiring in 3 months (${value.counts?.expiryAlerts ?? 0})`}
                rows={(value.expiryAlerts ?? []).map((i) => [i.itemId, i.itemName, `${i.daysUntilExpiry} days`])} />
            </div>
          )}
        </Loaded>
      </CardContent>
    </Card>
  );
}

function StockList({ href, title, rows }: { href: string; title: string; rows: string[][] }) {
  return (
    <div>
      <Link href={href} className="text-sm font-semibold text-blue-700 hover:underline">{title}</Link>
      {rows.length > 0 && (
        <ul className="mt-1 space-y-0.5" aria-label={title}>
          {rows.map(([id, name, detail]) => (
            <li key={id} className="flex justify-between gap-3 text-sm">
              <span className="truncate">{name}</span>
              <span className="shrink-0 text-gray-600 tabular-nums">{detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Waiting = {
  prescriptionId: string;
  dispensingEligible?: boolean;
  visitId?: string | null;
  patient: { id: string; name: string };
  doctor: { id: string; name: string };
  pendingHours: number;
  medications: unknown[];
};

const fetchWaiting = () =>
  apiClient.get<{ data: Waiting[]; pagination: { total: number } }>('/pharmacy/prescription-queue', { page: 1, limit: 5, status: 'pending' });

const waited = (hours: number) => (hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min` : `${Math.round(hours)} h`);

export function PharmacyWork({ alerts, onRetry }: { alerts: Loadable<ClinicAlerts>; onRetry: () => void }) {
  const [state, retry] = useLoad(fetchWaiting);
  const waiting = state.status === 'ready' ? state.value.data : [];
  const firstBillable = waiting.find((w) => w.dispensingEligible !== false)?.prescriptionId;
  return (
    <div className="space-y-6">
      <Card className="gap-3">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">
            Prescriptions waiting{state.status === 'ready' ? ` (${state.value.pagination?.total ?? waiting.length})` : ''}
          </CardTitle>
          <Button asChild variant={firstBillable ? 'outline' : 'default'} className="shrink-0">
            <Link href={billHref()}>New sale</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Loaded state={state} subject="prescriptions waiting" onRetry={retry}>
            {() =>
              waiting.length === 0 ? (
                <p className="text-sm text-gray-500">None.</p>
              ) : (
                <ul className="divide-y rounded-lg border" aria-label="Prescriptions waiting">
                  {waiting.map((w) => (
                    <li key={w.prescriptionId} className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{w.patient.name}</span>
                        <span className="block truncate text-xs text-gray-600">
                          {w.medications.length} medicine{w.medications.length === 1 ? '' : 's'} · Dr. {w.doctor.name} · {waited(w.pendingHours)}
                        </span>
                      </span>
                      {w.dispensingEligible !== false && (
                        <Button asChild size="sm" variant={w.prescriptionId === firstBillable ? 'default' : 'outline'}>
                          <Link href={billHref({ prefill: { patientId: w.patient.id, prescriptionId: w.prescriptionId, doctorId: w.doctor.id, visitId: w.visitId || undefined } })}>Bill</Link>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )
            }
          </Loaded>
        </CardContent>
      </Card>
      <Card className="gap-3">
        <CardContent>
          <Loaded state={alerts} subject="stock alerts" onRetry={onRetry}>
            {(value) => (
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                <Link href={LOW_STOCK_LIST} className="text-base font-semibold text-blue-700 hover:underline">Low stock ({value.counts?.lowStockAlerts ?? 0})</Link>
                <Link href={EXPIRING_LIST} className="text-base font-semibold text-blue-700 hover:underline">Expiring in 3 months ({value.counts?.expiryAlerts ?? 0})</Link>
              </div>
            )}
          </Loaded>
        </CardContent>
      </Card>
    </div>
  );
}
