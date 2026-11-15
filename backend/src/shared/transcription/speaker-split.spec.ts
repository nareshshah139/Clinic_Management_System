import { Logger } from '@nestjs/common';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { splitSpeakers } from './speaker-split';

describe('splitSpeakers against a local chat completions endpoint', () => {
  let server: http.Server;
  let reply: { status: number; body: string };
  let requests: any[];
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      res
        .writeHead(reply.status, { 'content-type': 'application/json' })
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
    requests = [];
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENAI_CHAT_COMPLETIONS_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/chat/completions`;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  const completion = (content: string) =>
    JSON.stringify({ choices: [{ message: { content } }] });

  it('returns doctor and patient turns parsed from the model output', async () => {
    reply = {
      status: 200,
      body: completion(
        JSON.stringify({
          segments: [
            {
              speaker: 'DOCTOR',
              text: 'Any fever?',
              confidence: 0.9,
              start_s: null,
              end_s: null,
            },
            { speaker: 'PATIENT', text: 'Yes, since Monday.' },
          ],
          speakers: {
            doctorText: 'Any fever?',
            patientText: 'Yes, since Monday.',
          },
        }),
      ),
    };

    await expect(
      splitSpeakers({ text: 'Any fever? Yes, since Monday.' }),
    ).resolves.toEqual({
      segments: [
        {
          speaker: 'DOCTOR',
          text: 'Any fever?',
          confidence: 0.9,
          start_s: null,
          end_s: null,
        },
        {
          speaker: 'PATIENT',
          text: 'Yes, since Monday.',
          confidence: undefined,
          start_s: undefined,
          end_s: undefined,
        },
      ],
      doctorText: 'Any fever?',
      patientText: 'Yes, since Monday.',
    });
    expect(JSON.parse(requests[0].messages[1].content)).toEqual({
      transcript: 'Any fever? Yes, since Monday.',
    });
  });

  it('builds the speaker texts from segments when the model omits them', async () => {
    reply = {
      status: 200,
      body: completion(
        JSON.stringify({
          segments: [
            { speaker: 'doctor', text: 'Open wide.' },
            { speaker: 'PATIENT', text: 'Ahh.' },
          ],
        }),
      ),
    };

    const split = await splitSpeakers({ text: 'Open wide. Ahh.' });

    expect(split.doctorText).toBe('Open wide.');
    expect(split.patientText).toBe('Ahh.');
  });

  it('forwards timed segments instead of the plain transcript', async () => {
    reply = { status: 200, body: completion('{}') };

    await splitSpeakers({
      text: 'x',
      segments: [{ text: 'Hello', start: 0.5, end: 1.5 }],
    });

    expect(JSON.parse(requests[0].messages[1].content)).toEqual({
      segments: [{ text: 'Hello', start_s: 0.5, end_s: 1.5 }],
    });
  });

  it('returns an empty split on an upstream error', async () => {
    reply = { status: 500, body: '{"error":{"message":"boom"}}' };
    await expect(splitSpeakers({ text: 'hello' })).resolves.toEqual({
      segments: [],
      doctorText: '',
      patientText: '',
    });
  });

  it('returns an empty split when the content is not JSON', async () => {
    reply = { status: 200, body: completion('not json') };
    await expect(splitSpeakers({ text: 'hello' })).resolves.toEqual({
      segments: [],
      doctorText: '',
      patientText: '',
    });
  });

  it('returns an empty split when the endpoint is unreachable', async () => {
    process.env.OPENAI_CHAT_COMPLETIONS_URL =
      'http://127.0.0.1:1/v1/chat/completions';
    await expect(splitSpeakers({ text: 'hello' })).resolves.toEqual({
      segments: [],
      doctorText: '',
      patientText: '',
    });
  });
});
