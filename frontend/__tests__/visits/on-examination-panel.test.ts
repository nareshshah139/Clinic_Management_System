import {
  initialPanelState,
  panelReducer,
  preferenceKey,
  readPreference,
} from '@/components/visits/on-examination-panel';

describe('on examination panel state', () => {
  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])('starts open=%s preference with data=%s as open=%s', (preference, hasData, expected) => {
    expect(initialPanelState(preference, hasData)).toEqual({ open: expected, userChose: false });
  });

  it('opens when examination data arrives and the user has not chosen', () => {
    expect(panelReducer({ open: false, userChose: false }, { type: 'examinationFilled' })).toEqual({
      open: true,
      userChose: false,
    });
  });

  it('keeps the panel closed when the user collapsed it themselves', () => {
    const closed = { open: false, userChose: true };
    expect(panelReducer(closed, { type: 'examinationFilled' })).toBe(closed);
  });

  it('toggle flips the panel and records the choice', () => {
    expect(panelReducer({ open: false, userChose: false }, { type: 'toggle' })).toEqual({ open: true, userChose: true });
    expect(panelReducer({ open: true, userChose: true }, { type: 'toggle' })).toEqual({ open: false, userChose: true });
  });

  it('never closes on its own once open', () => {
    const open = { open: true, userChose: false };
    expect(panelReducer(open, { type: 'examinationFilled' })).toBe(open);
  });

  it('reads the preference per doctor and defaults to closed', () => {
    localStorage.clear();
    localStorage.setItem('cms.ui.onExamination.open.doc-1', 'true');
    expect(preferenceKey('doc-1')).toBe('cms.ui.onExamination.open.doc-1');
    expect(readPreference('doc-1')).toBe(true);
    expect(readPreference('doc-2')).toBe(false);
  });

  it('treats unavailable storage as closed', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readPreference('doc-1')).toBe(false);
    spy.mockRestore();
  });
});
