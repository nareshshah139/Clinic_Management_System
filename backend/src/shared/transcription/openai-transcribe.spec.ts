import { Logger } from '@nestjs/common';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { transcribeWithOpenAI } from './openai-transcribe';

interface Received {
  authorization?: string;
  fields: Record<string, string>;
  file?: { name: string; type: string; bytes: string };
}

describe('transcribeWithOpenAI against a local transcription endpoint', () => {
  let server: http.Server;
  let directory: string;
  let reply: { status: number; body: string };
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
      res.writeHead(reply.status, { 'content-type': 'application/json' }).end(reply.body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'transcribe-'));
    received = [];
    reply = { status: 200, body: '{"text":"BP 120 by 80","segments":[{"text":"BP 120 by 80","start":0,"end":1.5}]}' };
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
    fs.writeFileSync(file, 'RIFF fake wav');
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
    expect(received[0].file).toEqual({ name: 'audio.wav', type: 'audio/wav', bytes: 'RIFF fake wav' });
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
    reply = { status: 413, body: '{"error":"too large"}' };
    await expect(transcribeWithOpenAI(wav())).rejects.toMatchObject({
      status: 400, message: 'Speech transcription rejected the recording. Please retry with a shorter, clearer clip.',
    });
    reply = { status: 502, body: 'bad gateway' };
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
});
