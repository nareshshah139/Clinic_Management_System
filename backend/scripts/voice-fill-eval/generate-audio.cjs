#!/usr/bin/env node
// Renders each eval case to webm/opus (what Chrome's MediaRecorder produces) with espeak-ng.
// Synthetic speech is clearer and less accented than a real clinic; treat scores as an upper bound.
// Usage: node generate-audio.cjs <out-dir>
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(process.argv[2] || 'voice-fill-eval-audio');
fs.mkdirSync(outDir, { recursive: true });
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
const voices = ['en-gb', 'en-us'];

cases.forEach((c, index) => {
  const wav = path.join(outDir, `${c.id}.wav`);
  const webm = path.join(outDir, `${c.id}.webm`);
  execFileSync('espeak-ng', ['-v', voices[index % voices.length], '-s', '150', '-w', wav, c.say]);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', wav, '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k', webm]);
  fs.rmSync(wav);
  console.log(`${c.id}.webm`);
});
