import { ApiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';

describe('Save API error messages', () => {
  it('turns a real API validation response into text while preserving every message', async () => {
    const previousFetch = global.fetch;
    const messages = ['items.0.dosage must not be less than 0.01', 'items.1.duration must not be less than 1'];
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ message: messages, error: 'Bad Request', statusCode: 400 }),
    });
    try {
      const error = await new ApiClient().createPrescription({}).catch(error => error);
      expect(error.status).toBe(400);
      expect(getErrorMessage(error)).toBe(`${messages.join('; ')} (Reference: ${error.requestId})`);
      expect(() => getErrorMessage(error).toLowerCase()).not.toThrow();
    } finally {
      global.fetch = previousFetch;
    }
  });

  it('does not duplicate a reference or render an untrusted reference value', () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    const message = `Unable to save (Reference: ${requestId})`;
    expect(getErrorMessage({ message, requestId })).toBe(message);
    expect(getErrorMessage({ message: 'Unable to save', requestId: 'patient-name' })).toBe('Unable to save');
  });

  it.each([
    [new Error('Network unavailable'), 'Network unavailable'],
    [{ body: { message: 'Visit not found' } }, 'Visit not found'],
    [{ body: { message: [] }, message: 'HTTP 400' }, 'HTTP 400'],
    [{ body: { message: { unexpected: true } } }, 'An unexpected error occurred'],
    ['Plain error', 'Plain error'],
  ])('always returns text for %j', (error, expected) => {
    expect(getErrorMessage(error)).toBe(expected);
  });
});
