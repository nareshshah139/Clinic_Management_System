import { historyReducer, initialHistory, moveBox, nextZoom, previousZoom, resizeBox, type Redaction } from '@/components/issue-report/redaction';

const size = { w: 1000, h: 500 };
const box: Redaction = { id: 'a', tool: 'hide', x: 100, y: 100, w: 200, h: 100 };
const other: Redaction = { id: 'b', tool: 'highlight', x: 0, y: 0, w: 10, h: 10 };

describe('moveBox', () => {
  it('moves in image pixels and stops at the image edge', () => {
    expect(moveBox(box, 20, -30, size)).toMatchObject({ x: 120, y: 70 });
    expect(moveBox(box, 5000, 5000, size)).toMatchObject({ x: 800, y: 400 });
    expect(moveBox(box, -5000, -5000, size)).toMatchObject({ x: 0, y: 0 });
  });
});

describe('resizeBox', () => {
  it('drags a corner while the opposite corner stays put', () => {
    expect(resizeBox(box, 'se', 50, 25, size)).toMatchObject({ x: 100, y: 100, w: 250, h: 125 });
    expect(resizeBox(box, 'nw', 50, 25, size)).toMatchObject({ x: 150, y: 125, w: 150, h: 75 });
  });

  it('never collapses below the minimum or leaves the image', () => {
    expect(resizeBox(box, 'se', -5000, -5000, size)).toMatchObject({ w: 4, h: 4 });
    expect(resizeBox(box, 'se', 5000, 5000, size)).toMatchObject({ w: 900, h: 400 });
  });
});

describe('history', () => {
  it('undoes and redoes commits and drops redo after a new commit', () => {
    let history = initialHistory([]);
    history = historyReducer(history, { type: 'commit', boxes: [box] });
    history = historyReducer(history, { type: 'commit', boxes: [box, other] });
    history = historyReducer(history, { type: 'undo' });
    expect(history.present).toEqual([box]);
    history = historyReducer(history, { type: 'redo' });
    expect(history.present).toEqual([box, other]);
    history = historyReducer(history, { type: 'undo' });
    history = historyReducer(history, { type: 'commit', boxes: [other] });
    expect(history.future).toEqual([]);
    expect(historyReducer(history, { type: 'redo' })).toBe(history);
  });

  it('folds merged commits into one undo step', () => {
    let history = initialHistory([box]);
    history = historyReducer(history, { type: 'commit', boxes: [{ ...box, x: 108 }] });
    history = historyReducer(history, { type: 'commit', boxes: [{ ...box, x: 116 }], merge: true });
    history = historyReducer(history, { type: 'undo' });
    expect(history.present).toEqual([box]);
  });
});

describe('zoom levels', () => {
  it('steps through fixed levels and stops at the ends', () => {
    expect(nextZoom(1)).toBe(1.5);
    expect(nextZoom(1.7)).toBe(2);
    expect(nextZoom(8)).toBe(8);
    expect(previousZoom(2)).toBe(1.5);
    expect(previousZoom(1)).toBe(1);
  });
});
