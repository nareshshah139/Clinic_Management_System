import type { LucideIcon } from 'lucide-react';
import { BedSingle, DoorOpen, FlaskConical, Hourglass, Pill, ScanLine, Scissors, Siren, Stethoscope, Syringe, Video } from 'lucide-react';

const ROOM_TYPE_ICONS: Record<string, LucideIcon> = {
  Consultation: Stethoscope,
  Procedure: Syringe,
  Operation: Scissors,
  Telemed: Video,
  Telemedicine: Video,
  Emergency: Siren,
  Recovery: BedSingle,
  Waiting: Hourglass,
  Laboratory: FlaskConical,
  Imaging: ScanLine,
  Pharmacy: Pill,
};

export function RoomTypeIcon({ type, className = 'size-4' }: { type: string; className?: string }) {
  const Icon = ROOM_TYPE_ICONS[type] ?? DoorOpen;
  return <Icon aria-hidden="true" className={className} />;
}
