#!/usr/bin/env node
// Renders eval scripts to webm/opus at 32 kbps, matching what the app's recorder uploads.
// Usage: node generate-audio.cjs <out-dir> [--set cases|commands|conversations] [--voice <name>] [--noise] [--only id,id]
//   --voice espeak (default) | espeak-hi | telugu | hindi | tamil | mumbai
//   espeak voices are robotic and vendor-independent. The named Indian accents use OpenAI gpt-4o-mini-tts
//   (needs an OpenAI key on api.openai.com); the same vendor transcribes, so treat those scores as optimistic.
//   --noise also writes <id>-noisy.webm with brown noise about 20 dB under the speech.
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const run = promisify(execFile);
const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = path.resolve(args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) || 'voice-fill-eval-audio');
const set = flag('--set', 'cases');
const voiceName = flag('--voice', 'espeak');
const only = flag('--only', '')?.split(',').filter(Boolean);
const withNoise = args.includes('--noise');
if (!voiceName.startsWith('espeak') && process.env.VOICE_FILL_EVAL !== 'paid') {
  console.error('Accented voices call paid OpenAI speech generation. Set VOICE_FILL_EVAL=paid to run.');
  process.exit(1);
}
const cacheDir = path.join(outDir, '.tts-cache');
fs.mkdirSync(cacheDir, { recursive: true });

const ESPEAK = {
  doctor: ['en-gb', 150], patient: ['en-us+f3', 160], attendant: ['en-gb-x-rp+m4', 155],
  receptionist: ['en-029+f2', 160], pharmacist: ['en-gb-scotland', 150], narrator: ['en-us', 150],
};
const accent = (region, extra = '') =>
  `Speak English with a clear ${region} Indian accent, as people in India really speak it: Indian intonation, ` +
  `retroflex t and d, syllable-timed rhythm. Do not exaggerate. Read numbers exactly as written. ${extra}`;
const PERSONAS = {
  telugu: {
    doctor: ['onyx', accent('Telugu', 'You are a busy senior doctor in Hyderabad, brisk and confident.')],
    patient: ['coral', accent('Telugu', 'You are a middle-aged woman, a little hesitant.')],
    attendant: ['ash', accent('Telugu', 'You are a worried family member.')],
    receptionist: ['nova', accent('Telugu', 'You are a polite clinic receptionist.')],
    pharmacist: ['echo', accent('Telugu', 'You are a pharmacist talking while working.')],
  },
  hindi: {
    doctor: ['sage', accent('North Indian Hindi-speaker', 'You are a calm woman doctor from Delhi.')],
    patient: ['ash', accent('North Indian Hindi-speaker', 'You are a young man who speaks quickly.')],
    attendant: ['ballad', accent('North Indian Hindi-speaker', 'You are an older relative.')],
    receptionist: ['shimmer', accent('North Indian Hindi-speaker', 'You are a receptionist.')],
    pharmacist: ['verse', accent('North Indian Hindi-speaker', 'You are a pharmacist.')],
  },
  tamil: {
    doctor: ['echo', accent('Tamil', 'You are a soft-spoken male doctor from Chennai.')],
    patient: ['ballad', accent('Tamil', 'You are an elderly patient who speaks slowly and pauses.')],
    attendant: ['coral', accent('Tamil', 'You are the patient\'s daughter.')],
    receptionist: ['nova', accent('Tamil', 'You are a receptionist.')],
    pharmacist: ['onyx', accent('Tamil', 'You are a pharmacist.')],
  },
  mumbai: {
    doctor: ['verse', accent('Marathi and Mumbai', 'You are a fast-talking doctor in a crowded OPD.')],
    patient: ['shimmer', accent('Mumbai Hinglish', 'You are a young woman who talks fast and casually.')],
    attendant: ['ash', accent('Bengali', 'You are a family member.')],
    receptionist: ['coral', accent('Mumbai', 'You are a receptionist.')],
    pharmacist: ['sage', accent('Gujarati', 'You are a pharmacist.')],
  },
};

const ffmpeg = (...a) => run('ffmpeg', ['-loglevel', 'error', '-y', ...a]);

