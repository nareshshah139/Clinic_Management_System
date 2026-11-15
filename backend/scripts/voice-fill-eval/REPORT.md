# Voice fill and voice commands: test report

Branch `claude/kind-newton-es1z66`. Every number here was measured against the real OpenAI transcription API
(`gpt-4o-transcribe`) and the real embedded Codex (ChatGPT OAuth), through the production code path
(`VoiceFillService.fill`), unless a line says otherwise.

## What ships

- A mic in the header of the patient intake dialogs, the add-inventory dialog and the consultation toolbar. Speech fills
  only the fields it mentions; an in-pill "N filled · Undo fill" confirmation replaces toasts.
- Spoken prescription items become new rows. A name resolves to clinic stock only when one candidate matches; otherwise
  the row stays as typed text, with a "Did you mean …? Use" suggestion when one stocked name is clearly closest.
- A global mic for commands ("Book Ramesh Kumar with Dr Shravya tomorrow at 10"). Every command ends in a confirmation
  card; nothing is written until Confirm. Booking uses an Idempotency-Key and the existing overbook flow.
- Recordings up to 40 minutes. The server splits long audio at pauses into ~150 s parts, transcribes each part twice in
  parallel (a third time if the two disagree) and joins them in order.

## How to rerun

```
node backend/scripts/voice-fill-eval/generate-audio.cjs <dir> [--set cases|conversations|commands|commands-heldout] \
  [--voice espeak|espeak-hi|telugu|hindi|tamil|mumbai] [--noise]
cd backend && npx ts-node --transpile-only scripts/voice-fill-eval/run.ts --audio <dir> [--set ...] [--suffix -noisy] \
  [--out report.json]        # or --text to score Codex extraction on the script itself
```

Sets: `cases.json` (19 short dictations), `conversations/` (9 doctor–patient, reception and pharmacy conversations of
1 to 30 minutes with traps listed in each `summary`), `commands.json` (20) and `commands-heldout.json` (16, written
separately from the prompt hints). Accented voices come from `gpt-4o-mini-tts` with accent instructions, one sentence
per call; the same vendor transcribes, so accented scores may be optimistic. `espeak` voices are vendor-independent and
robotic.

## Defects found by testing, and how each fix was proven

| # | Defect | Evidence | Fix | Proof after fix |
|---|---|---|---|---|
| 1 | Codex cannot hear audio | `model/list`: every model is text+image; three models answered "I can't access the audio" | Transcribe with OpenAI, extract with Codex | Pipeline runs end to end |
| 2 | `verbose_json` rejected by `gpt-4o-transcribe` (also broke the existing mic buttons) | HTTP 400 "not compatible" | `json` for gpt-4o models | Real transcription succeeds |
| 3 | Recorder stopped at 10 min; 128 kbps would pass 25 MB at ~26 min | Code + measured 242 KB / 15 s | 40-minute cap, 32 kbps | 30-minute upload is 7.3 MB |
| 4 | API rejects audio over 1,400 s and silently truncates long outputs | 400 at 25 min; 15 min returned 1,181 of ~1,390 words, HTTP 200 | Split at pauses into ~150 s parts | 15 and 25 min complete |
| 5 | Transcript clipped to 8,000 chars before Codex | 20/30-min consults: coverage 0.51/0.32 | 60,000 chars | Coverage 0.97–0.99 |
| 6 | Silence and noise transcribed as speech | 10 s silence → "Doctor, I've been feeling really tired lately." | Server VAD | 0/12 non-empty |
| 7 | Hinglish names in Devanagari; ABHA number accepted as phone | firstName "सुनीता"; phone "12345678901234" | Latin-script rule; plain digits must be an Indian mobile | Unit tests; Latin names in later runs |
| 8 | **Invented consultation passages** with fake vitals and prescriptions | 30-min Telugu consult: "heart rate is 72 … azithromycin 500 mg"; another run "paracetamol 500 mg"; Codex extracted them | The transcription prompt's own examples ("120/80 mmHg", "heart rate", "azithromycin 500 mg PO OD x3 days") were being played back. Prompt is now context only; a test keeps digits and clinical terms out; two-sample consensus kept as a second guard | 3 × 30-min runs: no invented text, 63/63 consensus pairs agree |
| 9 | Short phrase before a pause dropped | "Adapalene gel, apply at bedtime" lost the drug name 4/4 at default VAD | VAD silence 400 ms (800 ms lost ~21% of conversation words) | Drug name kept 4/4; conversation parts complete; silence/noise empty |
| 10 | Negatives written into text fields | "No procedure performed today." | Prompt rule: negatives → false or null | Conversation text mode 193/193 |
| 11 | UI: Undo toast vanished in ~5 s and was unreachable under a modal; stock hidden until hover; stocked "Cap. X" names never matched speech | Real-browser runs | Undo inside the pill; stock loads with the row; form-prefix aware matching | Real-browser recheck PASS |

