import { UserRole } from '@prisma/client';
import { VOICE_ROUTES, VOICE_STATUS_ROUTE } from '@cms/shared-types/voice';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../shared/decorators/permissions.decorator';
import { AppointmentsController } from '../appointments/appointments.controller';
import { DrugController } from '../pharmacy/drug.controller';
import { VisitsController } from '../visits/visits.controller';
import { VoiceController, voiceUserTracker } from './voice.controller';

const meta = (key: string, target: unknown) => Reflect.getMetadata(key, target as object);
const proto = VoiceController.prototype as any;

describe('VoiceController', () => {
  describe('same door as the form write', () => {
    const cases: Array<[string, any, any]> = [
      ['visitNote', proto.visitNote, (VisitsController.prototype as any).update],
      ['appointment', proto.appointment, (AppointmentsController.prototype as any).create],
      ['stockCount', proto.stockCount, (DrugController.prototype as any).createInventoryChangeRequests],
    ];
    it.each(cases)('%s has the roles and permissions of its write', (_name, handler, write) => {
      expect(typeof handler).toBe('function');
      expect(typeof write).toBe('function');
      expect(meta(ROLES_KEY, handler)).toBeDefined();
      expect(meta(ROLES_KEY, handler)).toEqual(meta(ROLES_KEY, write));
      expect(meta(PERMISSIONS_KEY, handler)).toEqual(meta(PERMISSIONS_KEY, write));
    });
  });

  it('status refuses PATIENT', () => {
    const roles: UserRole[] | undefined = meta(ROLES_KEY, proto.status);
    expect(Array.isArray(roles)).toBe(true);
    expect(roles).not.toContain(UserRole.PATIENT);
  });

  describe('throttle', () => {
    it.each(['visitNote', 'appointment', 'stockCount'])('%s allows 20 per 60 seconds per user', (name) => {
      const handler = proto[name];
      expect(meta('THROTTLER:LIMITdefault', handler)).toBe(20);
      expect(meta('THROTTLER:TTLdefault', handler)).toBe(60000);
      const tracker = meta('THROTTLER:TRACKERdefault', handler);
      expect(tracker({ user: { id: 'u1' }, ip: '1.2.3.4' })).toBe('user:u1');
    });

    it('falls back to the ip without a user', () => {
      expect(voiceUserTracker({ ip: '1.2.3.4' })).toBe('ip:1.2.3.4');
    });

    it('status has no throttle override', () => {
      expect(meta('THROTTLER:LIMITdefault', proto.status)).toBeUndefined();
      expect(meta('THROTTLER:TTLdefault', proto.status)).toBeUndefined();
    });
  });

  it('serves the routes the wire file names', () => {
    expect(meta('path', proto.status)).toBe(VOICE_STATUS_ROUTE.replace('voice/', ''));
    expect(meta('path', proto.visitNote)).toBe(VOICE_ROUTES['visit-note'].replace('voice/', ''));
    expect(meta('path', proto.appointment)).toBe(VOICE_ROUTES['book-appointment'].replace('voice/', ''));
    expect(meta('path', proto.stockCount)).toBe(VOICE_ROUTES['stock-count'].replace('voice/', ''));
    expect(meta('path', VoiceController)).toBe('voice');
  });
});
