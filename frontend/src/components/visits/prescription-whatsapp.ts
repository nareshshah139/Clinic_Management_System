import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';

/** The server can send WhatsApp itself when the clinic linked its number or a server-wide number is set. */
export async function canSendWhatsAppDirectly(): Promise<boolean> {
  try {
    const connection = await apiClient.getWhatsAppConnection();
    return connection.linked || connection.fallback === 'SERVER_ENV';
  } catch {
    return false;
  }
}

export function useWhatsAppDirect(enabled: boolean): boolean | null {
  const [direct, setDirect] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void canSendWhatsAppDirectly().then((value) => live && setDirect(value));
    return () => {
      live = false;
    };
  }, [enabled]);
  return direct;
}

export const WHATSAPP_LINK_HINT = 'An admin can link the clinic WhatsApp in Clinic profile to send prescriptions directly.';

export type DirectShareOutcome = { title: string; description: string; ok: boolean };

/** Sends the exact preview PDF from the clinic number and describes what WhatsApp answered. */
export async function sendPrescriptionPdfDirectly(prescriptionId: string, file: File, phone: string): Promise<DirectShareOutcome> {
  try {
    const sent = await apiClient.sharePrescriptionPreview(prescriptionId, file, { channel: 'WHATSAPP', to: phone, message: 'Your prescription is attached.' });
    return { ok: true, title: 'Sent on WhatsApp', description: `WhatsApp accepted the prescription for ${phone}. Message ID ${sent.wamid}.` };
  } catch (error) {
    return { ok: false, title: 'WhatsApp not sent', description: getErrorMessage(error) };
  }
}
