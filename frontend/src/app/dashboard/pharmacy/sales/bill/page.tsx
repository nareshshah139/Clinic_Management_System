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
import { PageHeader } from '@/components/ui/page-header';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { PharmacyInvoiceBuilderFixed } from '@/components/pharmacy/PharmacyInvoiceBuilderFixed';
import { FinishedBillView } from '@/components/pharmacy/sales/FinishedBillView';
import { SALES_PATH } from '@/components/pharmacy/sales/sales-register-model';
import {
  PREFILL_KEYS,
  billHref,
  draftFromInvoice,
  prefillFrom,
  type BillPrefill,
  type SavedDraft,
  type SavedInvoice,
} from '@/components/pharmacy/sales/sales-bill-model';

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

const COUNTER_PATH = '/dashboard/pharmacy?section=counter';

function DraftBill({ id, onLeave }: { id: string; onLeave: () => void }) {
  const [reloadKey, setReloadKey] = useState(0);
  const load = useSavedDraft(id, reloadKey);

  if (load.status === 'loading') return <LoadingSkeleton variant="cards" label="Loading draft bill…" />;
  if (load.status === 'missing')
    return (
      <Card>
        <EmptyState
          title="This draft no longer exists"
          description="It was discarded, or the link is out of date. Nothing was sold from it."
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
          action={<Button onClick={() => setReloadKey((key) => key + 1)}>Try again</Button>}
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
    />
  );
}

/**
 * @cc [owner:nareshshah139,label:product] prescription-load-visible-draft
 * Opening the bill for a prescription MUST focus its bill, with nothing above it but the page header.
 * Opening another prescription MUST create a separate draft so medicines and billing details
 * from another patient cannot carry over.
 */
function NewBill({ prefill, onCreated, onLeave }: { prefill: BillPrefill | undefined; onCreated: (id: string) => void; onLeave: () => void }) {
  const router = useRouter();
  const billRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState<{ id: string; key: string } | null>(null);
  const prefillKey = PREFILL_KEYS.map((key) => prefill?.[key] ?? '').join('|');
  const key = saved && (!prefill || saved.key === prefillKey) ? saved.key : prefillKey;

  useEffect(() => {
    if (!prefill?.prescriptionId && !prefill?.visitId) return;
    const frame = requestAnimationFrame(() => billRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [prefill?.prescriptionId, prefill?.visitId]);

  return (
    <div ref={billRef} role="region" aria-label="Prescription bill" tabIndex={-1} className="min-w-0">
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
      />
    </div>
  );
}

type BillMode = 'finished' | 'draft' | 'new';

const BILL_PAGE: Record<BillMode, { title: string; back: { href: string; label: string } }> = {
  new: { title: 'New bill', back: { href: COUNTER_PATH, label: 'Back to Counter' } },
  draft: { title: 'Draft bill', back: { href: SALES_PATH, label: 'Back to Sales' } },
  finished: { title: 'Bill', back: { href: SALES_PATH, label: 'Back to Sales' } },
};

function SalesBillContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get('draft');
  const billId = searchParams.get('bill');
  const [created, setCreated] = useState<string | null>(null);
  const prefill = prefillFrom(searchParams);
  const mode: BillMode = billId ? 'finished' : draftId && draftId !== created ? 'draft' : 'new';
  const { title, back } = BILL_PAGE[mode];
  const leave = () => router.push(back.href);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <PageHeader
        title={title}
        className="items-center"
        actions={
          <Button asChild variant="outline" className="h-10 text-sm">
            <Link href={back.href}><ArrowLeft aria-hidden="true" /> {back.label}</Link>
          </Button>
        }
      />
      {mode === 'finished' ? (
        <FinishedBillView key={billId} id={billId!} startEditing={searchParams.get('edit') === 'discount'} />
      ) : mode === 'draft' ? (
        <DraftBill key={draftId} id={draftId!} onLeave={leave} />
      ) : (
        <NewBill prefill={draftId ? undefined : prefill} onCreated={setCreated} onLeave={leave} />
      )}
    </div>
  );
}

export default function SalesBillPage() {
  return (
    <Suspense fallback={<LoadingSkeleton label="Loading bill…" />}>
      <SalesBillContent />
    </Suspense>
  );
}
