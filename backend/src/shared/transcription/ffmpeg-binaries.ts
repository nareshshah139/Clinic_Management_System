import { Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs';
import * as path from 'path';

export type BinarySource = 'env' | 'system' | 'bundled' | 'missing';

export interface ResolvedBinary {
  source: BinarySource;
  path: string | null;
}

export interface FfmpegBinaries {
  ffmpeg: ResolvedBinary;
  ffprobe: ResolvedBinary;
}

interface BinarySpec {
  envVar: string;
  name: string;
  bundledPackage: string;
}

const FFMPEG: BinarySpec = { envVar: 'FFMPEG_PATH', name: 'ffmpeg', bundledPackage: '@ffmpeg-installer/ffmpeg' };
const FFPROBE: BinarySpec = { envVar: 'FFPROBE_PATH', name: 'ffprobe', bundledPackage: '@ffprobe-installer/ffprobe' };

const logger = new Logger('FfmpegBinaries');

function isExecutableFile(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function findOnPath(name: string): string | null {
  const executable = process.platform === 'win32' ? `${name}.exe` : name;
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, executable);
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
}

function findBundled(packageName: string): string | null {
  let file: unknown;
  try {
    file = require(packageName).path;
  } catch {
    return null;
  }
  if (typeof file !== 'string') return null;
  if (!isExecutableFile(file)) {
    try {
      fs.chmodSync(file, 0o755);
    } catch {
      return null;
    }
  }
  return isExecutableFile(file) ? file : null;
}

function resolveBinary(spec: BinarySpec): ResolvedBinary {
  const fromEnv = process.env[spec.envVar];
  if (fromEnv && isExecutableFile(fromEnv)) return { source: 'env', path: fromEnv };
  const system = findOnPath(spec.name);
  if (system) return { source: 'system', path: system };
  const bundled = findBundled(spec.bundledPackage);
  if (bundled) return { source: 'bundled', path: bundled };
  return { source: 'missing', path: null };
}

let resolved: FfmpegBinaries | undefined;

/**
 * @cc [owner:nareshshah139,label:reliability] transcription-carries-its-own-ffmpeg
 * Speech transcription MUST find ffmpeg and ffprobe from FFMPEG_PATH and FFPROBE_PATH, else the system PATH, else the binaries bundled with the backend, so a deploy image without ffmpeg can still convert recordings, and MUST log which source it used.
 */
export function ffmpegBinaries(): FfmpegBinaries {
  if (resolved) return resolved;
  const binaries: FfmpegBinaries = { ffmpeg: resolveBinary(FFMPEG), ffprobe: resolveBinary(FFPROBE) };
  if (binaries.ffmpeg.path) ffmpeg.setFfmpegPath(binaries.ffmpeg.path);
  if (binaries.ffprobe.path) ffmpeg.setFfprobePath(binaries.ffprobe.path);
  resolved = binaries;
  const summary = `ffmpeg binaries ffmpeg=${binaries.ffmpeg.source} ffprobe=${binaries.ffprobe.source}`;
  if (binaries.ffmpeg.source === 'missing' || binaries.ffprobe.source === 'missing') logger.warn(summary);
  else logger.log(summary);
  return binaries;
}

export function isFfmpegAvailable(): boolean {
  const { ffmpeg: converter, ffprobe: prober } = ffmpegBinaries();
  return converter.source !== 'missing' && prober.source !== 'missing';
}

export function resetFfmpegBinariesForTests(): void {
  resolved = undefined;
}
