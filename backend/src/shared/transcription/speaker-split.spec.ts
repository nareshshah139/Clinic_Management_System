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

  const turns = (
    ...starts: Array<[number, string] | [number, string, string]>
  ) =>
    completion(
      JSON.stringify({
        turns: starts.map(([from, speaker, startsWith = '']) => ({
          from,
          startsWith,
          speaker,
        })),
      }),
    );

  it("sends numbered lines, asks only where each turn starts, and joins each speaker's lines", async () => {
    reply = {
      status: 200,
      body: turns([0, 'DOCTOR'], [1, 'PATIENT'], [3, 'DOCTOR']),
    };

    await expect(
      splitSpeakers({
        text: 'Any fever? Yes, since Monday. It gets worse at night! Take paracetamol 500 mg.',
      }),
    ).resolves.toEqual({
      segments: [
        { speaker: 'DOCTOR', text: 'Any fever?', start_s: null, end_s: null },
        {
          speaker: 'PATIENT',
          text: 'Yes, since Monday. It gets worse at night!',
          start_s: null,
          end_s: null,
        },
        {
          speaker: 'DOCTOR',
          text: 'Take paracetamol 500 mg.',
          start_s: null,
          end_s: null,
        },
      ],
      doctorText: 'Any fever? Take paracetamol 500 mg.',
      patientText: 'Yes, since Monday. It gets worse at night!',
    });
    expect(requests[0].messages[1].content).toBe(
      '0: Any fever?\n1: Yes, since Monday.\n2: It gets worse at night!\n3: Take paracetamol 500 mg.',
    );
    expect(
      Object.keys(requests[0].response_format.json_schema.schema.properties),
    ).toEqual(['turns']);
  });

  it('splits Hindi sentences at the danda', async () => {
    reply = { status: 200, body: turns([0, 'DOCTOR'], [1, 'PATIENT']) };

    const split = await splitSpeakers({ text: 'बुखार है? हाँ, दो दिन से।' });

    expect(requests[0].messages[1].content).toBe(
      '0: बुखार है?\n1: हाँ, दो दिन से।',
    );
    expect(split.patientText).toBe('हाँ, दो दिन से।');
  });

  it('labels timed segments and keeps their times on the turns', async () => {
    reply = { status: 200, body: turns([0, 'DOCTOR'], [2, 'PATIENT']) };

    const split = await splitSpeakers({
      text: 'ignored',
      segments: [
        { text: 'Hello.', start: 0.5, end: 1.5 },
        { text: 'Any pain?', start: 1.5, end: 2.5 },
        { text: 'In my knee.', start: 3, end: 4 },
      ],
    });

    expect(requests[0].messages[1].content).toBe(
      '0: Hello.\n1: Any pain?\n2: In my knee.',
    );
    expect(split.segments).toEqual([
      { speaker: 'DOCTOR', text: 'Hello. Any pain?', start_s: 0.5, end_s: 2.5 },
      { speaker: 'PATIENT', text: 'In my knee.', start_s: 3, end_s: 4 },
    ]);
  });

  it('reads turns in line order, and returns an empty split when the model marked none', async () => {
    reply = {
      status: 200,
      body: turns([2, 'DOCTOR'], [1, 'PATIENT'], [0, 'DOCTOR']),
    };
    expect(
      await splitSpeakers({ text: 'Any fever? Yes. Rest well.' }),
    ).toMatchObject({
      doctorText: 'Any fever? Rest well.',
      patientText: 'Yes.',
    });

    reply = { status: 200, body: completion('{}') };
    await expect(splitSpeakers({ text: 'Any fever? Yes.' })).resolves.toEqual({
      segments: [],
      doctorText: '',
      patientText: '',
    });
  });

  it('splits a line where a turn starts partway into it, from the words the model quotes', async () => {
    reply = {
      status: 200,
      body: turns(
        [0, 'DOCTOR'],
        [0, 'PATIENT', 'Three days'],
        [1, 'DOCTOR', 'Okay take this'],
      ),
    };

    const split = await splitSpeakers({
      text: 'how long has it hurt three days now. Okay take this twice a day.',
    });

    expect(split.segments.map(({ speaker, text }) => [speaker, text])).toEqual([
      ['DOCTOR', 'how long has it hurt'],
      ['PATIENT', 'three days now.'],
      ['DOCTOR', 'Okay take this twice a day.'],
    ]);
    expect(split.patientText).toBe('three days now.');
  });

  it('starts a turn at the line start when the quoted words are not in the line', async () => {
    reply = {
      status: 200,
      body: turns([0, 'DOCTOR'], [1, 'PATIENT', 'not in the text']),
    };

    const split = await splitSpeakers({
      text: 'Any fever? Yes, since Monday.',
    });

    expect(split.patientText).toBe('Yes, since Monday.');
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
