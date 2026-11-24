'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';

export type PreferredLanguage = 'EN' | 'TE' | 'HI';
export type WhatsAppConsentState = 'NOT_ASKED' | 'PENDING' | 'OPTED_IN' | 'OPTED_OUT';

export const PREFERRED_LANGUAGES: { value: PreferredLanguage; label: string }[] = [
  { value: 'EN', label: 'English' },
  { value: 'TE', label: 'Telugu' },
  { value: 'HI', label: 'Hindi' },
];

const CONSENT_LABEL: Record<WhatsAppConsentState, string> = {
  NOT_ASKED: 'Not asked',
  PENDING: 'Waiting for the number to confirm',
  OPTED_IN: 'Agreed and confirmed',
  OPTED_OUT: 'Opted out',
};

export type PortalProfile = {
  phoneE164: string | null;
  consentState: WhatsAppConsentState;
  preferredLanguage: PreferredLanguage;
  portalEnabled: boolean;
  consentRecordedAt?: string | null;
};

const DEFAULT_PROFILE: PortalProfile = { phoneE164: null, consentState: 'NOT_ASKED', preferredLanguage: 'EN', portalEnabled: true };

export function PatientWhatsAppCard({ patientId, profile: initial, phone }: { patientId: string; profile?: PortalProfile | null; phone?: string }) {
  const [profile, setProfile] = useState<PortalProfile>(initial ?? DEFAULT_PROFILE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const next = (await action()) as Partial<PortalProfile>;
      setProfile((prev) => ({ ...prev, ...next }));
    } catch (e: any) {
      setError(e?.message || 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const usable = Boolean(profile.phoneE164);
  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp and patient portal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!usable && (
          <p role="alert" className="text-destructive">
            The phone number {phone ? `"${phone}" ` : ''}cannot be used for WhatsApp. Edit the patient and enter a 10-digit mobile number or a number with its country code.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">WhatsApp number:</span>
          <span className="text-foreground">{profile.phoneE164 || '—'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Consent:</span>
          <Badge variant="outline" data-testid="whatsapp-consent-state">{CONSENT_LABEL[profile.consentState]}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || !usable || profile.consentState === 'PENDING' || profile.consentState === 'OPTED_IN'}
            onClick={() => run(() => apiClient.recordWhatsAppConsent(patientId, 'agreed'))}>
            Patient agreed to WhatsApp
          </Button>
          <Button size="sm" variant="outline" disabled={busy || profile.consentState === 'OPTED_OUT'}
            onClick={() => run(() => apiClient.recordWhatsAppConsent(patientId, 'refused'))}>
            Patient refused
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="whatsapp-language" className="text-muted-foreground">Preferred language:</label>
          <NativeSelect id="whatsapp-language" className="w-40" value={profile.preferredLanguage} disabled={busy}
            onChange={(e) => {
              const preferredLanguage = e.target.value as PreferredLanguage;
              void run(async () => {
                await apiClient.updatePatient(patientId, { preferredLanguage });
                return { preferredLanguage };
              });
            }}>
            {PREFERRED_LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Portal and automated messages:</span>
          <span data-testid="portal-enabled-state">{profile.portalEnabled ? 'On' : 'Off'}</span>
          <Button size="sm" variant="outline" disabled={busy}
            onClick={() => run(() => apiClient.setPatientPortalEnabled(patientId, !profile.portalEnabled))}>
            {profile.portalEnabled ? 'Turn off for this patient' : 'Turn on for this patient'}
          </Button>
        </div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
