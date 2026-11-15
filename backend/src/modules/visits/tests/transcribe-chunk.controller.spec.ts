import { BadRequestException, INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { transcribeWithOpenAI, type TranscriptionAudio } from '../../../shared/transcription/openai-transcribe';
import { ReviewBookingService } from '../review-booking';
import { VisitsController } from '../visits.controller';
import { VisitsService } from '../visits.service';

jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));
jest.mock('../../../shared/transcription/openai-transcribe', () => ({
  transcribeWithOpenAI: jest.fn(),
  isOpenAiTranscriptionConfigured: jest.fn(),
}));

const transcribe = jest.mocked(transcribeWithOpenAI);
const CHUNK = Buffer.alloc(800, 'w');

describe('POST /visits/transcribe/chunk', () => {
  let app: INestApplication;
  let cwd: string;
  let seenAudio: (TranscriptionAudio & { bytes: number }) | undefined;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VisitsController],
      providers: [{ provide: VisitsService, useValue: {} }, { provide: ReviewBookingService, useValue: {} }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    jest.resetAllMocks();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-chunk-'));
    jest.spyOn(process, 'cwd').mockReturnValue(cwd);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    seenAudio = undefined;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  const transcribesTo = (text: string, segments: unknown[] = []) =>
    transcribe.mockImplementation(async (audio) => {
      seenAudio = { ...audio, bytes: fs.statSync(audio.path).size };
      return { text, segments };
    });
  const startSession = async () =>
    (await request(app.getHttpServer()).post('/visits/transcribe/chunk-start').expect(201)).body.sessionId as string;
  const sessionFile = (sessionId: string) =>
    JSON.parse(fs.readFileSync(path.join(cwd, 'uploads', 'tmp', 'transcribe', 'sessions', `${sessionId}.json`), 'utf8'));
  const uploadsLeft = () =>
    fs.readdirSync(path.join(cwd, 'uploads', 'tmp', 'transcribe')).filter((name) => name !== 'sessions');
  const uploadChunk = (sessionId: string) =>
    request(app.getHttpServer()).post('/visits/transcribe/chunk')
      .field('sessionId', sessionId)
      .attach('file', CHUNK, { filename: 'chunk-0.webm', contentType: 'audio/webm' });

  it('transcribes the chunk with the shared OpenAI function and stores the returned text in the session', async () => {
    transcribesTo('BP 120 by 80');
    const sessionId = await startSession();

    await uploadChunk(sessionId).expect(201, { ok: true });

    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(seenAudio).toMatchObject({ mimetype: 'audio/webm', filename: 'chunk-0.webm', bytes: CHUNK.length });
    expect(sessionFile(sessionId).chunks).toEqual([
      { index: 0, start_s_offset: 0, end_s_offset: 0, text: 'BP 120 by 80', segments: [] },
    ]);
    expect(fs.existsSync(seenAudio!.path)).toBe(false);
    expect(fs.existsSync(path.join(cwd, 'transcribe_errors.log'))).toBe(false);
  });

  it('keeps timed segments when a whisper model returns them', async () => {
    transcribesTo('Fever for three days', [{ text: 'Fever for three days', start: 0.2, end: 1.9, tokens: [1, 2] }]);
    const sessionId = await startSession();

    await uploadChunk(sessionId).expect(201);

    expect(sessionFile(sessionId).chunks[0].segments).toEqual([{ text: 'Fever for three days', start_s: 0.2, end_s: 1.9 }]);
  });

  it('passes the shared error through, leaves the session untouched and removes the upload', async () => {
    transcribe.mockRejectedValue(
      new BadRequestException('Speech transcription rejected the recording. Please retry with a shorter, clearer clip.'),
    );
    const sessionId = await startSession();

    const res = await uploadChunk(sessionId).expect(400);

    expect(res.body.message).toBe('Speech transcription rejected the recording. Please retry with a shorter, clearer clip.');
    expect(sessionFile(sessionId).chunks).toEqual([]);
    expect(uploadsLeft()).toEqual([]);
    expect(fs.existsSync(path.join(cwd, 'transcribe_errors.log'))).toBe(false);
  });

  it('rejects an unknown session without transcribing', async () => {
    await uploadChunk('missing').expect(400);
    expect(transcribe).not.toHaveBeenCalled();
    expect(uploadsLeft()).toEqual([]);
  });
});
