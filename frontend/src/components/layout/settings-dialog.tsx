'use client';

import { useCallback, useMemo, useState } from 'react';
import { UserRole } from '@cms/shared-types';
import dynamic from 'next/dynamic';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useDashboardUser } from './dashboard-user-context';
import { ColourThemeSetting } from './colour-theme-setting';
import { WhatsAppSettingsForm } from './whatsapp-settings-form';
import { ClinicDetailsForm } from './clinic-details-form';
import { ChangePasswordForm } from './change-password-form';

const DoctorSignatureSettings = dynamic(() => import('@/components/users/DoctorSignatureSettings').then((m) => m.DoctorSignatureSettings), { ssr: false });
const DoctorLetterheadSettings = dynamic(() => import('@/components/users/DoctorLetterheadSettings').then((m) => m.DoctorLetterheadSettings), { ssr: false });
const DoctorAvailabilitySettings = dynamic(() => import('@/components/users/DoctorAvailabilitySettings').then((m) => m.DoctorAvailabilitySettings), { ssr: false });

type SectionId = 'appearance' | 'clinic' | 'signature' | 'availability' | 'whatsapp' | 'password';

const SECTION_LABELS: Record<SectionId, string> = {
  appearance: 'Appearance',
  clinic: 'Clinic',
  signature: 'Signature & letterhead',
  availability: 'Availability',
  whatsapp: 'WhatsApp',
  password: 'Password',
};

const DOCTOR_SECTIONS: SectionId[] = ['appearance', 'signature', 'availability', 'whatsapp', 'password'];
const STAFF_SECTIONS: SectionId[] = ['appearance', 'password'];
const CLINIC_ADMIN_SECTIONS: SectionId[] = ['appearance', 'clinic', 'password'];

function listOf(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
}

export function SettingsDialog() {
  const { user } = useDashboardUser();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionId>('appearance');
  const [unsaved, setUnsaved] = useState<Partial<Record<SectionId, boolean>>>({});
  const [confirm, confirmDialog] = useConfirm();

  const role = String(user?.role || '').toUpperCase();
  const isDoctor = role === UserRole.DOCTOR;
  const isClinicAdmin = role === UserRole.OWNER || role === UserRole.ADMIN;
  const sections = isDoctor ? DOCTOR_SECTIONS : isClinicAdmin ? CLINIC_ADMIN_SECTIONS : STAFF_SECTIONS;

  const track = useMemo(() => {
    const setter = (id: SectionId) => (dirty: boolean) =>
      setUnsaved((current) => (Boolean(current[id]) === dirty ? current : { ...current, [id]: dirty }));
    return { clinic: setter('clinic'), availability: setter('availability'), whatsapp: setter('whatsapp'), password: setter('password') };
  }, []);

  const requestClose = useCallback(async () => {
    const pending = sections.filter((id) => unsaved[id]).map((id) => SECTION_LABELS[id]);
    if (pending.length > 0) {
      const discard = await confirm({
        title: 'Discard unsaved changes?',
        description: `${listOf(pending)} ${pending.length > 1 ? 'have' : 'has'} changes you have not saved. Closing settings loses them.`,
        confirmLabel: 'Discard changes',
        destructive: true,
      });
      if (!discard) return;
    }
    setOpen(false);
    setUnsaved({});
    setSection('appearance');
  }, [confirm, sections, unsaved]);

  return (
    <>
      <Dialog open={open} onOpenChange={(next: boolean) => (next ? setOpen(true) : void requestClose())}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open settings"><Settings className="h-5 w-5" /></Button>
        </DialogTrigger>
        <DialogContent className="p-4 sm:max-w-[560px] sm:p-6 max-h-[90dvh] overflow-y-auto" aria-describedby="my-settings-description">
          <DialogHeader>
            <DialogTitle>My Settings</DialogTitle>
            <DialogDescription id="my-settings-description" className="sr-only">
              Change how Linaé looks for you, your clinic's printed details, your doctor profile, WhatsApp messages and your password.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={section} onValueChange={(next: string) => setSection(next as SectionId)} className="min-w-0">
            <TabsList aria-label="Settings sections" className="w-full">
              {sections.map((id) => (
                <TabsTrigger key={id} value={id}>
                  {SECTION_LABELS[id]}
                  {unsaved[id] && (
                    <>
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-warning-text" />
                      <span className="sr-only">(unsaved changes)</span>
                    </>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="appearance" forceMount>
              <ColourThemeSetting />
            </TabsContent>
            {isClinicAdmin && (
              <TabsContent value="clinic" forceMount>
                <ClinicDetailsForm onDirtyChange={track.clinic} />
              </TabsContent>
            )}
            {isDoctor && user?.id && (
              <>
                <TabsContent value="signature" forceMount className="space-y-4">
                  <DoctorSignatureSettings doctorId={user.id} />
                  <DoctorLetterheadSettings doctorId={user.id} />
                </TabsContent>
                <TabsContent value="availability" forceMount>
                  <DoctorAvailabilitySettings doctorId={user.id} onDirtyChange={track.availability} />
                </TabsContent>
                <TabsContent value="whatsapp" forceMount>
                  <WhatsAppSettingsForm onDirtyChange={track.whatsapp} />
                </TabsContent>
              </>
            )}
            <TabsContent value="password" forceMount>
              <ChangePasswordForm onDirtyChange={track.password} />
            </TabsContent>
          </Tabs>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => void requestClose()}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
