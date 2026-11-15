#!/usr/bin/env node
// Renders eval scripts to webm/opus at 32 kbps, matching what the app's recorder uploads.
// Synthetic speech is clearer and less accented than a real clinic; treat scores as an upper bound.
// Usage: node generate-audio.cjs <out-dir> [--set cases|conversations] [--noise]
//   --noise also writes <id>-noisy.webm with brown noise mixed in about 20 dB under the speech.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) || 'voice-fill-eval-audio');
const set = args.includes('--set') ? args[args.indexOf('--set') + 1] : 'cases';
const withNoise = args.includes('--noise');
fs.mkdirSync(outDir, { recursive: true });

const VOICES = {
  doctor: ['en-gb', 150],
  patient: ['en-us+f3', 160],
  attendant: ['en-gb-x-rp+m4', 155],
  receptionist: ['en-029+f2', 160],
  pharmacist: ['en-gb-scotland', 150],
  narrator: ['en-us', 150],
};
const ffmpeg = (...a) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...a]);

function speak(text, speaker, wav) {
  const [voice, rate] = VOICES[speaker] || VOICES.narrator;
  execFileSync('espeak-ng', ['-v', voice, '-s', String(rate), '-w', wav, text]);
  ffmpeg('-i', wav, '-ac', '1', '-ar', '48000', `${wav}.48k.wav`);
  fs.renameSync(`${wav}.48k.wav`, wav);
}

function render(id, turns) {
  const work = fs.mkdtempSync(path.join(outDir, `.${id}-`));
  const silence = path.join(work, 'gap.wav');
  ffmpeg('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '0.45', silence);
  const list = [];
  turns.forEach((turn, i) => {
    const wav = path.join(work, `t${String(i).padStart(4, '0')}.wav`);
    speak(turn.text, turn.speaker, wav);
    list.push(`file '${wav}'`, `file '${silence}'`);
  });
  fs.writeFileSync(path.join(work, 'list.txt'), list.join('\n'));
  const joined = path.join(work, 'joined.wav');
  ffmpeg('-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', joined);
  const webm = path.join(outDir, `${id}.webm`);
  ffmpeg('-i', joined, '-c:a', 'libopus', '-b:a', '32k', webm);
  if (withNoise) {
    ffmpeg('-i', joined, '-f', 'lavfi', '-i', 'anoisesrc=color=brown:amplitude=0.06:r=48000',
      '-filter_complex', '[0][1]amix=inputs=2:duration=first:normalize=0', '-ac', '1', '-c:a', 'libopus', '-b:a', '32k',
      path.join(outDir, `${id}-noisy.webm`));
  }
  fs.rmSync(work, { recursive: true, force: true });
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm]).toString());
  console.log(`${id}.webm ${(seconds / 60).toFixed(1)} min`);
}

if (set === 'conversations') {
  const dir = path.join(__dirname, 'conversations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const c = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    render(c.id, c.turns);
  }
} else {
  const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
  cases.forEach((c, i) => render(c.id, [{ speaker: i % 2 ? 'narrator' : 'doctor', text: c.say }]));
}
