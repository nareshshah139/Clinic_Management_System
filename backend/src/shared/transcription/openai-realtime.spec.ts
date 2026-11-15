import { Logger } from '@nestjs/common';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { createLiveTranscriptionCall } from './openai-realtime';

interface Received {
  authorization?: string;
  sdp?: string;
  session?: unknown;
  fieldNames: string[];
}

const OFFER =
  'v=0\r\no=- 4611 2 IN IP4 127.0.0.1\r\ns=-\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const ANSWER = 'v=0\r\no=- 99 1 IN IP4 0.0.0.0\r\ns=-\r\na=ice-lite\r\n';

describe('createLiveTranscriptionCall against a local realtime endpoint', () => {
  let server: http.Server;
  let reply: { status: number; type: string; body: string };
  let received: Received[];
  let logged: string[];
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const form = await new Response(Buffer.concat(chunks), {
        headers: { 'content-type': req.headers['content-type'] ?? '' },
      }).formData();
      received.push({
        authorization: req.headers.authorization,
        sdp: form.get('sdp') as string,
        session: JSON.parse(form.get('session') as string),
        fieldNames: [...form.keys()],
      });
      res
        .writeHead(reply.status, { 'content-type': reply.type })
        .end(reply.body);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
  });
  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    received = [];
    logged = [];
    reply = { status: 201, type: 'application/sdp', body: ANSWER };
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENAI_REALTIME_CALLS_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/realtime/calls`;
    delete process.env.OPENAI_LIVE_TRANSCRIBE_MODEL;
    delete process.env.OPENAI_TRANSCRIBE_LANGUAGE;
    for (const level of ['log', 'warn', 'error'] as const) {
      jest
        .spyOn(Logger.prototype, level)
        .mockImplementation((message: unknown) => {
          logged.push(String(message));
        });
    }
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  const expectedSession = (languages?: string[]) => ({
    type: 'transcription',
    audio: {
      input: {
        transcription: {
          model: 'gpt-live-transcribe',
          prompt: expect.stringMatching(
            /^Medical doctor–patient conversation transcription\./,
          ),
          delay: 'low',
          ...(languages ? { languages } : {}),
        },
        turn_detection: null,
      },
    },
  });

  it('posts the offer and the transcription session with the server key and returns the answer', async () => {
    await expect(createLiveTranscriptionCall(OFFER)).resolves.toBe(ANSWER);

    expect(received).toHaveLength(1);
    expect(received[0].authorization).toBe('Bearer sk-test');
    expect(received[0].fieldNames).toEqual(['sdp', 'session']);
    expect(received[0].sdp).toBe(OFFER);
    expect(received[0].session).toEqual(expectedSession());
    expect(received[0].session).not.toHaveProperty(
      'audio.input.transcription.language',
    );
  });

  it('sends languages as a trimmed array and honours the model override', async () => {
    process.env.OPENAI_TRANSCRIBE_LANGUAGE = 'en, hi,';
    process.env.OPENAI_LIVE_TRANSCRIBE_MODEL = 'gpt-live-transcribe-2';

    await createLiveTranscriptionCall(OFFER);

    const expected = expectedSession(['en', 'hi']) as any;
    expected.audio.input.transcription.model = 'gpt-live-transcribe-2';
    expect(received[0].session).toEqual(expected);
  });

  it.each([400, 500])(
    'maps an upstream %i to a 502 and logs status, model and param only',
    async (status) => {
      reply = {
        status,
        type: 'application/json',
        body: JSON.stringify({
          error: {
            message: `bad ${OFFER}`,
            param: 'session.audio.input.transcription.languages[0]',
          },
        }),
      };

      await expect(createLiveTranscriptionCall(OFFER)).rejects.toMatchObject({
        status: 502,
        response: { message: 'Live transcription could not start.' },
      });

      expect(logged).toEqual([
        `live transcription OpenAI error: status=${status} model=gpt-live-transcribe param=session.audio.input.transcription.languages[0]`,
      ]);
    },
  );

  it('maps a network failure to a 502', async () => {
    process.env.OPENAI_REALTIME_CALLS_URL =
      'http://127.0.0.1:1/v1/realtime/calls';

    await expect(createLiveTranscriptionCall(OFFER)).rejects.toMatchObject({
      status: 502,
    });
    expect(logged.join('\n')).not.toContain('o=-');
  });

  it('answers 503 without calling OpenAI when the key is missing', async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(createLiveTranscriptionCall(OFFER)).rejects.toMatchObject({
      status: 503,
      response: {
        message:
          'Speech transcription is unavailable. Contact an administrator to configure OPENAI_API_KEY.',
      },
    });
    expect(received).toEqual([]);
  });

  it('never logs the SDP on success', async () => {
    await createLiveTranscriptionCall(OFFER);
    expect(logged.join('\n')).not.toContain('o=-');
  });
});
