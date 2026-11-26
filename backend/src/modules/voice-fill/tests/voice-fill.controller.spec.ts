import { BadRequestException, ExecutionContext, INestApplication, Logger, ServiceUnavailableException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import * as fs from 'fs';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { codexDiagnostic, CodexFailure, completeJsonWithCodexOAuth, isCodexOAuthReady } from '../../../shared/codex/codex-oauth';
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
  ...jest.requireActual('../../../shared/codex/codex-oauth'),
  completeJsonWithCodexOAuth: jest.fn(),
  isCodexOAuthReady: jest.fn(),
}));

const transcribe = jest.mocked(transcribeWithOpenAI);
const codex = jest.mocked(completeJsonWithCodexOAuth);
const UNAVAILABLE = 'Voice fill is unavailable right now. Please fill the form manually.';
const REQUEST_FAILED = 'Codex request failed. Check the server OAuth login and model availability.';
const NOT_SUPPORTED =
  'ERROR: unexpected status 400 Bad Request: {"detail":"The \'gpt-x\' model is not supported when using Codex with a ChatGPT account."}';
const PATIENT = 'Meera Iyer has had a dry cough for nine days and takes metformin 500 mg';

const sharesRunWith = (haystack: string, secret: string) => {
  const flat = (text: string) => text.toLowerCase().replace(/\s+/g, ' ');
  const hay = flat(haystack);
  const needle = flat(secret);
  return Array.from({ length: needle.length - 15 }, (_, i) => needle.slice(i, i + 16)).some((run) => hay.includes(run));
};

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
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
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
    expect(res.body.message).toBe(`${UNAVAILABLE} (code: transcription)`);
    expect(fs.existsSync(seenAudio!.path)).toBe(false);
  });

  it('503s when Codex fails or returns non-JSON, logging no model text', async () => {
    transcribesTo('Asha');
    codex.mockRejectedValueOnce(new CodexFailure('Codex timed out. Try again.', 'codex-timeout', null, null, ''));
    expect((await upload('patient-intake', 'DOCTOR').expect(503)).body.message).toBe(`${UNAVAILABLE} (code: codex-timeout)`);
    codex.mockResolvedValueOnce('Patient Asha Rao, I could not format this');
    expect((await upload('patient-intake', 'DOCTOR').expect(503)).body.message).toBe(`${UNAVAILABLE} (code: model-output)`);
    const warnings = jest.mocked(Logger.prototype.warn).mock.calls.map((call) => String(call[0]).replace(/([mM]s)=\d+/g, '$1=N'));
    expect(warnings).toEqual([
      'voice-fill form=patient-intake ms=N transcribeMs=N extractMs=N audioBytes=15 failed step=codex-timeout exit=none signal=none reason="Codex timed out. Try again." detail=""',
      'voice-fill form=patient-intake ms=N transcribeMs=N extractMs=N audioBytes=15 failed step=model-output exit=none signal=none reason="invalid model output" detail=""',
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

  it('lets every clinic staff role speak a command, managers included', async () => {
    transcribesTo('Open Ramesh Kumar');
    codex.mockResolvedValue('{"action":"open_patient","patientName":"Ramesh Kumar"}');
    for (const role of ['MANAGER', 'NURSE', 'RECEPTION']) {
      expect((await upload('voice-command', role).expect(200)).body.fields).toEqual({ action: 'open_patient', patientName: 'Ramesh Kumar' });
    }
    await upload('voice-command', 'ACCOUNTANT').expect(403);
  });

  it('403s patients and lab technicians at the route', async () => {
    await upload('patient-intake', 'PATIENT').expect(403);
    await upload('patient-intake', 'LAB_TECH').expect(403);
  });

  describe('POST /voice-fill/:form/text', () => {
    const typed = (form: string, role: string, body: unknown) =>
      request(app.getHttpServer()).post(`/voice-fill/${form}/text`).set('x-role', role).send(body as object);

    it('extracts from typed text without transcribing, returning the trimmed transcript with 200', async () => {
      codex.mockResolvedValue(JSON.stringify({ bpSystolic: 120, bpDiastolic: 80 }));
      const res = await typed('visit-consultation', 'DOCTOR', { text: '  BP 120 by 80.  \n' }).expect(200);
      expect(res.body).toEqual({ transcript: 'BP 120 by 80.', fields: { bpSystolic: 120, bpDiastolic: 80 } });
      expect(transcribe).not.toHaveBeenCalled();
      expect(codex).toHaveBeenCalledTimes(1);
      expect(codex.mock.calls[0][0].prompt).toContain('<transcript>\nBP 120 by 80.\n</transcript>');
    });

    it('accepts text of exactly 60000 characters', async () => {
      codex.mockResolvedValue('{"firstName":"Asha"}');
      const res = await typed('patient-intake', 'DOCTOR', { text: 'a'.repeat(60000) }).expect(200);
      expect(res.body.transcript).toHaveLength(60000);
    });

    it('400s missing, non-string, empty and whitespace-only text without calling Codex', async () => {
      await typed('patient-intake', 'DOCTOR', {}).expect(400);
      await typed('patient-intake', 'DOCTOR', { text: 42 }).expect(400);
      await typed('patient-intake', 'DOCTOR', { text: '' }).expect(400);
      await typed('patient-intake', 'DOCTOR', { text: ' \n\t ' }).expect(400);
      expect(codex).not.toHaveBeenCalled();
    });

    it('400s text over 60000 characters', async () => {
      await typed('patient-intake', 'DOCTOR', { text: 'a'.repeat(60001) }).expect(400);
      expect(codex).not.toHaveBeenCalled();
    });

    it('404s for an unknown form, including inherited object keys', async () => {
      await typed('billing', 'DOCTOR', { text: 'hello' }).expect(404);
      await typed('constructor', 'DOCTOR', { text: 'hello' }).expect(404);
      expect(codex).not.toHaveBeenCalled();
    });

    it('403s a role missing from the form list, and patients and lab technicians at the route', async () => {
      await typed('visit-consultation', 'NURSE', { text: 'hello' }).expect(403);
      await typed('patient-intake', 'PATIENT', { text: 'hello' }).expect(403);
      await typed('patient-intake', 'LAB_TECH', { text: 'hello' }).expect(403);
      expect(codex).not.toHaveBeenCalled();
    });

    it('lets managers speak a command by text', async () => {
      codex.mockResolvedValue('{"action":"open_patient","patientName":"Ramesh Kumar"}');
      const res = await typed('voice-command', 'MANAGER', { text: 'Open Ramesh Kumar' }).expect(200);
      expect(res.body.fields).toEqual({ action: 'open_patient', patientName: 'Ramesh Kumar' });
    });

    it('503s with the same message when Codex fails or returns non-JSON, logging none of the text', async () => {
      codex.mockRejectedValueOnce(new CodexFailure('Codex timed out. Try again.', 'codex-timeout', null, null, ''));
      expect((await typed('patient-intake', 'DOCTOR', { text: 'Asha Rao secret' }).expect(503)).body.message)
        .toBe(`${UNAVAILABLE} (code: codex-timeout)`);
      codex.mockResolvedValueOnce('Patient Asha Rao, I could not format this');
      expect((await typed('patient-intake', 'DOCTOR', { text: 'Asha Rao secret' }).expect(503)).body.message)
        .toBe(`${UNAVAILABLE} (code: model-output)`);
      const warnings = jest.mocked(Logger.prototype.warn).mock.calls.map((call) => String(call[0]).replace(/([mM]s)=\d+/g, '$1=N'));
      expect(warnings).toEqual([
        'voice-fill form=patient-intake ms=N transcribeMs=N extractMs=N textChars=15 failed step=codex-timeout exit=none signal=none reason="Codex timed out. Try again." detail=""',
        'voice-fill form=patient-intake ms=N transcribeMs=N extractMs=N textChars=15 failed step=model-output exit=none signal=none reason="invalid model output" detail=""',
      ]);
    });

    it('logs the outcome of a success without the text', async () => {
      codex.mockResolvedValue('{"firstName":"Asha"}');
      await typed('patient-intake', 'DOCTOR', { text: 'Asha Rao secret' }).expect(200);
      const logs = jest.mocked(Logger.prototype.log).mock.calls.map((call) => String(call[0]).replace(/([mM]s)=\d+/g, '$1=N'));
      expect(logs).toEqual(['voice-fill form=patient-intake ms=N transcribeMs=N extractMs=N textChars=15 fields=1']);
    });
  });

  describe('failure codes', () => {
    const cases: Array<{ name: string; arrange: () => void; code: string; log: string }> = [
      {
        name: 'a transcription outage',
        arrange: () => transcribe.mockRejectedValue(
          new ServiceUnavailableException('Speech transcription service is temporarily unavailable. Please try again.')),
        code: 'transcription',
        log: 'step=transcription exit=none signal=none reason="Speech transcription service is temporarily unavailable. Please try again." detail=""',
      },
      {
        name: 'a recording ffmpeg cannot convert, without its ffmpeg detail',
        arrange: () => transcribe.mockRejectedValue(
          new BadRequestException('Audio format conversion failed: ffmpeg exited with code 1: Invalid data found')),
        code: 'transcription',
        log: 'step=transcription exit=none signal=none reason="Audio format conversion failed" detail=""',
      },
      {
        name: 'a missing ChatGPT login',
        arrange: () => codex.mockRejectedValue(
          new CodexFailure('Codex ChatGPT OAuth login is required on the server.', 'codex-login', 0, null, '')),
        code: 'codex-login',
        log: 'step=codex-login exit=0 signal=none reason="Codex ChatGPT OAuth login is required on the server." detail=""',
      },
      {
        name: 'a codex binary that cannot start',
        arrange: () => codex.mockRejectedValue(new CodexFailure(
          'Codex could not start. Check PHARMACY_AGENT_CODEX_PATH.', 'codex-start', null, null, 'spawn codex ENOENT')),
        code: 'codex-start',
        log: 'step=codex-start exit=none signal=none reason="Codex could not start. Check PHARMACY_AGENT_CODEX_PATH." detail="spawn codex ENOENT"',
      },
      {
        name: 'a codex timeout',
        arrange: () => codex.mockRejectedValue(new CodexFailure('Codex timed out. Try again.', 'codex-timeout', null, null, '')),
        code: 'codex-timeout',
        log: 'step=codex-timeout exit=none signal=none reason="Codex timed out. Try again." detail=""',
      },
      {
        name: 'a failed codex exec',
        arrange: () => codex.mockRejectedValue(new CodexFailure(REQUEST_FAILED, 'codex-exec', 1, null, NOT_SUPPORTED)),
        code: 'codex-exec',
        log: `step=codex-exec exit=1 signal=none reason="${REQUEST_FAILED}" detail="${NOT_SUPPORTED.replace(/"/g, "'")}"`,
      },
      {
        name: 'a killed codex exec',
        arrange: () => codex.mockRejectedValue(new CodexFailure(REQUEST_FAILED, 'codex-exec', null, 'SIGTERM', '')),
        code: 'codex-exec',
        log: `step=codex-exec exit=none signal=SIGTERM reason="${REQUEST_FAILED}" detail=""`,
      },
      {
        name: 'model output that is not JSON',
        arrange: () => codex.mockResolvedValue('not json'),
        code: 'model-output',
        log: 'step=model-output exit=none signal=none reason="invalid model output" detail=""',
      },
      {
        name: 'anything else',
        arrange: () => codex.mockRejectedValue(new Error('EACCES: permission denied, mkdtemp')),
        code: 'unknown',
        log: 'step=unknown exit=none signal=none reason="EACCES: permission denied, mkdtemp" detail=""',
      },
    ];

    it.each(cases)('503s with code $code and one warn line for $name', async ({ arrange, code, log }) => {
      transcribesTo('Asha');
      arrange();
      const res = await upload('patient-intake', 'DOCTOR').expect(503);
      expect(res.body).toEqual({ statusCode: 503, error: 'Service Unavailable', message: `${UNAVAILABLE} (code: ${code})` });
      const warnings = jest.mocked(Logger.prototype.warn).mock.calls.map((call) => String(call[0]).replace(/([mM]s)=\d+/g, '$1=N'));
      const stages = code === 'transcription' ? '' : ' transcribeMs=N extractMs=N';
      expect(warnings).toEqual([`voice-fill form=patient-intake ms=N${stages} audioBytes=15 failed ${log}`]);
    });

    it('never logs or returns the patient text, whatever fails', async () => {
      const echoingCodex = async ({ prompt }: { prompt: string }): Promise<string> => {
        const output = ['user', prompt, `ERROR: invalid_request: ${PATIENT}`, NOT_SUPPORTED].join('\n');
        throw new CodexFailure(REQUEST_FAILED, 'codex-exec', 1, null, codexDiagnostic(output, [prompt]));
      };
      const bodies: unknown[] = [];
      transcribesTo(PATIENT);
      codex.mockImplementationOnce(echoingCodex);
      bodies.push((await upload('patient-intake', 'DOCTOR').expect(503)).body);
      codex.mockImplementationOnce(echoingCodex);
      bodies.push((await typed('patient-intake', 'DOCTOR', { text: PATIENT }).expect(503)).body);
      codex.mockResolvedValueOnce(`Sorry, ${PATIENT}`);
      bodies.push((await typed('patient-intake', 'DOCTOR', { text: PATIENT }).expect(503)).body);
      transcribe.mockRejectedValueOnce(new BadRequestException(`Audio format conversion failed: ffmpeg said ${PATIENT}`));
      bodies.push((await upload('patient-intake', 'DOCTOR').expect(503)).body);

      const logged = (['log', 'warn', 'error', 'debug', 'verbose'] as const)
        .flatMap((level) => (jest.isMockFunction(Logger.prototype[level]) ? jest.mocked(Logger.prototype[level]).mock.calls : []))
        .map((call) => call.map(String).join(' '));
      expect(logged.filter((line) => sharesRunWith(line, PATIENT))).toEqual([]);
      expect(bodies.filter((body) => sharesRunWith(JSON.stringify(body), PATIENT))).toEqual([]);
      expect(jest.mocked(Logger.prototype.warn).mock.calls[0][0]).toContain(`detail="${NOT_SUPPORTED.replace(/"/g, "'")}"`);
    });

    const typed = (form: string, role: string, body: unknown) =>
      request(app.getHttpServer()).post(`/voice-fill/${form}/text`).set('x-role', role).send(body as object);
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

describe('GET /voice-fill/status logging', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('logs which half is missing once per change of availability', async () => {
    const controller = new VoiceFillController(new VoiceFillService());
    jest.mocked(isOpenAiTranscriptionConfigured).mockReturnValue(false);
    jest.mocked(isCodexOAuthReady).mockResolvedValue(true);
    expect(await controller.status()).toEqual({ available: false });
    expect(await controller.status()).toEqual({ available: false });
    jest.mocked(isOpenAiTranscriptionConfigured).mockReturnValue(true);
    expect(await controller.status()).toEqual({ available: true });
    expect(await controller.status()).toEqual({ available: true });
    jest.mocked(isCodexOAuthReady).mockResolvedValue(false);
    expect(await controller.status()).toEqual({ available: false });
    expect(jest.mocked(Logger.prototype.log).mock.calls.map((call) => call[0])).toEqual([
      'voice-fill status available=false transcriptionKey=false codexLogin=true',
      'voice-fill status available=true transcriptionKey=true codexLogin=true',
      'voice-fill status available=false transcriptionKey=true codexLogin=false',
    ]);
  });
});
