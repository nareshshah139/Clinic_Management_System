"use client";

import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { downloadClinicReceipt, printClinicReceipt } from './clinic-receipt';

type ReceiptJob = 'print' | 'download';

/** Prints or saves the receipt as the server has the bill now, so it always carries the latest payments. */
export function useClinicReceipt() {
  const [busy, setBusy] = useState<ReceiptJob | null>(null);
  const run = async (job: ReceiptJob, invoiceId: string) => {
    setBusy(job);
    try {
      const receipt = await apiClient.getClinicReceipt(invoiceId);
      await (job === 'print' ? printClinicReceipt(receipt) : downloadClinicReceipt(receipt));
    } catch (error) {
      toast({
        variant: 'destructive',
        title: job === 'print' ? 'Could not print the receipt' : 'Could not download the receipt',
        description: getErrorMessage(error),
      });
    } finally {
      setBusy(null);
    }
  };
  return { busy, print: (invoiceId: string) => run('print', invoiceId), download: (invoiceId: string) => run('download', invoiceId) };
}

export function ReceiptButtons({ invoiceId, billNo }: { invoiceId: string; billNo: string }) {
  const { busy, print, download } = useClinicReceipt();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" className="h-9" disabled={busy !== null} onClick={() => void print(invoiceId)} aria-label={`Print receipt ${billNo}`}>
        <Printer aria-hidden="true" /> {busy === 'print' ? 'Preparing…' : 'Print receipt'}
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-9" disabled={busy !== null} onClick={() => void download(invoiceId)} aria-label={`Download PDF ${billNo}`}>
        <Download aria-hidden="true" /> {busy === 'download' ? 'Preparing…' : 'Download PDF'}
      </Button>
    </div>
  );
}
