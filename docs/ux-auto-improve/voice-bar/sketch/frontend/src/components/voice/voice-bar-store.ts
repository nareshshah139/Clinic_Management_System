// Repo path: frontend/src/components/voice/voice-bar-store.ts
// The imperative shell around machine.step(). Holds the model, runs commands, feeds results back.
// Plain TypeScript (no React), so a test drives it without rendering.
//
// Commands run inside send(), that is inside a user event handler or an async continuation,
// never inside a React effect. Strict Mode double-invokes effects and initializers, not handlers,
// so no command runs twice. The bar's only effect subscribes, and its cleanup calls reset().

import { step, initialModel, type AttemptId, type BarEvent, type BarModel } from '@/lib/voice/machine';
import type { Transport, RecordedAudio, MicSession } from '@/lib/voice/transport';
import type { Lookups } from '@/lib/voice/lookups';
import type { IstClock } from '@/lib/voice/spoken-time';
import type { VisitNoteUndone } from '@/lib/voice/types';
import type { VoiceRegistry } from './VoiceBarProvider';

export interface VoiceBarDeps {
  transport: Transport;
  lookups: Lookups;
  clock: IstClock;
  registry: VoiceRegistry;
  /** Date.now, injected for "Listening 0:12". */
  now(): number;
}

/** DOM targets the VoiceBar attaches; the store calls them for focus commands. */
export interface FocusTargets {
  composer(): void;
  /** Focus the element remembered by Ctrl/Cmd + /, if it is still in the document. */
  restore(): void;
}

export interface VoiceBarStore {
  getSnapshot(): BarModel;
  subscribe(listener: () => void): () => void;
  send(event: BarEvent): void;
  attachFocus(targets: FocusTargets | null): void;
  /** Aborts any live attempt, releases kept audio and returns to idle, keeping `configured`.
   *  Safe to call repeatedly; the store stays usable afterwards. */
  reset(): void;
}

export function createVoiceBarStore(deps: VoiceBarDeps): VoiceBarStore {
  // let model = initialModel(micSupported())
  // const live = new Map<AttemptId, { controller: AbortController; mic?: MicSession }>()
  // const keptAudio = new Map<AttemptId, RecordedAudio>()                // retry 'transcribe' reuses it
  // const undos = new Map<AttemptId, Array<() => VisitNoteUndone>>()     // every visit-note apply of an attempt
  //
  // send(event): const { model: next, commands } = step(model, event); model = next; notify(); commands.forEach(run)
  //
  // run(c):
  //   fetch-status:     transport.status().then(s => send({ type: 'status', configured: s.configured }))
  //   open-mic:         ctl = new AbortController(); live.set(id, { controller: ctl })
  //                     transport.openMic(ctl.signal, () => send({ type: 'stop' }))
  //                       .then(mic => live.has(id) ? (entry.mic = mic, send(mic-opened{id, now()})) : mic.cancel(),
  //                             e => send(failed{id, failureOf(e)}))
  //   finish-recording: audio = await entry.mic.finish(); keptAudio.set(id, audio); then as `transcribe`
  //   transcribe:       transport.transcribe(keptAudio.get(id), INTENTS[intent].transcribeContext, signal)
  //                       -> send(transcribed) | send(failed)
  //   interpret:        slot = registry.active(); slot?.key must equal attempt.key, else drop (the capability event handles it)
  //                     parsed = await transport.parse(intent, text, signal)
  //                     proposal = await INTENTS[intent].resolve(parsed, slot.capability.context, { lookups, clock, signal })
  //                       -> send(proposed{id, proposal}) | send(failed{id, failure})
  //   refine:           INTENTS[intent].refine(...) -> send(proposed) | send(failed)
  //   abort:            entry.mic?.cancel(); entry.controller.abort(); live.delete(id)
  //   release-audio:    keptAudio.delete(id)
  //   apply:            slot = registry.active()
  //                     !slot || !sameRegistration(slot.key, attempt.key) -> send(apply-failed{id, 'page-changed'})
  //                     try { result = slot.capability.apply(prefill) }                // synchronous, one call
  //                     catch { send(apply-failed{id, 'threw'}); return }
  //                     visit-note: undos.get(id).push(result.undo); send(applied{id, { intent, written: result.written }})
  //                     others:     send(applied{id, { intent }})
  //   undo:             slot key must equal c.key; run undos.get(c.attempt) newest first; merge restored/kept;
  //                     undos.delete(c.attempt); send(undone{merged})
  //   focus-composer:   focus?.composer();  restore-focus: focus?.restore()
  //
  // registry.subscribe(() => send({ type: 'capability', active: registry.active()?.key ?? null }))
  // (also sent once when the store is created)
  // reset(): abort every live entry; keptAudio.clear(); undos.clear();
  //          model = { ...model, active: null, lastUndo: null, phase: idle('', null) }; notify()
  void step; void initialModel;
  throw new Error('not implemented');
}

export type { AttemptId };
