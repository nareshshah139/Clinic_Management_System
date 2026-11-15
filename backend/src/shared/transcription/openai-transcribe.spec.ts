import { Logger } from '@nestjs/common';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { looksTruncated, planTranscriptionSegments, transcribeWithOpenAI, voicedSeconds } from './openai-transcribe';

interface Reply {
  status: number;
  body: string;
  delayMs?: number;
}

interface Received {
  authorization?: string;
  fields: Record<string, string>;
  file?: { name: string; type: string; bytes: string };
}

describe('planTranscriptionSegments', () => {
  const options = { targetS: 300, searchWindowS: 45 };

  it('cuts at the midpoint of the latest silence before each 300 s mark', () => {
    expect(planTranscriptionSegments(650, [{ start: 280, end: 281 }, { start: 590, end: 592 }], options)).toEqual([
      { start: 0, end: 280.5 },
      { start: 280.5, end: 591 },
      { start: 591, end: 650 },
    ]);
  });

  it('prefers the latest of several silences in the window', () => {
    expect(planTranscriptionSegments(400, [{ start: 260, end: 261 }, { start: 290, end: 292 }], options)).toEqual([
      { start: 0, end: 291 },
      { start: 291, end: 400 },
    ]);
  });

  it('cuts hard at each 300 s mark when there is no silence', () => {
    expect(planTranscriptionSegments(650, [], options)).toEqual([
      { start: 0, end: 300 },
      { start: 300, end: 600 },
      { start: 600, end: 650 },
    ]);
  });

  it('ignores silences before the 45 s window or after the mark', () => {
    expect(planTranscriptionSegments(650, [{ start: 200, end: 202 }, { start: 310, end: 312 }], options)).toEqual([
      { start: 0, end: 300 },
      { start: 300, end: 600 },
      { start: 600, end: 650 },
    ]);
  });

  it('keeps audio up to target plus window as one segment', () => {
    expect(planTranscriptionSegments(345, [{ start: 280, end: 281 }], options)).toEqual([{ start: 0, end: 345 }]);
  });
});

describe('looksTruncated', () => {
  it('flags fewer than 2 chars per voiced second once there are at least 20 voiced seconds', () => {
    expect(looksTruncated(39, 20)).toBe(true);
    expect(looksTruncated(40, 20)).toBe(false);
    expect(looksTruncated(223, 300)).toBe(true);
    expect(looksTruncated(2900, 300)).toBe(false);
  });

  it('never flags under 20 voiced seconds', () => {
    expect(looksTruncated(0, 19.9)).toBe(false);
    expect(looksTruncated(0, 20)).toBe(true);
  });
});

describe('voicedSeconds', () => {
  it('subtracts the overlap of silences with the span', () => {
    const silences = [{ start: 10, end: 12 }, { start: 95, end: 105 }, { start: 200, end: 210 }];
    expect(voicedSeconds({ start: 0, end: 100 }, silences)).toBe(93);
    expect(voicedSeconds({ start: 100, end: 150 }, silences)).toBe(45);
    expect(voicedSeconds({ start: 20, end: 90 }, silences)).toBe(70);
  });

  it('is zero for a span that is entirely silent', () => {
    expect(voicedSeconds({ start: 5, end: 8 }, [{ start: 0, end: 10 }])).toBe(0);
  });
});