## Results on the shipping build

One run per row on commit 85c6704, real APIs. "Fields" counts every expected field and every prescription-row cell;
a misheard drug name fails every cell of its row. "Coverage" is transcript letters over script letters (number words
excluded); Hinglish clips read low because the transcriber writes Hindi words in Devanagari, which the metric does not
count. "Invented" scans transcripts for consultation text that is not in the audio.

| Set | Voice | Fields | Perfect cases | Unexpected fields | Invented | p50 | max |
|---|---|---|---|---|---|---|---|
| 19 short dictations | espeak (robotic) | 142/165 (86.1%) | 10/19 | 2 | 0 | 9.6 s | 14.4 s |
| 19 short dictations | espeak + brown noise | 150/165 (90.9%) | 12/19 | 1 | 0 | 8.7 s | 16.1 s |
| 19 short dictations | Telugu accent | 154/165 (93.3%) | 12/19 | 1 | 0 | 9.1 s | 15.9 s |
| 19 short dictations | Hindi accent | 151/165 (91.5%) | 12/19 | 1 | 0 | 8.9 s | 13.2 s |
| 19 short dictations | Tamil accent | 153/165 (92.7%) | 12/19 | 2 | 0 | 9.3 s | 13.9 s |
| 19 short dictations | Mumbai accent | 155/165 (93.9%) | 14/19 | 1 | 0 | 9.1 s | 13.0 s |
| 9 conversations, 1–30 min | espeak, 2 voices | 153/193 (79.3%) | 1/9 | 11 | 0 | 21.5 s | 58.5 s |
| 9 conversations, 1–30 min | Telugu accents | 167/193 (86.5%) | 4/9 | 8 | 0 | 21.8 s | 63.7 s |
| 9 conversations, 1–30 min | Telugu + brown noise | 168/193 (87.0%) | 3/9 | 8 | 0 | 22.9 s | 61.3 s |
| 9 conversations, 1–41 min | Hindi accents | 164/193 (85.0%) | 4/9 | 9 | 0 | 17.6 s | 66.0 s |
| 20 commands | Telugu accent | 76/77 (98.7%) | 19/20 | 0 | 0 | 6.9 s | 9.0 s |
| 20 commands | Hindi accent | 77/77 (100%) | 20/20 | 0 | 0 | 6.8 s | 10.7 s |
| 16 held-out commands | Telugu accent | 54/56 (96.4%) | 14/16 | 0 | 0 | 6.4 s | 10.0 s |
| 16 held-out commands | Hindi accent | 53/56 (94.6%) | 13/16 | 0 | 0 | 6.6 s | 7.9 s |

Conversation transcripts kept 0.98–1.00 coverage in every voice. The 10-minute consult scored 30/30 in all four voice
sets. Codex extraction alone, fed the scripts as perfect transcripts, scored 193/193 on the conversations and 56/56 on
the held-out commands, so most remaining loss is transcription (brand names, spelling variants such as Kavita/Kavitha).

Run-to-run spread, measured on three repeats of the Telugu short set: 148, 148, 147 of 165 (an earlier build). The VAD
silence setting moved the robotic espeak voice the most (138 / 156 / 142 of 165 at 200 / 800 / 400 ms) because espeak
pauses unnaturally long; natural voices moved by at most 4 fields.

## Known limitations

- **Brand names** are the main remaining error: "Teczine" is heard as "Texine", "Taxine", "Tedzine"; "Cwin" as "Queen".
  Rows then do not link to stock and stay as visible typed text; the "Did you mean" suggestion recovers common cases
  with one click. The scorer counts every cell of such a row as missed, so field accuracy understates rows that are
  otherwise correct.
- **Brand substitution**: the transcriber once replaced "Teczine" with "Xyzal" (another brand of levocetirizine). The
  row stays unlinked and visible. A vocabulary list in the transcription prompt was not used: prompt examples caused
  defect 8, and a vocabulary prompt raised truncation 4/10 in an earlier measurement.
- **Speaker labels**: transcripts sometimes carry "Doctor:"/"Patient:" labels on the wrong speaker. Extraction does not
  rely on them.
- **Cost**: every part is transcribed twice (about $0.006 per audio minute each with gpt-4o-transcribe).
- **Latency**: about 7–10 s for dictation, about 50 s for 20 minutes and about 65 s for 30 minutes of audio.
- **Synthetic speech**: no recordings of real clinicians were used. Accents are synthesized; real clinic audio (crosstalk,
  phone speakers, children) is untested.
