'use client';

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { displayClinicDateTime } from '@/lib/date-display';

type Step = { kind: 'confirm' } | { kind: 'issuing' } | { kind: 'issued'; code: string; expiresAt: string } | { kind: 'error'; message: string };

/** Lets a manager give a locked-out staff member a one-time reset code in person. */
export function ResetCodeButton({ user }: { user: { id: string; firstName: string; lastName: string } }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'confirm' });
  const name = `${user.firstName} ${user.lastName}`.trim();

  const issue = async () => {
    setStep({ kind: 'issuing' });
    try {
      const { code, expiresAt } = await apiClient.issueResetCode(user.id);
      setStep({ kind: 'issued', code, expiresAt });
    } catch (e) {
      setStep({ kind: 'error', message: getErrorMessage(e) || 'Could not create a reset code.' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { setOpen(next); if (!next) setStep({ kind: 'confirm' }); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><KeyRound className="h-3 w-3 mr-1" /> Reset password</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Reset password for {name}</DialogTitle></DialogHeader>
        {step.kind === 'issued' ? (
          <div className="space-y-3 text-sm text-gray-700">
            <p>Give this code to {name} in person. It works once and expires {displayClinicDateTime(step.expiresAt)}.</p>
            <p className="rounded-md border bg-gray-50 py-3 text-center font-mono text-2xl tracking-widest" aria-label="Reset code">{step.code}</p>
            <p>They open the sign-in page, choose <strong>enter your reset code</strong>, type the code and pick a new password. You won&apos;t see their new password.</p>
            <p className="text-xs text-gray-500">This code is shown only once. Closing this window does not cancel it; issuing another code does.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(step.code)}>Copy code</Button>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-gray-700">
            <p>Only issue a code to {name} after confirming in person that they are asking. Anyone with the code can set this account&apos;s password.</p>
            <p>Issuing a code cancels any earlier code for them. It is recorded in the audit log.</p>
            {step.kind === 'error' && <p role="alert" className="text-red-700">{step.message}</p>}
            <Button type="button" disabled={step.kind === 'issuing'} onClick={() => void issue()}>
              {step.kind === 'issuing' ? 'Creating code…' : 'I have confirmed who is asking. Create code'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
