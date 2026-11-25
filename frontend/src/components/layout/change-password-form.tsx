'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useDashboardUser } from './dashboard-user-context';

const MIN_LENGTH = 8;
const MAX_LENGTH = 20;
const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

function problemWith(form: typeof EMPTY): string {
  if (!form.currentPassword) return 'Enter your current password.';
  if (form.newPassword.length < MIN_LENGTH || form.newPassword.length > MAX_LENGTH) {
    return `The new password must be ${MIN_LENGTH} to ${MAX_LENGTH} characters.`;
  }
  if (form.newPassword === form.currentPassword) return 'Choose a password different from the current one.';
  if (form.newPassword !== form.confirmPassword) return 'The new password and its confirmation do not match.';
  return '';
}

export function ChangePasswordForm({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { user } = useDashboardUser();
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = Boolean(form.currentPassword || form.newPassword || form.confirmPassword);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const field = (key: keyof typeof EMPTY) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setError('');
      setForm((current) => ({ ...current, [key]: event.target.value }));
    },
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;
    const problem = problemWith(form);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.post(`/users/${encodeURIComponent(user.id)}/change-password`, form);
      setForm(EMPTY);
      toast({ variant: 'success', title: 'Password changed', description: 'Use the new password the next time you sign in.' });
    } catch (e) {
      setError(getErrorMessage(e) || 'Could not change the password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="border rounded-md p-3 space-y-3" aria-labelledby="change-password-heading">
      <h3 id="change-password-heading" className="font-medium">Change password</h3>
      <p id="change-password-help" className="text-sm text-muted-foreground">
        Use {MIN_LENGTH} to {MAX_LENGTH} characters.
      </p>
      <div className="space-y-1">
        <label htmlFor="current-password" className="text-sm">Current password</label>
        <Input id="current-password" type="password" autoComplete="current-password" disabled={saving} {...field('currentPassword')} />
      </div>
      <div className="space-y-1">
        <label htmlFor="new-password" className="text-sm">New password</label>
        <Input id="new-password" type="password" autoComplete="new-password" aria-describedby="change-password-help" disabled={saving} {...field('newPassword')} />
      </div>
      <div className="space-y-1">
        <label htmlFor="confirm-password" className="text-sm">Confirm new password</label>
        <Input id="confirm-password" type="password" autoComplete="new-password" disabled={saving} {...field('confirmPassword')} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}
      <Button type="submit" disabled={saving || !dirty}>
        {saving ? (
          <>
            <Spinner className="h-4 w-4 " />
            Changing…
          </>
        ) : (
          'Change password'
        )}
      </Button>
    </form>
  );
}
