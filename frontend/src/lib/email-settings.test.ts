import { parseEmailSettings } from './email-settings';

describe('parseEmailSettings', () => {
  it('defaults to on when the key is absent, metadata is empty, or metadata is malformed', () => {
    expect(parseEmailSettings({})).toEqual({ autoConfirm: true });
    expect(parseEmailSettings(null)).toEqual({ autoConfirm: true });
    expect(parseEmailSettings('{not json')).toEqual({ autoConfirm: true });
  });

  it('is off only for an explicit false, in object or JSON string metadata', () => {
    expect(parseEmailSettings({ emailAutoConfirmAppointments: false })).toEqual({ autoConfirm: false });
    expect(parseEmailSettings('{"emailAutoConfirmAppointments":false}')).toEqual({ autoConfirm: false });
  });

  it('stays on for an explicit true', () => {
    expect(parseEmailSettings({ emailAutoConfirmAppointments: true })).toEqual({ autoConfirm: true });
  });
});
