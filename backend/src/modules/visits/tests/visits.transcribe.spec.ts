import { promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ServiceUnavailableException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../../shared/decorators/roles.decorator';
import { VisitsController } from '../visits.controller';

const ENV_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_TRANSCRIBE_MODEL',
  'OPENAI_TRANSCRIBE_TIMEOUT_MS',
] as const;

type FetchCall = { url: string; init: any };

describe('VisitsController.transcribeAudio', () => {
  const saved: Record<string, string | undefined> = {};
  let controller: VisitsController;
  let fetchSpy: jest.SpyInstance;
  let calls: FetchCall[];
  let audioPath: string;

  const makeFile = () => ({
    size: 4,
    mimetype: 'audio/wav',
    originalname: 'clip.wav',
    path: audioPath,
    destination: tmpdir(),
    filename: audioPath.split('/').pop() as string,
  });

  const jsonResponse = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body, text: async () => '' }) as any;

  const transcribe = (body: Record<string, string> = {}) =>
    controller.transcribeAudio(makeFile() as any, { user: {} } as any, body as any);

  beforeEach(async () => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.OPENAI_API_KEY = 'test-key';
    delete process.env.OPENAI_TRANSCRIBE_MODEL;
    delete process.env.OPENAI_TRANSCRIBE_TIMEOUT_MS;
    audioPath = join(tmpdir(), `transcribe-spec-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`);
    await fsPromises.writeFile(audioPath, Buffer.from('RIFF'));
    controller = new VisitsController({} as any);
    calls = [];
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('audio/transcriptions')) {
        return jsonResponse({ text: 'Itching for two weeks.', segments: [{ text: 'Itching', start: 0, end: 1 }] });
      }
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ segments: [], speakers: { doctorText: '', patientText: '' } }) } }],
      });
    }) as any);
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    await fsPromises.unlink(audioPath).catch(() => {});
  });

  it('asks for json for the default model', async () => {
    await transcribe();
    expect(calls[0].init.body.get('response_format')).toBe('json');
  });

  it('asks for verbose_json for whisper-1', async () => {
    process.env.OPENAI_TRANSCRIBE_MODEL = 'whisper-1';
    await transcribe();
    expect(calls[0].init.body.get('response_format')).toBe('verbose_json');
  });

  it('makes one provider call when diarize is not sent', async () => {
    const result = await transcribe();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ text: 'Itching for two weeks.', segments: [], speakers: { doctorText: '', patientText: '' } });
  });

  it('runs the diarization call with a schema closed at every level when diarize is true', async () => {
    await transcribe({ diarize: 'true' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const schema = JSON.parse(calls[1].init.body).response_format.json_schema;
    expect(schema.strict).toBe(true);
    const root = schema.schema;
    const segment = root.properties.segments.items;
    const speakers = root.properties.speakers;
    for (const level of [root, segment, speakers]) {
      expect(level.additionalProperties).toBe(false);
      expect([...level.required].sort()).toEqual(Object.keys(level.properties).sort());
    }
    expect(segment.properties.confidence).toEqual({ type: ['number', 'null'] });
  });

  it('sends the plain prompt when context is plain', async () => {
    await transcribe({ context: 'plain' });
    const prompt = calls[0].init.body.get('prompt');
    expect(prompt).toContain('Transcribe exactly what is said');
    expect(prompt).not.toContain('Medical doctor');
  });

  it('sends the clinical prompt by default and for an unknown context', async () => {
    await transcribe({ context: 'something-else' });
    expect(calls[0].init.body.get('prompt')).toContain('Medical doctor');
  });

  it('answers 503 without calling the provider when no key is set', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(transcribe()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers 503 with the took-too-long copy when the provider never replies', async () => {
    process.env.OPENAI_TRANSCRIBE_TIMEOUT_MS = '10';
    fetchSpy.mockImplementation(((_url: any, init: any) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      })) as any);
    const error: any = await transcribe().catch((e) => e);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.message).toBe('Speech transcription took too long. Please try a shorter clip.');
  });

  describe('roles', () => {
    const proto = VisitsController.prototype as any;
    it.each([
      'transcribeAudio',
      'startTranscriptionSession',
      'uploadTranscriptionChunk',
      'completeTranscriptionSession',
    ])('%s refuses PATIENT', (handler) => {
      const fn = proto[handler];
      expect(typeof fn).toBe('function');
      const roles: UserRole[] | undefined = Reflect.getMetadata(ROLES_KEY, fn);
      expect(Array.isArray(roles)).toBe(true);
      expect(roles).not.toContain(UserRole.PATIENT);
    });
  });
});
