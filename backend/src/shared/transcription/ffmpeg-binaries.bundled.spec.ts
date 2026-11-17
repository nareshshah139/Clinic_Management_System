import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';

type Transcribe = typeof import('./openai-transcribe').transcribeWithOpenAI;
type Binaries = typeof import('./ffmpeg-binaries').ffmpegBinaries;

const bundledFfmpeg: string = require('@ffmpeg-installer/ffmpeg').path;
const savedEnv = { ...process.env };

describe('transcription on a host without ffmpeg', () => {
  let server: http.Server;
  let uploads: Array<{ name: string; bytes: Buffer }>;
  let directory: string;
  let transcribe: Transcribe;
  let binaries: Binaries;

  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const form = await new Response(Buffer.concat(chunks), { headers: { 'content-type': req.headers['content-type'] ?? '' } }).formData();
      const file = form.get('file') as File;
      uploads.push({ name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"text":"hello"}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });
  afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

  beforeEach(() => {
    uploads = [];
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bundled-ffmpeg-'));
    process.env.PATH = fs.mkdtempSync(path.join(directory, 'empty-path-'));
    delete process.env.FFMPEG_PATH;
    delete process.env.FFPROBE_PATH;
    process.env.OPENAI_API_KEY = 'dummy';
    process.env.OPENAI_TRANSCRIBE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/audio/transcriptions`;
    delete process.env.OPENAI_TRANSCRIBE_MODEL;
    jest.isolateModules(() => {
      require('@nestjs/common').Logger.overrideLogger(false);
      transcribe = require('./openai-transcribe').transcribeWithOpenAI;
      binaries = require('./ffmpeg-binaries').ffmpegBinaries;
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
    process.env = { ...savedEnv };
  });

  const webm = (seconds: number, silences: Array<[number, number]> = []) => {
    const file = path.join(directory, 'consult.webm');
    const mute = silences.map(([from, to]) => `between(t,${from},${to})`).join('+') || '0';
    execFileSync(bundledFfmpeg, ['-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc='if(${mute},0,0.5*sin(2*PI*440*t))':s=16000:d=${seconds}`, '-c:a', 'libopus', file]);
    return { path: file, mimetype: 'audio/webm', filename: 'consult.webm' };
  };

  const wavFormat = (bytes: Buffer) => [bytes.toString('latin1', 0, 4), bytes.readUInt16LE(22), bytes.readUInt32LE(24)];

  it('resolves the bundled binaries', () => {
    expect(binaries().ffmpeg.source).toBe('bundled');
    expect(binaries().ffprobe.source).toBe('bundled');
  });

  it('converts a short webm to 16 kHz mono wav, probes it and transcribes it', async () => {
    await expect(transcribe(webm(2))).resolves.toEqual({ text: 'hello', segments: [] });
    expect(uploads.map((upload) => upload.name)).toEqual(['consult.wav', 'consult.wav']);
    expect(wavFormat(uploads[0].bytes)).toEqual(['RIFF', 1, 16000]);
    const byteRate = uploads[0].bytes.readUInt32LE(28);
    expect(Math.abs((uploads[0].bytes.length - 44) / byteRate - 2)).toBeLessThan(0.2);
    expect(fs.readdirSync(directory).filter((name) => name.endsWith('.wav'))).toEqual([]);
  });

  it('detects silences and splits a long recording into parts', async () => {
    process.env.OPENAI_TRANSCRIBE_SEGMENT_SECONDS = '10';
    const result = await transcribe(webm(70, [[9, 10], [30, 31], [50, 51]]));
    expect(result.text).toMatch(/^hello( hello)+$/);
    expect([...new Set(uploads.map((upload) => upload.name))].sort().slice(0, 2)).toEqual(['consult.part0.wav', 'consult.part1.wav']);
    expect(uploads.every((upload) => wavFormat(upload.bytes).join() === 'RIFF,1,16000')).toBe(true);
  });
});
