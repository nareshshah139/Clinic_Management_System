import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  ChatCall,
  VOICE_NOT_CONFIGURED_MESSAGE,
  VOICE_UNAVAILABLE_MESSAGE,
  VoiceService,
} from './voice.service';

describe('VoiceService', () => {
  const savedKey = process.env.OPENAI_API_KEY;
  const savedTimeout = process.env.OPENAI_HTTP_TIMEOUT_MS;
  let chat: jest.Mock;
  let service: VoiceService;
  const logged: string[] = [];

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    delete process.env.OPENAI_HTTP_TIMEOUT_MS;
    logged.length = 0;
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }
    chat = jest.fn();
    service = new VoiceService(chat as unknown as ChatCall);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
    if (savedTimeout === undefined) delete process.env.OPENAI_HTTP_TIMEOUT_MS;
    else process.env.OPENAI_HTTP_TIMEOUT_MS = savedTimeout;
  });

  it('answers 503 with the not-set-up message and never calls chat when no key is set', async () => {
    delete process.env.OPENAI_API_KEY;
    const error: any = await service.parse('visit-note', 'itching').catch((e) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.message).toBe(VOICE_NOT_CONFIGURED_MESSAGE);
    expect(chat).not.toHaveBeenCalled();
  });

  it('turns an AbortError from chat into 503 with the unavailable message', async () => {
    chat.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const error: any = await service.parse('book-appointment', 'book anita').catch((e) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.message).toBe(VOICE_UNAVAILABLE_MESSAGE);
  });

  it('turns a non-2xx failure from chat into 503 with the unavailable message', async () => {
    chat.mockRejectedValue(Object.assign(new Error('OpenAI 500'), { status: 500 }));
    const error: any = await service.parse('stock-count', 'forty strips').catch((e) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.message).toBe(VOICE_UNAVAILABLE_MESSAGE);
  });

  it('aborts the signal after OPENAI_HTTP_TIMEOUT_MS', async () => {
    process.env.OPENAI_HTTP_TIMEOUT_MS = '10';
    chat.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    );
    const error: any = await service.parse('book-appointment', 'book anita').catch((e) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.message).toBe(VOICE_UNAVAILABLE_MESSAGE);
  });

  it('never logs the transcript', async () => {
    const secret = 'patient Zebediah has chest pain';
    chat.mockRejectedValue(new Error(`provider echoed: ${secret}`));
    await service.parse('visit-note', secret).catch(() => undefined);
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.join('\n')).not.toContain('Zebediah');
  });

  it('returns heard equal to the trimmed request text', async () => {
    chat.mockResolvedValue({ assignments: [{ i: 0, section: 'chiefComplaints' }] });
    const result = await service.parse('visit-note', '  Itching for two weeks.  ');
    expect(result.heard).toBe('Itching for two weeks.');
    expect(result.items).toEqual([{ text: 'Itching for two weeks.', section: 'chiefComplaints' }]);
  });

  it('sends a strict schema and the heard text to chat', async () => {
    chat.mockResolvedValue({ fields: {} });
    await service.parse('stock-count', 'forty strips');
    const req = chat.mock.calls[0][0];
    expect(req.apiKey).toBe('test-key');
    expect(req.user).toBe('forty strips');
    expect(req.schema).toEqual(expect.objectContaining({ additionalProperties: false }));
  });

  it.each([
    ['visit-note', 8001],
    ['book-appointment', 501],
  ] as const)('rejects %s text of %d characters with 400', async (intent, length) => {
    await expect(service.parse(intent, 'a'.repeat(length))).rejects.toBeInstanceOf(BadRequestException);
    expect(chat).not.toHaveBeenCalled();
  });

  it('accepts text at the limit', async () => {
    chat.mockResolvedValue({ fields: {} });
    await expect(service.parse('book-appointment', 'a'.repeat(500))).resolves.toBeDefined();
  });

  it('status reports configured without calling chat', () => {
    expect(service.status()).toEqual({ configured: true });
    delete process.env.OPENAI_API_KEY;
    expect(service.status()).toEqual({ configured: false });
    expect(chat).not.toHaveBeenCalled();
  });
});
