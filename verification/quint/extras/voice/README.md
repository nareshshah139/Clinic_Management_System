# Voice bar: Quint spec and a replay on the real reducer

`spec/voiceBar.qnt` models the voice bar lifecycle. `replay.mjs` runs Quint's traces through `voiceBarReducer` in `frontend/src/lib/voice-bar.ts`. It bundles that file with esbuild in memory, so no stand-in sits between the spec and the code.

The TLA+ dictation model leaves out the bar's draft, applied and confirming states (`verification/state-machines/dictation/README.md:165`). This kit covers that slice.

## What the spec covers

- The seven states of `VoiceBarState`: idle, listening, working, draft, applied, failed, confirming.
- The request target (the command or a form registration), its attempt, the registration a draft or an applied state belongs to, and the idle notice or failure message.
- The environment: the page's active registration (none, 1 or 2) and the attempt counter that `VoiceBar.tsx` keeps. An answer can arrive late, so `heard` and `requestFailed` can carry an older attempt. The page can change at any step.
- `draftIsLatest`. A draft or applied state belongs to the registration the latest send targeted, and was built from that send's answer. A stale answer never lands. It reads two ghost variables, `lastSend` and `answered`, that the code does not have.
- `ownerIsActive`. Whatever the bar holds belongs to no registration or to the active one (`@cc voice-bar-draft-bound-to-scope`).
- Two observations, `reachesApplied` and `reachesConfirming`, so a pass is not vacuous.

## Model to code

| Spec | Code |
| --- | --- |
| `listen(t)` | `voice-bar.ts:106-109`. Target from `VoiceBar.tsx:319`, dispatched at `:323`. |
| `send(t)` | `voice-bar.ts:118-119`, unconditional. `VoiceBar.tsx:243-244` refuses a registration that is not active. `:245-247` takes the attempt from `attemptRef`. |
| `heard(a, empty, noLines)` | `voice-bar.ts:120-136`. Attempt guard at `:121`. `VoiceBar.tsx:251-255` passes no lines for the command. |
| `requestFailed(a)` | `voice-bar.ts:137-140`. Dispatched at `VoiceBar.tsx:257`. |
| `applied(r)` | `voice-bar.ts:148-151`. `VoiceBar.tsx:376-377` and `:385` carry the registration Add to form started with. |
| `registration(activeId)` | `voice-bar.ts:102-105`, rule at `:94-99`. `VoiceBarProvider.tsx:91-93` dispatches it when the active registration changes. |
| `dismiss`, `discardRecording`, `dictationFailed` | `voice-bar.ts:158-159`, `:112-113`, `:114-117`. |
| `owner(b)` | `voiceBarRegistrationOf`, `voice-bar.ts:80-92`. |
| `env.counter`, `env.active` | `VoiceBar.tsx:201`, `VoiceBarProvider.tsx:89`. |

The replay compares `kind`, `target`, `reg`, `attempt`, `note`, `owner` (from the real `voiceBarRegistrationOf`) and the counter after every step. The code's `heard.id` is compared as `attempt` while confirming.

## Run it

Run these from `verification/quint`. The outputs are under Measured.

```sh
npm ci
npm install --no-save esbuild@0.28.2
npx quint typecheck spec/voiceBar.qnt
npx quint run spec/voiceBar.qnt --backend=typescript --seed=42 --max-samples=10000 --max-steps=20
npx quint run spec/voiceBar.qnt --backend=typescript --step=stepMbt --seed=42 --max-samples=10000 --max-steps=20 --observation=reachesApplied
npx quint verify spec/voiceBar.qnt --max-steps=12 --invariant=draftIsLatest,ownerIsActive
rm -rf extras/voice/traces && mkdir -p extras/voice/traces
npx quint run spec/voiceBar.qnt --backend=typescript --step=stepMbt --seed=7 --max-samples=200 --n-traces=200 --max-steps=20 --mbt --out-itf='extras/voice/traces/t_{seq}.itf.json'
node extras/voice/replay.mjs
MUTANT=no-attempt-check node extras/voice/replay.mjs
```

`step` picks uniformly among all actions, so a walk seldom gets past a page change. `stepMbt` adds the UI's own sends and live answers to that, and generates the traces. Every trace of `stepMbt` is also a trace of `step`.

The two other mutants are `no-registration-check` and `no-scope-reset`. `STATS=1` prints what the traces covered to stderr.

## Measured

