import { ExecutionContext, INestApplication, Logger, ServiceUnavailableException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import * as fs from 'fs';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { completeJsonWithCodexOAuth, isCodexOAuthReady } from '../../../shared/codex/codex-oauth';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { diagnosticValidationPipe } from '../../../shared/logging/http-observability';
import { isOpenAiTranscriptionConfigured, transcribeWithOpenAI, type TranscriptionAudio } from '../../../shared/transcription/openai-transcribe';
import { VoiceFillController } from '../voice-fill.controller';
import { VoiceFillService } from '../voice-fill.service';

jest.mock('../../../shared/transcription/openai-transcribe', () => ({
  transcribeWithOpenAI: jest.fn(),
  isOpenAiTranscriptionConfigured: jest.fn(),
}));
jest.mock('../../../shared/codex/codex-oauth', () => ({
  completeJsonWithCodexOAuth: jest.fn(),
  isCodexOAuthReady: jest.fn(),
}));

const transcribe = jest.mocked(transcribeWithOpenAI);
const codex = jest.mocked(completeJsonWithCodexOAuth);
const UNAVAILABLE = 'Voice fill is unavailable right now. Please fill the form manually.';

describe('POST /voice-fill/:form with the real service', () => {
  let app: INestApplication;
  let seenAudio: { path: string; mimetype: string; filename: string; mode: number; bytes: string } | undefined;

  beforeAll(async () => {
    const auth = {
      canActivate: (ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest();
        req.user = { id: 'u1', branchId: 'b1', role: req.headers['x-role'] };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [VoiceFillController],
      providers: [VoiceFillService, { provide: APP_GUARD, useValue: auth }, { provide: APP_GUARD, useClass: RolesGuard }],
    }).overrideGuard(JwtAuthGuard).useValue(auth).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(diagnosticValidationPipe());
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    seenAudio = undefined;
  });
  afterEach(() => jest.restoreAllMocks());

  const transcribesTo = (text: string) =>
    transcribe.mockImplementation(async (audio: TranscriptionAudio) => {
      seenAudio = { ...audio, mode: fs.statSync(audio.path).mode & 0o777, bytes: fs.readFileSync(audio.path, 'utf8') };
      return { text, segments: [] };
    });

  const upload = (form: string, role: string, contentType = 'audio/webm', bytes = Buffer.from('fake webm bytes')) =>
    request(app.getHttpServer()).post(`/voice-fill/${form}`).set('x-role', role)
      .attach('file', bytes, { filename: 'voice.webm', contentType });

  it('transcribes, extracts and validates, returning the transcript and fields with 200', async () => {
    transcribesTo('  BP 120 by 80. Doxycycline 100 mg twice daily for 6 weeks after food.  ');
    codex.mockResolvedValue(JSON.stringify({
      bpSystolic: 120,
      bpDiastolic: 80,
      pulse: 'fast',
      prescriptionItems: [
        { drugName: 'Doxycycline', dosage: 100, dosageUnit: 'MG', frequency: 'TWICE_DAILY', dosePattern: null, duration: 6,
          durationUnit: 'WEEKS', timing: 'after food', route: null, applicationSite: null, instructions: null },
        { drugName: null, dosage: 5 },
      ],
    }));
    const res = await upload('visit-consultation', 'DOCTOR').expect(200);
    expect(res.body).toEqual({
      transcript: 'BP 120 by 80. Doxycycline 100 mg twice daily for 6 weeks after food.',
      fields: {
        bpSystolic: 120,
        bpDiastolic: 80,
        prescriptionItems: [{ drugName: 'Doxycycline', dosage: 100, dosageUnit: 'MG', frequency: 'TWICE_DAILY', duration: 6,
          durationUnit: 'WEEKS', timing: 'after food' }],
      },
    });
    expect(seenAudio).toMatchObject({ mimetype: 'audio/webm', filename: 'audio.webm', mode: 0o600, bytes: 'fake webm bytes' });
    expect(fs.existsSync(seenAudio!.path)).toBe(false);
    expect(codex.mock.calls[0][0].prompt).toContain('<transcript>\nBP 120 by 80. Doxycycline 100 mg twice daily for 6 weeks after food.\n</transcript>');
  });

  it('maps browser audio types, with codec parameters, to the file sent for transcription', async () => {
    transcribesTo('Asha');
    codex.mockResolvedValue('{"firstName":"Asha"}');
    const seen: string[] = [];
    for (const type of ['audio/webm;codecs=opus', 'audio/mp4', 'video/webm', 'audio/x-wav']) {
      await upload('patient-intake', 'RECEPTION', type).expect(200);
      seen.push(`${seenAudio!.filename} ${seenAudio!.mimetype}`);
    }
    expect(seen).toEqual(['audio.webm audio/webm', 'audio.m4a audio/mp4', 'audio.webm audio/webm', 'audio.wav audio/wav']);
  });

  it('returns an empty result for silence without calling Codex', async () => {
    transcribesTo('  \n ');
    const res = await upload('patient-intake', 'DOCTOR').expect(200);
    expect(res.body).toEqual({ transcript: '', fields: {} });
    expect(codex).not.toHaveBeenCalled();
  });

  it('503s when transcription fails and still removes the audio', async () => {
    transcribe.mockImplementation(async (audio: TranscriptionAudio) => {
      seenAudio = { ...audio, mode: 0, bytes: '' };
      throw new ServiceUnavailableException('Speech transcription service is temporarily unavailable. Please try again.');
    });
    const res = await upload('patient-intake', 'DOCTOR').expect(503);
    expect(res.body.message).toBe(UNAVAILABLE);
    expect(fs.existsSync(seenAudio!.path)).toBe(false);
  });

  it('503s when Codex fails or returns non-JSON, logging no model text', async () => {
    transcribesTo('Asha');
    codex.mockRejectedValueOnce(new ServiceUnavailableException('Codex timed out. Try again.'));
    expect((await upload('patient-intake', 'DOCTOR').expect(503)).body.message).toBe(UNAVAILABLE);
    codex.mockResolvedValueOnce('Patient Asha Rao, I could not format this');
    expect((await upload('patient-intake', 'DOCTOR').expect(503)).body.message).toBe(UNAVAILABLE);
    const warnings = jest.mocked(Logger.prototype.warn).mock.calls.map((call) => String(call[0]).replace(/ms=\d+/, 'ms=N'));
    expect(warnings).toEqual([
      'voice-fill form=patient-intake ms=N audioBytes=15 failed: Codex timed out. Try again.',
      'voice-fill form=patient-intake ms=N audioBytes=15 failed: invalid model output',
    ]);
  });

  it('400s a missing or empty file', async () => {
    await request(app.getHttpServer()).post('/voice-fill/patient-intake').set('x-role', 'DOCTOR').field('note', 'no file').expect(400);
    await request(app.getHttpServer()).post('/voice-fill/patient-intake').set('x-role', 'DOCTOR').expect(400);
    await upload('patient-intake', 'DOCTOR', 'audio/webm', Buffer.alloc(0)).expect(400);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('400s a file that is not a supported audio type', async () => {
    const res = await upload('patient-intake', 'DOCTOR', 'text/plain').expect(400);
    expect(res.body.message).toBe('Upload a webm, ogg, m4a, mp3 or wav audio recording.');
    await upload('patient-intake', 'DOCTOR', 'audio/flac').expect(400);
  });

  it('404s for an unknown form, including inherited object keys', async () => {
    await upload('billing', 'DOCTOR').expect(404);
    await upload('constructor', 'DOCTOR').expect(404);
  });

  it('403s a role missing from the form list even when it can reach the route', async () => {
    await upload('visit-consultation', 'NURSE').expect(403);
    await upload('inventory-item', 'NURSE').expect(403);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('403s patients and lab technicians at the route', async () => {
    await upload('patient-intake', 'PATIENT').expect(403);
    await upload('patient-intake', 'LAB_TECH').expect(403);
  });

  it('reports availability only when transcription is configured and Codex OAuth is ready, to clinic staff only', async () => {
    const status = (role: string) => request(app.getHttpServer()).get('/voice-fill/status').set('x-role', role);
    jest.mocked(isCodexOAuthReady).mockResolvedValue(true);
    jest.mocked(isOpenAiTranscriptionConfigured).mockReturnValue(false);
    expect((await status('ACCOUNTANT').expect(200)).body).toEqual({ available: false });
    jest.mocked(isOpenAiTranscriptionConfigured).mockReturnValue(true);
    expect((await status('ACCOUNTANT').expect(200)).body).toEqual({ available: true });
    jest.mocked(isCodexOAuthReady).mockResolvedValue(false);
    expect((await status('ACCOUNTANT').expect(200)).body).toEqual({ available: false });
    await status('PATIENT').expect(403);
  });
});
