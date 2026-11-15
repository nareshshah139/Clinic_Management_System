import { Logger } from '@nestjs/common';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { chooseConsensusTranscript, planTranscriptionSegments, transcribeWithOpenAI } from './openai-transcribe';

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

describe('chooseConsensusTranscript', () => {
  const ofLength = (n: number, letter = 'a') => letter.repeat(n);

  it('keeps the first of two samples whose lengths are within 15%', () => {
    expect(chooseConsensusTranscript([ofLength(1600, 'a'), ofLength(1800, 'b')])).toEqual({ decision: 'agree', index: 0, text: ofLength(1600, 'a') });
    expect(chooseConsensusTranscript([ofLength(1600), ofLength(1900)])).toEqual({ decision: 'disagree' });
  });

  it('lets short samples differ by up to 40 chars', () => {
    expect(chooseConsensusTranscript([ofLength(10, 'a'), ofLength(50, 'b')])).toEqual({ decision: 'agree', index: 0, text: ofLength(10, 'a') });
    expect(chooseConsensusTranscript([ofLength(10), ofLength(51)])).toEqual({ decision: 'disagree' });
  });

  it('treats two empty transcripts of silence as agreeing', () => {
    expect(chooseConsensusTranscript(['', ' '])).toEqual({ decision: 'agree', index: 0, text: '' });
  });

  it('flags an invented passage and a truncated fragment as disagreeing', () => {
    expect(chooseConsensusTranscript([ofLength(1600), ofLength(2400)])).toEqual({ decision: 'disagree' });
    expect(chooseConsensusTranscript([ofLength(1600), ofLength(220)])).toEqual({ decision: 'disagree' });
  });

  it('keeps the median length of three samples', () => {
    expect(chooseConsensusTranscript([ofLength(1600, 'a'), ofLength(2400, 'b'), ofLength(1610, 'c')]))
      .toEqual({ decision: 'median-of-3', index: 2, text: ofLength(1610, 'c') });
    expect(chooseConsensusTranscript([ofLength(1600, 'a'), ofLength(220, 'b'), ofLength(1605, 'c')]))
      .toEqual({ decision: 'median-of-3', index: 0, text: ofLength(1600, 'a') });
  });
});

