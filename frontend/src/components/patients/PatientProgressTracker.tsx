'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Stethoscope, FileText, Pill, Receipt } from 'lucide-react';
import Link from 'next/link';

type StepStatus = 'done' | 'active' | 'pending';

interface Props {
  patientId: string;
  compact?: boolean;
}

interface NextAppointmentResponse {
  id?: string;
  date?: string | Date;
  slot?: string;
  status?: string;
  visit?: { id?: string } | null;
}

interface VisitEntryMinimal {
  id?: string;
  createdAt?: string | Date;
  followUp?: string | Date | null;
  prescription?: { id?: string } | null;
}

export default function PatientProgressTracker({ patientId, compact = false }: Props) {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nextAppointment, setNextAppointment] = useState<NextAppointmentResponse | null>(null);
  const [latestVisit, setLatestVisit] = useState<VisitEntryMinimal | null>(null);
  const [hasRecentInvoice, setHasRecentInvoice] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!patientId) return;
      try {
        setLoading(true);
        setError(null);

        const [appt, visits, invoices] = await Promise.allSettled([
          apiClient.getPatientNextAppointment(patientId),
          apiClient.getPatientVisitHistory<VisitEntryMinimal[] | { visits?: VisitEntryMinimal[]; data?: VisitEntryMinimal[] }>(patientId, { limit: 1 }),
          apiClient.getInvoices({ patientId, limit: 1, sortBy: 'createdAt', sortOrder: 'desc' }),
        ]);

        if (cancelled) return;

        if (appt.status === 'fulfilled') {
          setNextAppointment((appt.value as unknown) as NextAppointmentResponse);
        } else {
          setNextAppointment(null);
        }

        if (visits.status === 'fulfilled') {
          const payload = visits.value;
          const arr = Array.isArray(payload)
            ? payload
            : (payload?.visits || (payload as any)?.data || []);
          const v = Array.isArray(arr) && arr.length > 0 ? (arr[0] as VisitEntryMinimal) : null;
          setLatestVisit(v);
        } else {
          setLatestVisit(null);
        }

        if (invoices.status === 'fulfilled') {
          const res: any = invoices.value;
          const list: any[] = res?.invoices || res?.data || res || [];
          setHasRecentInvoice(Array.isArray(list) && list.length > 0);
        } else {
          setHasRecentInvoice(false);
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const now = useMemo(() => new Date(), []);
  const latestVisitDate = useMemo(() => (latestVisit?.createdAt ? new Date(latestVisit.createdAt) : null), [latestVisit]);
  const hasActiveVisit = useMemo(() => {
    if (!latestVisitDate) return false;
    // Consider visit "active" if created within the last 24 hours and no prescription yet
    const ageMs = now.getTime() - latestVisitDate.getTime();
    return ageMs < 24 * 60 * 60 * 1000 && !latestVisit?.prescription?.id;
  }, [latestVisit?.prescription?.id, latestVisitDate, now]);

  const hasPrescription = !!latestVisit?.prescription?.id;
  const hasUpcomingAppointment = !!nextAppointment?.id;

  const steps = useMemo(
    () => {
      const result: Array<{ key: string; label: string; icon: JSX.Element; status: StepStatus }> = [];

      // 1) Start Visit
      const startStatus: StepStatus = latestVisit?.id
        ? 'done'
        : hasUpcomingAppointment
        ? 'active'
        : 'pending';
      result.push({ key: 'start', label: 'Start', icon: <Calendar className="h-3.5 w-3.5" />, status: startStatus });

      // 2) Document
      const documentStatus: StepStatus = latestVisit?.id
        ? (hasActiveVisit ? 'active' : 'done')
        : 'pending';
      result.push({ key: 'document', label: 'Document', icon: <Stethoscope className="h-3.5 w-3.5" />, status: documentStatus });

      // 3) Complete
      const completedHeuristic = latestVisit?.id ? (!hasActiveVisit ? 'done' : 'pending') : 'pending';
      result.push({ key: 'complete', label: 'Complete', icon: <FileText className="h-3.5 w-3.5" />, status: completedHeuristic as StepStatus });

      // 4) Prescribe
      const prescribeStatus: StepStatus = latestVisit?.id
        ? (hasPrescription ? 'done' : 'active')
        : 'pending';
      result.push({ key: 'prescribe', label: 'Prescribe', icon: <Pill className="h-3.5 w-3.5" />, status: prescribeStatus });

      // 5) Billing
      const billingStatus: StepStatus = hasRecentInvoice ? 'done' : (hasPrescription ? 'active' : (latestVisit?.id ? 'pending' : 'pending'));
      result.push({ key: 'billing', label: 'Billing', icon: <Receipt className="h-3.5 w-3.5" />, status: billingStatus });

      return result;
    }, [hasActiveVisit, hasPrescription, hasRecentInvoice, hasUpcomingAppointment, latestVisit?.id]
  );

  const circleClass = (status: StepStatus) => {
    switch (status) {
      case 'done':
        return 'bg-emerald-500 text-white border-emerald-600';
      case 'active':
        return 'bg-blue-600 text-white border-blue-700 animate-pulse';
      default:
        return 'bg-gray-200 text-gray-500 border-gray-300';
    }
  };

  const lineClass = (left: StepStatus, right: StepStatus) => {
    const anyActive = left === 'active' || right === 'active';
    const anyDone = left === 'done' && right === 'done';
    return anyDone ? 'bg-emerald-300' : anyActive ? 'bg-blue-300' : 'bg-gray-200';
  };

  const StartAction = () => {
    if (latestVisit?.id) {
      return (
        <Link href={`/dashboard/visits?patientId=${encodeURIComponent(patientId)}`}>
          <Button variant="outline" size={compact ? 'sm' : 'default'}>Continue</Button>
        </Link>
      );
    }
    if (hasUpcomingAppointment) {
      return (
        <Link href={`/dashboard/visits?patientId=${encodeURIComponent(patientId)}&autoStart=true`}>
          <Button size={compact ? 'sm' : 'default'}>Start Visit</Button>
        </Link>
      );
    }
    return (
      <Link href={`/dashboard/appointments?patientId=${encodeURIComponent(patientId)}`}>
        <Button variant="outline" size={compact ? 'sm' : 'default'}>Book</Button>
      </Link>
    );
  };

  const PrescribeAction = () => {
    if (!latestVisit?.id) return null;
    return (
      <Link href={`/dashboard/visits?patientId=${encodeURIComponent(patientId)}`}>
        <Button variant="outline" size={compact ? 'sm' : 'default'}>{hasPrescription ? 'View' : 'Prescribe'}</Button>
      </Link>
    );
  };

  const BillingAction = () => {
    if (!latestVisit?.id) return null;
    return (
      <Link href={`/dashboard/pharmacy?patientId=${encodeURIComponent(patientId)}${latestVisit?.id ? `&visitId=${encodeURIComponent(latestVisit.id)}` : ''}`}>
        <Button variant="outline" size={compact ? 'sm' : 'default'}>{hasRecentInvoice ? 'Invoices' : 'Bill'}</Button>
      </Link>
    );
  };

  if (loading) {
    return (
      <div className={`w-full ${compact ? 'py-2' : 'py-3'}`}>
        <div className="h-2 w-full bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-red-600">{error}</div>
    );
  }

  return (
    <div className={`w-full ${compact ? 'py-2' : 'py-3'}`}>
      <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
        {steps.map((step, idx) => (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`h-7 w-7 rounded-full border flex items-center justify-center ${circleClass(step.status)}`}>
                {step.icon}
              </div>
              {!compact && (
                <div className="mt-1 text-[11px] text-gray-700">
                  {step.label}
                </div>
              )}
            </div>
            {idx < steps.length - 1 && (
              <div className={`mx-2 h-0.5 ${compact ? 'w-8' : 'w-12'} ${lineClass(step.status, steps[idx + 1].status)}`} />
            )}
          </div>
        ))}
      </div>

      {/* Minimal inline actions */}
      <div className={`mt-2 flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
        {hasUpcomingAppointment && !latestVisit?.id && (
          <Badge variant="secondary">Upcoming appt</Badge>
        )}
        <StartAction />
        <PrescribeAction />
        <BillingAction />
      </div>
    </div>
  );
}


