'use client';

import { useEffect, useState } from 'react';
import { UserCog } from 'lucide-react';
import { UserRole } from '@cms/shared-types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { LoadingSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { enumLabel } from '@/lib/labels';
import { getErrorMessage } from '@/lib/utils';
import { GRANTABLE_RECORD_ROLES } from './procedure-access';

type Granted = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; roles: string[] };

export function ProcedureAccessDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [granted, setGranted] = useState<Granted>({ status: 'loading' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let current = true;
    setGranted({ status: 'loading' });
    apiClient.getProcedureAccess()
      .then(({ recordRoles }) => {
        if (current) setGranted({ status: 'ready', roles: GRANTABLE_RECORD_ROLES.filter((role) => recordRoles.includes(role)) });
      })
      .catch((error) => {
        if (current) setGranted({ status: 'error', message: getErrorMessage(error) });
      });
    return () => { current = false; };
  }, [open]);

  const toggle = (role: string, on: boolean) =>
    setGranted((prev) => prev.status !== 'ready' ? prev : {
      status: 'ready',
      roles: GRANTABLE_RECORD_ROLES.filter((r) => (r === role ? on : prev.roles.includes(r))),
    });

  const save = async () => {
    if (granted.status !== 'ready') return;
    setSaving(true);
    try {
      await apiClient.updateProcedureAccess({ recordRoles: granted.roles });
      toast({ variant: 'success', title: 'Saved who can record procedures' });
      setOpen(false);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not save who can record procedures', description: getErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserCog className="h-4 w-4" aria-hidden="true" />
        Who can record
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Who can record procedures</DialogTitle>
            <DialogDescription>Owners, admins and doctors can always record procedures. Choose who else can.</DialogDescription>
          </DialogHeader>
          {granted.status === 'loading' && <LoadingSkeleton label="Loading who can record…" />}
          {granted.status === 'error' && (
            <Alert variant="destructive">
              <AlertDescription>{granted.message}</AlertDescription>
            </Alert>
          )}
          {granted.status === 'ready' && (
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <Checkbox id="procedure-access-DOCTOR" checked disabled />
                <Label htmlFor="procedure-access-DOCTOR" className="font-normal">{enumLabel('role', UserRole.DOCTOR)}</Label>
                <span className="text-xs text-muted-foreground">Always</span>
              </li>
              {GRANTABLE_RECORD_ROLES.map((role) => (
                <li key={role} className="flex items-center gap-3">
                  <Checkbox
                    id={`procedure-access-${role}`}
                    checked={granted.roles.includes(role)}
                    onCheckedChange={(checked: boolean | 'indeterminate') => toggle(role, checked === true)}
                  />
                  <Label htmlFor={`procedure-access-${role}`} className="font-normal">{enumLabel('role', role)}</Label>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={granted.status !== 'ready' || saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