describe('transcribeWithOpenAI against a local transcription endpoint', () => {
  let server: http.Server;
  let directory: string;
  let respond: (upload: Received, arrival: number) => Reply;
  let received: Received[];
  let inFlight: number;
  let maxInFlight: number;
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      res.on('finish', () => { inFlight--; });
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
    inFlight = 0;
    maxInFlight = 0;
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

  it('uploads the audio twice with the model, prompt and json format for gpt-4o-transcribe, and returns the agreed text and segments', async () => {
    process.env.OPENAI_TRANSCRIBE_LANGUAGE = ' en ';
    await expect(transcribeWithOpenAI(wav())).resolves.toEqual({
      text: 'BP 120 by 80',
      segments: [{ text: 'BP 120 by 80', start: 0, end: 1.5 }],
    });
    expect(received).toHaveLength(2);
    for (const upload of received) {
      expect(upload.authorization).toBe('Bearer sk-test');
      expect(upload.file).toEqual({ name: 'audio.wav', type: 'audio/wav', bytes: fs.readFileSync(path.join(directory, 'audio.wav')).toString('latin1') });
      expect(upload.fields).toMatchObject({ model: 'gpt-4o-transcribe', language: 'en', temperature: '0', response_format: 'json', chunking_strategy: '{"type":"server_vad","silence_duration_ms":800,"prefix_padding_ms":500}' });
      expect(upload.fields.prompt).toBe('Outpatient clinic in India. Speakers use Indian English and sometimes Hindi or Telugu words.');
      // Example values in the prompt were transcribed back as invented speech; keep it free of numbers and clinical terms.
      expect(upload.fields.prompt).not.toMatch(/\d|\bmg\b|mmHg|heart rate|azithromycin|\bdoctor\b|\bpatient\b/i);
    }
  });

  it('asks whisper models for verbose_json so diarization gets timed segments', async () => {
    process.env.OPENAI_TRANSCRIBE_MODEL = 'whisper-1';
    await transcribeWithOpenAI(wav());
    expect(received[0].fields).toMatchObject({ model: 'whisper-1', response_format: 'verbose_json' });
    expect(received[0].fields.chunking_strategy).toBeUndefined();
  });

  it('keeps the segments of the whisper sample the consensus chose', async () => {
    process.env.OPENAI_TRANSCRIBE_MODEL = 'whisper-1';
    const TRUE = 'Cough for three days, no fever, BP 120 by 80.';
    const INVENTED = `${TRUE} Doctor: Good morning, how are you feeling today? Your heart rate is 72.`;
    respond = (_upload, arrival) => (arrival === 0
      ? { status: 200, body: JSON.stringify({ text: INVENTED, segments: [{ text: TRUE, start: 0, end: 3 }, { text: 'Doctor: Good morning', start: 3, end: 6 }] }) }
      : { status: 200, body: JSON.stringify({ text: TRUE, segments: [{ text: TRUE, start: 0, end: 3.2 }] }) });
    await expect(transcribeWithOpenAI(wav())).resolves.toEqual({ text: TRUE, segments: [{ text: TRUE, start: 0, end: 3.2 }] });
    expect(received).toHaveLength(3);
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

    const FILLER = 'x'.repeat(200);

    beforeEach(() => {
      process.env.OPENAI_TRANSCRIBE_SEGMENT_SECONDS = '60';
      respond = (upload, arrival) => ({
        status: 200,
        body: JSON.stringify({ text: ` ${uploadSeconds(upload).toFixed(1)}s ${FILLER} `, segments: [{ text: 'part', start: 0.5, end: 2 }] }),
        delayMs: (8 - arrival) * 20,
      });
    });

    it('transcribes each 16 kHz mono part twice, split at silences, and joins them in recording order', async () => {
      await expect(transcribeWithOpenAI(recording('webm'))).resolves.toMatchObject({
        text: ['49.5s', '65.0s', '63.0s', '52.5s'].map((seconds) => `${seconds} ${FILLER}`).join(' '),
      });
      expect(received.map((upload) => {
        const header = Buffer.from(upload.file!.bytes, 'latin1');
        return [upload.file?.type, header.readUInt16LE(22), header.readUInt32LE(24), upload.fields.model, upload.fields.response_format];
      })).toEqual(Array(8).fill(['audio/wav', 1, 16000, 'gpt-4o-transcribe', 'json']));
      expect(received.map((upload) => upload.file?.name).sort()).toEqual([
        'consult.part0.wav', 'consult.part0.wav', 'consult.part1.wav', 'consult.part1.wav',
        'consult.part2.wav', 'consult.part2.wav', 'consult.part3.wav', 'consult.part3.wav',
      ]);
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

    it('never has more requests in flight than OPENAI_TRANSCRIBE_CONCURRENCY', async () => {
      process.env.OPENAI_TRANSCRIBE_CONCURRENCY = '2';
      const healthy = respond;
      respond = (upload, arrival) => ({ ...healthy(upload, arrival), delayMs: 50 });
      await transcribeWithOpenAI(recording('wav'));
      expect(received).toHaveLength(8);
      expect(maxInFlight).toBe(2);
    });

    describe('consensus across two requests per part', () => {
      // 200 s of tone without silences, cut at 60 and 120 s into three parts.
      const tone = () => {
        const file = path.join(directory, 'tone.wav');
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=200', '-ar', '16000', '-ac', '1', file]);
        return { path: file, mimetype: 'audio/wav', filename: 'tone.wav' };
      };
      const TRUE: Record<string, string> = {
        'tone.part0.wav': 'Patient reports a dry cough for three days and mild throat pain at night.',
        'tone.part1.wav': 'No fever, no breathlessness. Blood pressure 120/80 mmHg, pulse 88 per minute.',
        'tone.part2.wav': 'Advised steam inhalation, warm fluids and review after five days if not better.',
      };
      const JOINED =
        'Patient reports a dry cough for three days and mild throat pain at night. ' +
        'No fever, no breathlessness. Blood pressure 120/80 mmHg, pulse 88 per minute. ' +
        'Advised steam inhalation, warm fluids and review after five days if not better.';
      const text = (value: string) => ({ status: 200, body: JSON.stringify({ text: value, segments: [] }) });
      const name = (upload: Received) => upload.file!.name;
      const uploadsOf = (part: string) => received.filter((upload) => name(upload) === part).length;
      // Serves `faulty` as the first reply for part 1 and the true text everywhere else.
      const faultOnFirstPart1Reply = (faulty: string) => {
        let served = false;
        respond = (upload) => {
          if (name(upload) === 'tone.part1.wav' && !served) {
            served = true;
            return text(faulty);
          }
          return text(TRUE[name(upload)]);
        };
      };

      it('uses the agreed text with two uploads per part', async () => {
        respond = (upload) => text(TRUE[name(upload)]);
        await expect(transcribeWithOpenAI(tone())).resolves.toEqual({ text: JOINED, segments: [] });
        expect([uploadsOf('tone.part0.wav'), uploadsOf('tone.part1.wav'), uploadsOf('tone.part2.wav')]).toEqual([2, 2, 2]);
      });

      it('drops an invented consultation passage by asking a third time', async () => {
        faultOnFirstPart1Reply(
          `${TRUE['tone.part1.wav']} Doctor: Good morning, how are you feeling today? Your heart rate is 72. ` +
            "I'll prescribe azithromycin 500 mg once daily.",
        );
        await expect(transcribeWithOpenAI(tone())).resolves.toEqual({ text: JOINED, segments: [] });
        expect([uploadsOf('tone.part0.wav'), uploadsOf('tone.part1.wav'), uploadsOf('tone.part2.wav')]).toEqual([2, 3, 2]);
      });

      it('drops a truncated fragment by asking a third time', async () => {
        faultOnFirstPart1Reply('No fever, ');
        await expect(transcribeWithOpenAI(tone())).resolves.toEqual({ text: JOINED, segments: [] });
        expect([uploadsOf('tone.part0.wav'), uploadsOf('tone.part1.wav'), uploadsOf('tone.part2.wav')]).toEqual([2, 3, 2]);
      });

      it('applies the same consensus to a single-request recording', async () => {
        process.env.OPENAI_TRANSCRIBE_SEGMENT_SECONDS = '170';
        let served = false;
        respond = () => {
          if (served) return text(TRUE['tone.part0.wav']);
          served = true;
          return text('Patient re');
        };
        await expect(transcribeWithOpenAI(tone())).resolves.toEqual({ text: TRUE['tone.part0.wav'], segments: [] });
        expect(received.map(name)).toEqual(['tone.wav', 'tone.wav', 'tone.wav']);
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
