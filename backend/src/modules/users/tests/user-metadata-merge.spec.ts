import { mergeMetadata } from '../users.service';

describe('mergeMetadata', () => {
  const stored = JSON.stringify({ rxPrintProfile: { margins: { topPx: 300 } }, workingHours: { startHour: 10 }, whatsappAutoConfirmAppointments: true });

  it('keeps settings saved by other screens', () => {
    expect(mergeMetadata(stored, { whatsappAutoConfirmAppointments: false })).toEqual({
      rxPrintProfile: { margins: { topPx: 300 } }, workingHours: { startHour: 10 }, whatsappAutoConfirmAppointments: false,
    });
  });

  it('replaces a whole key rather than deep-merging it', () => {
    expect(mergeMetadata(stored, { rxPrintProfile: { margins: { topPx: 200 } } }).rxPrintProfile).toEqual({ margins: { topPx: 200 } });
  });

  it('removes keys sent as null', () => {
    expect(mergeMetadata(stored, { workingHours: null })).not.toHaveProperty('workingHours');
  });

  it.each([null, '', 'not json', '[1,2]', '"text"'])('starts from empty settings when stored value is %p', (value) => {
    expect(mergeMetadata(value, { a: 1 })).toEqual({ a: 1 });
  });
});
