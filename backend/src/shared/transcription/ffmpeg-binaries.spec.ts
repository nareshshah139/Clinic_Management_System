import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ffmpegBinaries, isFfmpegAvailable, resetFfmpegBinariesForTests } from './ffmpeg-binaries';

const savedEnv = { ...process.env };
let root: string;

function directory(name: string): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fake(dir: string, name: string, mode = 0o755): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, '#!/bin/sh\nexit 0\n', { mode });
  fs.chmodSync(file, mode);
  return file;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-binaries-'));
  delete process.env.FFMPEG_PATH;
  delete process.env.FFPROBE_PATH;
  process.env.PATH = directory('empty');
  resetFfmpegBinariesForTests();
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
  process.env = { ...savedEnv };
  resetFfmpegBinariesForTests();
});

describe('ffmpegBinaries', () => {
  it('prefers FFMPEG_PATH and FFPROBE_PATH over the system PATH', () => {
    const bin = directory('bin');
    fake(bin, 'ffmpeg');
    fake(bin, 'ffprobe');
    const custom = directory('custom');
    process.env.PATH = bin;
    process.env.FFMPEG_PATH = fake(custom, 'my-ffmpeg');
    process.env.FFPROBE_PATH = fake(custom, 'my-ffprobe');
    expect(ffmpegBinaries()).toEqual({
      ffmpeg: { source: 'env', path: path.join(custom, 'my-ffmpeg') },
      ffprobe: { source: 'env', path: path.join(custom, 'my-ffprobe') },
    });
  });

  it('reports a binary found on PATH as system', () => {
    const bin = directory('bin');
    fake(bin, 'ffmpeg');
    fake(bin, 'ffprobe');
    process.env.PATH = [directory('other'), bin].join(path.delimiter);
    expect(ffmpegBinaries()).toEqual({
      ffmpeg: { source: 'system', path: path.join(bin, 'ffmpeg') },
      ffprobe: { source: 'system', path: path.join(bin, 'ffprobe') },
    });
  });

  it('resolves the bundled binaries when neither env nor PATH has them, as on the Railway image', () => {
    const result = ffmpegBinaries();
    expect(result.ffmpeg.source).toBe('bundled');
    expect(result.ffprobe.source).toBe('bundled');
    for (const binary of [result.ffmpeg, result.ffprobe]) {
      expect(fs.existsSync(binary.path!)).toBe(true);
      expect(() => fs.accessSync(binary.path!, fs.constants.X_OK)).not.toThrow();
    }
  });

  it('falls through an env path that does not exist', () => {
    const bin = directory('bin');
    fake(bin, 'ffmpeg');
    fake(bin, 'ffprobe');
    process.env.PATH = bin;
    process.env.FFMPEG_PATH = path.join(root, 'nowhere', 'ffmpeg');
    process.env.FFPROBE_PATH = path.join(root, 'nowhere', 'ffprobe');
    expect(ffmpegBinaries().ffmpeg).toEqual({ source: 'system', path: path.join(bin, 'ffmpeg') });
    expect(ffmpegBinaries().ffprobe).toEqual({ source: 'system', path: path.join(bin, 'ffprobe') });
  });

  it('skips a non-executable file on PATH', () => {
    const bin = directory('bin');
    fake(bin, 'ffmpeg', 0o644);
    const good = directory('good');
    fake(good, 'ffmpeg');
    process.env.PATH = [bin, good].join(path.delimiter);
    expect(ffmpegBinaries().ffmpeg).toEqual({ source: 'system', path: path.join(good, 'ffmpeg') });
  });

  it('resolves once and logs the sources once', () => {
    ffmpegBinaries();
    process.env.PATH = directory('later');
    fake(process.env.PATH, 'ffmpeg');
    expect(ffmpegBinaries().ffmpeg.source).toBe('bundled');
    expect(jest.mocked(Logger.prototype.log).mock.calls.map((call) => call[0])).toEqual(['ffmpeg binaries ffmpeg=bundled ffprobe=bundled']);
    expect(Logger.prototype.warn).not.toHaveBeenCalled();
  });

  it('warns, and reports ffmpeg unavailable, when nothing resolves', () => {
    const unsupported = () => { throw new Error('Unsupported platform/architecture'); };
    jest.doMock('@ffmpeg-installer/ffmpeg', unsupported);
    jest.doMock('@ffprobe-installer/ffprobe', unsupported);
    try {
      jest.isolateModules(() => {
        const warn = jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation(() => undefined);
        const isolated = require('./ffmpeg-binaries') as typeof import('./ffmpeg-binaries');
        expect(isolated.ffmpegBinaries()).toEqual({ ffmpeg: { source: 'missing', path: null }, ffprobe: { source: 'missing', path: null } });
        expect(isolated.isFfmpegAvailable()).toBe(false);
        expect(warn.mock.calls.map((call) => call[0])).toEqual(['ffmpeg binaries ffmpeg=missing ffprobe=missing']);
      });
    } finally {
      jest.dontMock('@ffmpeg-installer/ffmpeg');
      jest.dontMock('@ffprobe-installer/ffprobe');
    }
  });

  it('is available when both binaries resolve', () => {
    expect(isFfmpegAvailable()).toBe(true);
  });
});
