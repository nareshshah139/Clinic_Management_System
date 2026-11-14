'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';

interface EmailSettingsSectionProps {
  autoConfirm: boolean;
  onAutoConfirmChange: (value: boolean) => void;
  description: string;
  allowTest?: boolean;
}

export function EmailSettingsSection({ autoConfirm, onAutoConfirmChange, description, allowTest }: EmailSettingsSectionProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<{ configured: boolean; from: string | null } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await apiClient.getEmailStatus();
        if (!cancelled) setStatus(next);
      } catch {
        if (!cancelled) setStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendTest = async () => {
    try {
      setTesting(true);
      const result = await apiClient.sendTestEmail();
      toast({ variant: 'success', title: 'Test email sent', description: `Check the inbox of ${result.to}.` });
    } catch (error) {
      toast({ variant: 'warning', title: 'Test email failed', description: getErrorMessage(error) || 'Could not send the test email.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Email patients on appointment creation</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <Switch aria-label="Email patients on appointment creation" checked={autoConfirm} onCheckedChange={onAutoConfirmChange} />
      </div>
      {status && (
        <div className="text-xs text-muted-foreground">
          {status.configured ? `Sending from ${status.from}` : "Email isn't set up on the server yet. Ask an admin to configure SMTP."}
        </div>
      )}
      {allowTest && (
        <Button size="sm" variant="outline" onClick={() => void sendTest()} disabled={testing || status?.configured === false}>
          {testing ? <Spinner className="h-4 w-4" /> : null}
          Send test email
        </Button>
      )}
    </div>
  );
}
