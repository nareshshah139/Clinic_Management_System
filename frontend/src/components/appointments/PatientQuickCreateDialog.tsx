'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { getErrorMessage, formatPatientName } from '@/lib/utils';
import type { Patient } from '@/lib/types';

interface PatientQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  initialPhone?: string;
  onPatientCreated: (patient: Patient) => void;
}

interface QuickCreateFormState {
  firstName: string;
  lastName: string;
  phone: string;
  dob: string;
  gender: string;
  email: string;
  abhaId: string;
}

function parseInitialValues(initialName?: string, initialPhone?: string): Partial<QuickCreateFormState> {
  const defaults: Partial<QuickCreateFormState> = {};

  if (initialName) {
    const [namePartRaw] = initialName.split('—');
    const namePart = namePartRaw?.trim() ?? '';
    if (namePart) {
      const nameBits = namePart.split(/\s+/).filter(Boolean);
      defaults.firstName = nameBits[0] ?? '';
      defaults.lastName = nameBits.slice(1).join(' ');
    }
  }

  const phoneCandidate = initialPhone || initialName?.split('—')[1];
  const numericPhone = phoneCandidate ? phoneCandidate.replace(/[^0-9+]/g, '') : '';
  if (numericPhone) {
    defaults.phone = numericPhone.startsWith('+') ? numericPhone : numericPhone.replace(/^0+/, '');
  }

  return defaults;
}

export default function PatientQuickCreateDialog({
  open,
  onOpenChange,
  initialName,
  initialPhone,
  onPatientCreated,
}: PatientQuickCreateDialogProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const defaults = useMemo(() => parseInitialValues(initialName, initialPhone), [initialName, initialPhone]);

  const [form, setForm] = useState<QuickCreateFormState>({
    firstName: defaults.firstName ?? '',
    lastName: defaults.lastName ?? '',
    phone: defaults.phone ?? '',
    dob: '',
    gender: 'OTHER',
    email: '',
    abhaId: '',
  });

  useEffect(() => {
    if (open) {
      setForm((prev) => ({
        ...prev,
        firstName: defaults.firstName ?? prev.firstName ?? '',
        lastName: defaults.lastName ?? prev.lastName ?? '',
        phone: defaults.phone ?? prev.phone ?? '',
      }));
      setErrors([]);
    } else {
      setForm({
        firstName: '',
        lastName: '',
        phone: '',
        dob: '',
        gender: 'OTHER',
        email: '',
        abhaId: '',
      });
    }
  }, [open, defaults]);

  const validate = (): string[] => {
    const validationErrors: string[] = [];
    if (!form.firstName.trim()) validationErrors.push('First name is required');
    if (!form.phone.trim()) validationErrors.push('Phone number is required');
    // Date of birth is now optional
    return validationErrors;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (validationErrors.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: validationErrors[0],
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: `${form.firstName} ${form.lastName}`.trim() || form.firstName,
        gender: form.gender,
        dob: form.dob || undefined,
        phone: form.phone,
        email: form.email || undefined,
        abhaId: form.abhaId || undefined,
      };

      const created = (await apiClient.createPatient(payload)) as Patient & { data?: Patient };
      const patient: Patient = {
        ...(created?.data ?? created),
        name: formatPatientName(created?.data ?? created),
        firstName: (created?.data ?? created)?.firstName || form.firstName,
        lastName: (created?.data ?? created)?.lastName || form.lastName,
      } as Patient;

      toast({
        variant: 'success',
        title: 'Patient created',
        description: `${formatPatientName(patient)} has been added`,
      });

      onPatientCreated(patient);
      onOpenChange(false);
    } catch (error) {
      const message = getErrorMessage(error) || 'Failed to create patient';
      toast({
        variant: 'destructive',
        title: 'Unable to create patient',
        description: message,
      });
      setErrors([message]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Patient</DialogTitle>
          <DialogDescription>
            Capture minimal details to create a patient record without leaving the scheduling flow.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.length > 0 && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errors[0]}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>First Name *</Label>
              <Input
                value={form.firstName}
                onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                placeholder="Patient first name"
                required
              />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input
                value={form.lastName}
                onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                placeholder="Patient last name"
              />
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input
                type="date"
                value={form.dob}
                onChange={(e) => setForm((prev) => ({ ...prev, dob: e.target.value }))}
              />
            </div>
            <div>
              <Label>Gender *</Label>
              <Select
                value={form.gender}
                onValueChange={(value: string) => setForm((prev) => ({ ...prev, gender: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Phone *</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="Phone number (e.g., +1234567890 or 9876543210)"
                required
              />
            </div>
            <div className="md:col-span-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div className="md:col-span-2">
              <Label>ABHA ID</Label>
              <Input
                value={form.abhaId}
                onChange={(e) => setForm((prev) => ({ ...prev, abhaId: e.target.value }))}
                placeholder="Optional - 14-digit ABHA number"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create Patient'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

