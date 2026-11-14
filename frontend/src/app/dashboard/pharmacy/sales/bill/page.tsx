'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { isIssuedBillNumber } from '@/lib/bill-number';
import { getErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { PharmacyInvoiceBuilderFixed } from '@/components/pharmacy/PharmacyInvoiceBuilderFixed';
import { PrescriptionDispensingQueue } from '@/components/pharmacy/PrescriptionDispensingQueue';
import { SalesHeader } from '@/components/pharmacy/sales/SalesHeader';
import { FinishedBillView } from '@/components/pharmacy/sales/FinishedBillView';
import { SALES_PATH, salesTabHref, type Register } from '@/components/pharmacy/sales/sales-register-model';
import {
  PREFILL_KEYS,
  billHref,
  draftFromInvoice,
  prefillFrom,
  type BillPrefill,
  type SavedDraft,
  type SavedInvoice,
} from '@/components/pharmacy/sales/sales-bill-model';

const COUNTER_PATH = '/dashboard/pharmacy?section=counter';

type DraftLoad =
  | { status: 'loading' }
  | { status: 'ready'; draft: SavedDraft }
  | { status: 'finished'; number: string; id: string }
  | { status: 'missing' }
  | { status: 'error'; message: string };

function useSavedDraft(id: string, reloadKey: number): DraftLoad {
  const [load, setLoad] = useState<DraftLoad>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    apiClient.get<SavedInvoice>(`/pharmacy/invoices/${encodeURIComponent(id)}`).then(
      (invoice) => {
        if (!live) return;
        setLoad(invoice.status === 'DRAFT' ? { status: 'ready', draft: draftFromInvoice(invoice) } : { status: 'finished', number: invoice.invoiceNumber, id: invoice.id });
      },
      (error) => {
        if (!live) return;
        setLoad((error as { status?: number })?.status === 404 ? { status: 'missing' } : { status: 'error', message: getErrorMessage(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [id, reloadKey]);
  return load;
}

type Finished = (bill: { id: string; fromPrescription: boolean }) => void;

function DraftBill({ id, onLeave, onFinished }: { id: string; onLeave: () => void; onFinished: Finished }) {
  const [reloadKey, setReloadKey] = useState(0);
  const load = useSavedDraft(id, reloadKey);
  const back = <Button asChild variant="outline"><Link href={SALES_PATH}>Back to Sales</Link></Button>;

  if (load.status === 'loading') return <LoadingSkeleton variant="cards" label="Loading draft bill…" />;
  if (load.status === 'missing')
    return (
      <Card>
        <EmptyState
          title="This draft no longer exists"
          description="It was discarded, or the link is out of date. Nothing was sold from it."
          action={<div className="flex flex-wrap justify-center gap-2">{back}<Button asChild><Link href={billHref()}>New sale</Link></Button></div>}
        />
      </Card>
    );
  if (load.status === 'finished')
    return (
      <FinishedBillView
        id={load.id}
        notice={
          isIssuedBillNumber(load.number)
            ? `This draft was finished as bill ${load.number}, so it can no longer be edited as a draft.`
            : 'This draft was cancelled before it was finished, so it never became a bill and has no bill number.'
        }
      />
    );
  if (load.status === 'error')
    return (
      <Card>
        <EmptyState
          title="Could not open the draft"
          description={`${load.message}. Check your connection and try again.`}
          action={<div className="flex flex-wrap justify-center gap-2">{back}<Button onClick={() => setReloadKey((key) => key + 1)}>Try again</Button></div>}
        />
      </Card>
    );
  return (
    <PharmacyInvoiceBuilderFixed
      key={`${id}:${reloadKey}`}
      draft={load.draft}
      onDiscarded={onLeave}
      onReloadDraft={() => setReloadKey((key) => key + 1)}
      onDone={onLeave}
      onFinished={onFinished}
    />
  );
}

/**
 * @cc [owner:nareshshah139,label:product] prescription-load-visible-draft
 * Loading a prescription MUST bring its bill into view. Switching prescriptions MUST
 * create a separate draft so medicines and billing details from another patient cannot carry over.
 */
function NewBill({ prefill, onCreated, onLeave, onFinished }: { prefill: BillPrefill | undefined; onCreated: (id: string) => void; onLeave: () => void; onFinished: Finished }) {
  const router = useRouter();
  const billRef = useRef<HTMLDivElement>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saved, setSaved] = useState<{ id: string; key: string } | null>(null);
  const prefillKey = PREFILL_KEYS.map((key) => prefill?.[key] ?? '').join('|');
  const key = saved?.key ?? `${prefillKey}:${loadAttempt}`;

  useEffect(() => {
    if (!prefill?.prescriptionId && !prefill?.visitId) return;
    const frame = requestAnimationFrame(() => {
      billRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      billRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [prefill?.prescriptionId, prefill?.visitId, loadAttempt]);

  return (
    <section className="min-w-0 space-y-3">
      <div ref={billRef} role="region" aria-label="Prescription bill" tabIndex={-1} className="scroll-mt-4">
        <PharmacyInvoiceBuilderFixed
          key={key}
          prefill={prefill}
          onDraftSaved={(session) => {
            if (saved?.id === session.id) return;
            setSaved({ id: session.id, key });
            onCreated(session.id);
            router.replace(billHref({ draft: session.id }), { scroll: false });
          }}
          onDiscarded={onLeave}
          onDone={onLeave}
          onFinished={onFinished}
        />
      </div>
      <PrescriptionDispensingQueue
        onOpenBilling={(selected) => {
          setSaved(null);
          setLoadAttempt((attempt) => attempt + 1);
          router.push(billHref({ prefill: selected }), { scroll: false });
        }}
        openActionLabel="Load"
      />
    </section>
  );
}

function SalesBillContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draft');
  const billId = searchParams.get('bill');
  const [created, setCreated] = useState<string | null>(null);
  const prefill = prefillFrom(searchParams);
  const leave = () => router.push(SALES_PATH);
  const finished: Finished = ({ id, fromPrescription }) => router.push(billHref({ bill: id, next: fromPrescription ? 'prescriptions' : 'sale' }));
  const next = searchParams.get('next');

  return (
    <Tabs value="sales" onValueChange={(value: string) => router.push(salesTabHref(value as Register))}>
      <div className="flex min-w-0 flex-col gap-3">
        <SalesHeader
          action={
            <Button asChild variant="outline" className="h-10 text-sm">
              <Link href={SALES_PATH}><ArrowLeft aria-hidden="true" /> Back to Sales</Link>
            </Button>
          }
        />
        {billId ? (
          <FinishedBillView
            key={billId}
            id={billId}
            startEditing={searchParams.get('edit') === 'discount'}
            nextStep={
              next === 'prescriptions' ? (
                <Button asChild><Link href={COUNTER_PATH}>Prescriptions waiting</Link></Button>
              ) : next === 'sale' ? (
                <Button asChild><Link href={billHref()}>New sale</Link></Button>
              ) : undefined
            }
          />
        ) : draftId && draftId !== created ? (
          <DraftBill key={draftId} id={draftId} onLeave={leave} onFinished={finished} />
        ) : (
          <NewBill prefill={draftId ? undefined : prefill} onCreated={setCreated} onLeave={leave} onFinished={finished} />
        )}
      </div>
    </Tabs>
  );
}

export default function SalesBillPage() {
  return (
    <Suspense fallback={<LoadingSkeleton label="Loading bill…" />}>
      <SalesBillContent />
    </Suspense>
  );
}
