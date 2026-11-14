import { parseMetadataObject } from '@/lib/whatsapp-settings';

export interface ParsedEmailSettings {
  autoConfirm: boolean;
}

export function parseEmailSettings(metadata: unknown): ParsedEmailSettings {
  return { autoConfirm: parseMetadataObject(metadata).emailAutoConfirmAppointments !== false };
}
