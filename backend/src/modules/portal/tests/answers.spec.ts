import { InstrumentContent } from '../../follow-ups/content';
import { answerProblems, asMessage, evaluate } from '../answers';
import { readFileSync } from 'fs';
import { join } from 'path';

const content = JSON.parse(readFileSync(join(__dirname, '../../follow-ups/data/instruments/symptom-check.json'), 'utf8')) as InstrumentContent;

describe('answers against the pinned instrument', () => {
  it('accepts a complete answer with a photo for the photo item', () => {
    expect(answerProblems(content, { severity: 3, change: 'same' }, ['photo'])).toEqual([]);
  });

  it('rejects missing, out-of-range, unknown and photo-less keys', () => {
    expect(answerProblems(content, { severity: 11, extra: 'x' }, ['severity'])).toEqual([
      'extra is not a question here',
      'severity does not take a photo',
      'severity has an answer this question does not allow',
      'change needs an answer',
    ]);
    expect(answerProblems(content, { severity: 2.5, change: 'maybe' }, [])).toHaveLength(2);
  });

  it('scores from the instrument and takes the highest matching flag', () => {
    expect(evaluate(content, { severity: 3, change: 'same' })).toEqual({ score: 3, flag: null });
    expect(evaluate(content, { severity: 3, change: 'worse' })).toEqual({ score: 3, flag: 'HIGH' });
    expect(evaluate(content, { severity: 9, change: 'worse' })).toEqual({ score: 9, flag: 'URGENT' });
  });

  it('writes a resubmission as inbox text', () => {
    expect(asMessage({ severity: 9, change: 'worse' }, 1)).toBe('Submitted again after this check-in was already answered:\nseverity: 9\nchange: worse\nphotos: 1');
  });
});