Quint 0.35.0, Apalache 0.62.4, esbuild 0.28.2, Node 22.23.5, at commit 09d2709.

- `quint run`, `step`, seed 42, 10,000 samples of 20 steps. No violation of either invariant. `reachesApplied` in 18 traces (0.18%), `reachesConfirming` in 1,518.
- `quint run`, `stepMbt`, same seed. No violation. `reachesApplied` in 4,703 traces (47.03%).
- `--observation=reachesApplied` stops at the first trace that reaches it.
- `quint verify` to 12 steps: no violation (about 75 s). To 16 steps: no violation (about 249 s).
- `quint verify --max-steps=6 --search-observations` reaches both observations.
- Replay of 200 traces (seed 7, 20 steps each): `OK 200 traces, 4000 steps, code matched the spec after every step`. 100 of the traces reach applied, and 79 steps are a `heard` for an older attempt. A one-off sweep of 2,000 traces (seed 99, 30 steps) also matched, over 60,000 steps.

Each mutant patches the source text in memory and the replay exits 1 on its first divergence:

| `MUTANT` | Patch | First divergence, seed 7 |
| --- | --- | --- |
| `no-attempt-check` | `heard` ignores the attempt (`:121`) | `step 18: heard(a=1 empty=false noLines=false), kind: spec working, code draft` |
| `no-registration-check` | `applied` ignores the draft's registration (`:149`) | `step 6: applied(r=2), kind: spec draft, code applied` |
| `no-scope-reset` | `registration` never resets (`:104`) | `step 15: registration(activeId=2), kind: spec idle, code working` |

The invariants also fail on the same three edits made to a copy of the spec (10,000 samples, seed 42). Dropping the attempt guard breaks `draftIsLatest`, and `quint verify` finds a 4-step counterexample: a command request is sent, a form registers, a form request is sent, and the first answer lands on the second request. Dropping the registration check breaks both invariants. Dropping the reset breaks `ownerIsActive`.

## What it found

No bug. Both invariants hold in the spec, and the real reducer matches the spec on every replayed step. The guards at `:121`, `:149` and `:104` each carry weight, because removing one breaks an invariant. The guard at `:138` is not covered, since the invariants say nothing about failed states.

Two facts outside the reducer matter.

- `send` accepts any target. With a copy of the spec that lets the bar send to a registration that is not active, `ownerIsActive` fails at once (23 ms). `VoiceBar.tsx:243-244` refuses that send, so the bar cannot reach it.
- The reducer learns of a page change from an effect (`VoiceBarProvider.tsx:91-93`). By that effect order, one render can show a draft for a page that is gone. This is inferred and not reproduced. `addToForm` and Undo check the active registration before they act (`VoiceBar.tsx:376-377`, `:397`). The spec applies the page change and its `registration` event together, so it does not see that render.

One reachable behavior is not a rule break. `send` and `listen` are unconditional (`:118-119`, `:106-109`), so they replace an applied state, and with it a live Undo. A user reaches this from the bar: the text box and the mic stay enabled while applied (`VoiceBar.tsx:529-558`), and typing in the bar does not count as touching the form (`:94`). A throwaway jest test on the real `VoiceBar` (not committed) showed two cases. After Add to form, typing a new request and pressing Enter leaves no Undo. After Add to form, pressing the mic and then Escape also leaves no Undo, and the status reads "Recording discarded." In both cases `undo()` never runs, so the form keeps what Add to form put in it. No `@cc` rule says Undo must outlive these actions, so this is a product call. The spec does not model Undo.

## What it leaves out

- Lines, transcript text, labels and the `undo` callback. `parseVoiceCommand` is a stub, and the replay passes the same line for every draft.
- `toggle-line`, `dictation-phase`, `apply-failed` and `form-touched`. None changes the kind or the owner.
- The `dismiss` notice that Undo sets (`VoiceBar.tsx:399`). The model's `dismiss` carries none.
- The bar's own state: `applying`, `toCommand`, the speech session and the text box. The model sends and dismisses without that gating, except in `flow`, which never sends while working (`VoiceBar.tsx:341`).
- Registration ids. The provider never reuses one (`VoiceBarProvider.tsx:80-81`). The model has 1 and 2 and lets the active one return, as it does when a dialog's form unmounts and the page's form is active again (`:89`).
- The 40-minute dictation cap, the microphone, and the transcription request. The TLA+ model covers dictation.
