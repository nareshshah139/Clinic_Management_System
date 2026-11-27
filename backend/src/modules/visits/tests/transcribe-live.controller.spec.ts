import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { createLiveTranscriptionCall } from '../../../shared/transcription/openai-realtime';
import { splitSpeakers } from '../../../shared/transcription/speaker-split';
import { transcribeWithOpenAI } from '../../../shared/transcription/openai-transcribe';
import { ReviewBookingService } from '../review-booking';
import { VisitsController } from '../visits.controller';
import { VisitsService } from '../visits.service';

jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));
jest.mock('../../../shared/transcription/openai-realtime', () => ({
  createLiveTranscriptionCall: jest.fn(),
}));
jest.mock('../../../shared/transcription/speaker-split', () => ({
  splitSpeakers: jest.fn(),
}));
jest.mock('../../../shared/transcription/openai-transcribe', () => ({
  transcribeWithOpenAI: jest.fn(),
}));

const createCall = jest.mocked(createLiveTranscriptionCall);
const split = jest.mocked(splitSpeakers);
const transcribe = jest.mocked(transcribeWithOpenAI);
const OFFER = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n';

describe('live transcription routes', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VisitsController],
      providers: [
        { provide: VisitsService, useValue: {} },
        { provide: ReviewBookingService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const post = (path: string) => request(app.getHttpServer()).post(path);

  it('POST /visits/transcribe/live passes the offer through and returns the answer', async () => {
    createCall.mockResolvedValue('v=0\r\ns=answer\r\n');

    await post('/visits/transcribe/live')
      .send({ sdp: OFFER })
      .expect(201, { sdp: 'v=0\r\ns=answer\r\n' });

    expect(createCall).toHaveBeenCalledWith(OFFER);
  });

  it.each([
    ['not an SDP', { sdp: 'hello' }],
    ['oversized', { sdp: `v=0\r\n${'a'.repeat(20000)}` }],
    ['missing', {}],
  ])(
    'POST /visits/transcribe/live rejects an %s body with 400',
    async (_name, body) => {
      await post('/visits/transcribe/live').send(body).expect(400);
      expect(createCall).not.toHaveBeenCalled();
    },
  );

  it('POST /visits/transcribe/speakers returns the SpeechToTextResponse shape', async () => {
    split.mockResolvedValue({
      segments: [{ speaker: 'PATIENT', text: 'Fever since Monday.' }],
      doctorText: '',
      patientText: 'Fever since Monday.',
    });

    await post('/visits/transcribe/speakers')
      .send({ text: 'Fever since Monday.' })
      .expect(201, {
        text: 'Fever since Monday.',
        segments: [{ speaker: 'PATIENT', text: 'Fever since Monday.' }],
        speakers: { doctorText: '', patientText: 'Fever since Monday.' },
      });

    expect(split).toHaveBeenCalledWith({ text: 'Fever since Monday.' });
  });

  it('POST /visits/transcribe/speakers rejects a non-string body with 400', async () => {
    await post('/visits/transcribe/speakers').send({ text: 5 }).expect(400);
    expect(split).not.toHaveBeenCalled();
  });

  const upload = (path: string) =>
    post(path).attach('file', Buffer.from('audio'), { filename: 'recording.webm', contentType: 'audio/webm' });

  it('POST /visits/transcribe?speakers=none returns the transcript without asking for a speaker split', async () => {
    transcribe.mockResolvedValue({ text: 'Fever since Monday.', segments: [] });

    await upload('/visits/transcribe?speakers=none').expect(201, {
      text: 'Fever since Monday.',
      segments: [],
      speakers: { doctorText: '', patientText: '' },
    });

    expect(split).not.toHaveBeenCalled();
  });

  it('POST /visits/transcribe still splits speakers by default', async () => {
    transcribe.mockResolvedValue({ text: 'Fever since Monday.', segments: [] });
    split.mockResolvedValue({ segments: [], doctorText: '', patientText: 'Fever since Monday.' });

    await upload('/visits/transcribe').expect(201, {
      text: 'Fever since Monday.',
      segments: [],
      speakers: { doctorText: '', patientText: 'Fever since Monday.' },
    });

    expect(split).toHaveBeenCalledWith({ text: 'Fever since Monday.', segments: [] });
  });

  it.each(['chunk-start', 'chunk', 'chunk-complete'])(
    'the removed %s route is gone',
    async (route) => {
      await post(`/visits/transcribe/${route}`).send({}).expect(404);
    },
  );
});