async function speak(text, speaker, wav) {
  if (voiceName === 'espeak' || voiceName === 'espeak-hi') {
    const [voice, rate] = voiceName === 'espeak-hi' ? ['hi', 150] : ESPEAK[speaker] || ESPEAK.narrator;
    await run('espeak-ng', ['-v', voice, '-s', String(rate), '-w', `${wav}.raw.wav`, text]);
  } else {
    const persona = PERSONAS[voiceName];
    if (!persona) throw new Error(`Unknown --voice ${voiceName}`);
    const [voice, instructions] = persona[speaker] || persona.doctor;
    // gpt-4o-mini-tts sometimes drops the final sentence of a multi-sentence input, so speak one sentence per call.
    const sentences = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g).map((s) => s.trim()).filter(Boolean);
    const parts = [];
    for (const sentence of sentences) {
      const key = crypto.createHash('sha256').update(JSON.stringify([voice, instructions, sentence])).digest('hex');
      const cached = path.join(cacheDir, `${key}.wav`);
      if (!fs.existsSync(cached)) {
        const body = JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: sentence, instructions, response_format: 'wav' });
        await run('curl', ['-sS', '--fail', '--retry', '5', '--retry-all-errors', '--retry-delay', '2', 'https://api.openai.com/v1/audio/speech',
          '-H', 'Authorization: Bearer proxy-injected', '-H', 'Content-Type: application/json', '-d', body, '-o', `${cached}.part`]);
        fs.renameSync(`${cached}.part`, cached);
      }
      parts.push(cached);
    }
    fs.writeFileSync(`${wav}.list`, parts.map((p) => `file '${p}'`).join('\n'));
    await ffmpeg('-f', 'concat', '-safe', '0', '-i', `${wav}.list`, '-c', 'copy', `${wav}.raw.wav`);
    fs.rmSync(`${wav}.list`);
  }
  await ffmpeg('-i', `${wav}.raw.wav`, '-ac', '1', '-ar', '48000', wav);
  fs.rmSync(`${wav}.raw.wav`);
}

async function mapLimit(items, limit, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

async function render(id, turns) {
  const work = fs.mkdtempSync(path.join(outDir, `.${id}-`));
  const silence = path.join(work, 'gap.wav');
  await ffmpeg('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '0.45', silence);
  const wavs = turns.map((_, i) => path.join(work, `t${String(i).padStart(4, '0')}.wav`));
  await mapLimit(turns, 6, (turn, i) => speak(turn.text, turn.speaker, wavs[i]));
  fs.writeFileSync(path.join(work, 'list.txt'), wavs.flatMap((w) => [`file '${w}'`, `file '${silence}'`]).join('\n'));
  const joined = path.join(work, 'joined.wav');
  await ffmpeg('-f', 'concat', '-safe', '0', '-i', path.join(work, 'list.txt'), '-c', 'copy', joined);
  const webm = path.join(outDir, `${id}.webm`);
  await ffmpeg('-i', joined, '-c:a', 'libopus', '-b:a', '32k', webm);
  if (withNoise) {
    await ffmpeg('-i', joined, '-f', 'lavfi', '-i', 'anoisesrc=color=brown:amplitude=0.06:r=48000',
      '-filter_complex', '[0][1]amix=inputs=2:duration=first:normalize=0', '-ac', '1', '-c:a', 'libopus', '-b:a', '32k',
      path.join(outDir, `${id}-noisy.webm`));
  }
  fs.rmSync(work, { recursive: true, force: true });
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm]);
  console.log(`${id}.webm ${(Number(stdout) / 60).toFixed(1)} min`);
}

(async () => {
  const scripts = set === 'conversations'
    ? fs.readdirSync(path.join(__dirname, 'conversations')).filter((f) => f.endsWith('.json')).sort()
      .map((f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'conversations', f), 'utf8')))
    : JSON.parse(fs.readFileSync(path.join(__dirname, `${set}.json`), 'utf8'))
      .map((c, i) => ({ id: c.id, turns: [{ speaker: set === 'commands' ? 'receptionist' : i % 2 ? 'patient' : 'doctor', text: c.say }] }));
  for (const s of scripts.filter((s) => !only?.length || only.includes(s.id))) await render(s.id, s.turns);
})().catch((error) => { console.error(error.message); process.exit(1); });