describe('transcribeWithOpenAI against a local transcription endpoint', () => {
  let server: http.Server;
  let directory: string;
  let respond: (upload: Received, arrival: number) => Reply;
  let received: Received[];
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers['content-type'] ?? '' } }).formData();
      const entry: Received = { authorization: req.headers.authorization, fields: {} };
      for (const [key, value] of form.entries()) {
        if (typeof value === 'string') entry.fields[key] = value;
        else entry.file = { name: value.name, type: value.type, bytes: Buffer.from(await value.arrayBuffer()).toString('latin1') };
      }
      received.push(entry);
      const reply = respond(entry, received.length - 1);
      if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
      res.writeHead(reply.status, { 'content-type': 'application/json' }).end(reply.body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-'));
    received = [];
    respond = () => ({ status: 200, body: '{"text":"BP 120 by 80","segments":[{"text":"BP 120 by 80","start":0,"end":1.5}]}' });
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENAI_TRANSCRIBE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/audio/transcriptions`;
    delete process.env.OPENAI_TRANSCRIBE_MODEL;
    delete process.env.OPENAI_TRANSCRIBE_LANGUAGE;
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
    process.env = { ...savedEnv };
  });

  const wav = () => {
    const file = path.join(directory, 'audio.wav');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-ar', '16000', '-ac', '1', file]);
    return { path: file, mimetype: 'audio/wav', filename: 'audio.wav' };
  };

  it('uploads the audio with the model, prompt and json format for gpt-4o-transcribe, and returns text and segments', async () => {
    process.env.OPENAI_TRANSCRIBE_LANGUAGE = ' en ';
    await expect(transcribeWithOpenAI(wav())).resolves.toEqual({
      text: 'BP 120 by 80',
      segments: [{ text: 'BP 120 by 80', start: 0, end: 1.5 }],
    });
    expect(received).toHaveLength(1);
    expect(received[0].authorization).toBe('Bearer sk-test');
    expect(received[0].file).toEqual({ name: 'audio.wav', type: 'audio/wav', bytes: fs.readFileSync(path.join(directory, 'audio.wav')).toString('latin1') });
    expect(received[0].fields).toMatchObject({ model: 'gpt-4o-transcribe', language: 'en', temperature: '0', response_format: 'json' });
    expect(received[0].fields.prompt).toMatch(/^Medical doctor–patient conversation transcription\./);
  });

  it('asks whisper models for verbose_json so diarization gets timed segments', async () => {
    process.env.OPENAI_TRANSCRIBE_MODEL = 'whisper-1';
    await transcribeWithOpenAI(wav());
    expect(received[0].fields).toMatchObject({ model: 'whisper-1', response_format: 'verbose_json' });
  });

  it('converts webm to 16 kHz mono wav before uploading and removes the converted file', async () => {
    const webm = path.join(directory, 'audio.webm');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-c:a', 'libopus', webm]);
    await transcribeWithOpenAI({ path: webm, mimetype: 'audio/webm', filename: 'audio.webm' });
    expect(received[0].file?.name).toBe('audio.wav');
    expect(received[0].file?.type).toBe('audio/wav');
    const header = Buffer.from(received[0].file!.bytes, 'latin1');
    expect(header.toString('latin1', 0, 4)).toBe('RIFF');
    expect(header.readUInt16LE(22)).toBe(1);
    expect(header.readUInt32LE(24)).toBe(16000);
    expect(fs.readdirSync(directory)).toEqual(['audio.webm']);
  });

  it('400s when webm conversion fails, without uploading', async () => {
    const webm = path.join(directory, 'audio.webm');
    fs.writeFileSync(webm, 'not webm');
    await expect(transcribeWithOpenAI({ path: webm, mimetype: 'audio/webm', filename: 'audio.webm' }))
      .rejects.toMatchObject({ status: 400 });
    expect(received).toHaveLength(0);
  });

  it('maps a 4xx from OpenAI to 400 and a 5xx to 503', async () => {
    respond = () => ({ status: 413, body: '{"error":"too large"}' });
    await expect(transcribeWithOpenAI(wav())).rejects.toMatchObject({
      status: 400, message: 'Speech transcription rejected the recording. Please retry with a shorter, clearer clip.',
    });
    respond = () => ({ status: 502, body: 'bad gateway' });
    await expect(transcribeWithOpenAI(wav())).rejects.toMatchObject({
      status: 503, message: 'Speech transcription service is temporarily unavailable. Please try again.',
    });
  });

  it('503s without an API key, without uploading', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(transcribeWithOpenAI(wav())).rejects.toMatchObject({
      status: 503, message: 'Speech transcription is unavailable. Contact an administrator to configure OPENAI_API_KEY.',
    });
    expect(received).toHaveLength(0);
  });
  describe('a recording longer than one segment', () => {
    // 230 s of tone with 1 s silences at 49, 114 and 177 s. With 60 s segments it splits at those silences into
    // parts of 49.5, 65, 63 and 52.5 s.
    const recording = (extension: 'wav' | 'webm') => {
      const file = path.join(directory, `consult.${extension}`);
      const tone = 'if(between(t,49,50)+between(t,114,115)+between(t,177,178),0,0.5*sin(2*PI*440*t))';
      execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc='${tone}':s=16000:d=230`,
        ...(extension === 'webm' ? ['-c:a', 'libopus'] : []), file]);
      return { path: file, mimetype: `audio/${extension}`, filename: `consult.${extension}` };
    };
    const uploadSeconds = (upload: Received) => {
      const wavBytes = Buffer.from(upload.file!.bytes, 'latin1');
      const byteRate = wavBytes.readUInt32LE(28);
      for (let offset = 12; offset < wavBytes.length; offset += 8 + wavBytes.readUInt32LE(offset + 4)) {
        if (wavBytes.toString('latin1', offset, offset + 4) === 'data') return wavBytes.readUInt32LE(offset + 4) / byteRate;
      }
      throw new Error('no data chunk');
    };

    // Long enough (200 chars for 50-65 voiced seconds) that the truncation guard does not retry.
    const FILLER = 'x'.repeat(200);

    beforeEach(() => {
      process.env.OPENAI_TRANSCRIBE_SEGMENT_SECONDS = '60';
      respond = (upload, arrival) => ({
        status: 200,
        body: JSON.stringify({ text: ` ${uploadSeconds(upload).toFixed(1)}s ${FILLER} `, segments: [{ text: 'part', start: 0.5, end: 2 }] }),
        delayMs: (4 - arrival) * 40,
      });
    });

    it('transcribes 16 kHz mono parts split at silences and joins them in recording order', async () => {
      await expect(transcribeWithOpenAI(recording('webm'))).resolves.toMatchObject({
        text: ['49.5s', '65.0s', '63.0s', '52.5s'].map((seconds) => `${seconds} ${FILLER}`).join(' '),
      });
      expect(received.map((upload) => {
        const header = Buffer.from(upload.file!.bytes, 'latin1');
        return [upload.file?.type, header.readUInt16LE(22), header.readUInt32LE(24), upload.fields.model, upload.fields.response_format];
      })).toEqual(Array(4).fill(['audio/wav', 1, 16000, 'gpt-4o-transcribe', 'json']));
      expect(received.map((upload) => upload.file?.name).sort()).toEqual(
        ['consult.part0.wav', 'consult.part1.wav', 'consult.part2.wav', 'consult.part3.wav'],
      );
      expect(fs.readdirSync(directory)).toEqual(['consult.webm']);
    });

    it('shifts whisper segment times by where each part starts in the recording', async () => {
      process.env.OPENAI_TRANSCRIBE_MODEL = 'whisper-1';
      const { segments } = await transcribeWithOpenAI(recording('wav'));
      expect((segments as Array<{ start: number; end: number }>).map(({ start, end }) => [start, end].map((s) => Math.round(s * 10) / 10)))
        .toEqual([[0.5, 2], [50, 51.5], [115, 116.5], [178, 179.5]]);
    });

    it('fails the whole call when one part fails, and leaves no part files behind', async () => {
      const healthy = respond;
      respond = (upload, arrival) => (uploadSeconds(upload).toFixed(1) === '65.0' ? { status: 502, body: 'bad gateway' } : healthy(upload, arrival));
      await expect(transcribeWithOpenAI(recording('wav'))).rejects.toMatchObject({
        status: 503, message: 'Speech transcription service is temporarily unavailable. Please try again.',
      });
      expect(fs.readdirSync(directory)).toEqual(['consult.wav']);
    });

    describe('truncation guard', () => {
      const FULL = 'full transcript '.repeat(20).trim();
      const SHORT = 'cut off ab';
      const tone = () => {
        const file = path.join(directory, 'tone.wav');
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=200', '-ar', '16000', '-ac', '1', file]);
        return { path: file, mimetype: 'audio/wav', filename: 'tone.wav' };
      };
      const text = (value: string) => ({ status: 200, body: JSON.stringify({ text: value, segments: [] }), delayMs: 0 });
      const partName = (upload: Received) => upload.file?.name;

      it('retries a short part once without the prompt and keeps the full retry', async () => {
        let shortServed = false;
        respond = (upload) => {
          if (partName(upload) === 'tone.part1.wav' && 'prompt' in upload.fields && !shortServed) {
            shortServed = true;
            return text(SHORT);
          }
          return text(FULL);
        };
        const result = await transcribeWithOpenAI(tone());
        expect(result.text.split(' ').filter((word) => word === 'transcript')).toHaveLength(60);
        expect(result.text).not.toContain(SHORT);
        expect(received).toHaveLength(4);
        const part1 = received.filter((upload) => partName(upload) === 'tone.part1.wav');
        expect(part1).toHaveLength(2);
        expect(part1.filter((upload) => 'prompt' in upload.fields)).toHaveLength(1);
        expect(part1.filter((upload) => !('prompt' in upload.fields))).toHaveLength(1);
      });

      it('keeps the longer of two short results and still succeeds', async () => {
        respond = (upload) => {
          if (partName(upload) !== 'tone.part1.wav') return text(FULL);
          return text('prompt' in upload.fields ? SHORT : 'slightly longer cut');
        };
        const result = await transcribeWithOpenAI(tone());
        expect(result.text).toContain('slightly longer cut');
        expect(result.text).not.toContain(SHORT);
        expect(received).toHaveLength(4);
      });

      it('guards a single-request recording too', async () => {
        process.env.OPENAI_TRANSCRIBE_SEGMENT_SECONDS = '170';
        respond = (upload) => text('prompt' in upload.fields ? SHORT : FULL);
        await expect(transcribeWithOpenAI(tone())).resolves.toMatchObject({ text: FULL });
        expect(received).toHaveLength(2);
      });
    });

    it('400s a recording over OPENAI_TRANSCRIBE_MAX_SECONDS without uploading', async () => {
      process.env.OPENAI_TRANSCRIBE_MAX_SECONDS = '120';
      await expect(transcribeWithOpenAI(recording('wav'))).rejects.toMatchObject({
        status: 400,
        message: 'This recording is 4 minutes long. Speech transcription accepts up to 2 minutes; please record in shorter parts.',
      });
      expect(received).toHaveLength(0);
    });
  });
});
