// Voice bar lifecycle: voiceBarReducer, including the draft, applied and confirming states the TLA+ dictation model leaves out.
// Bare line numbers cite frontend/src/lib/voice-bar.ts at 09d2709. VoiceBar.tsx and VoiceBarProvider.tsx are named.
module voiceBar {
  type Kind = Idle | Listening | Working | Draft | Applied | Failed | Confirming
  type Target = Command | Form(int)  // VoiceBarTarget (:49); Form carries the registration id
  type Note = NoNote | PageChanged | Discarded | NothingHeard | NothingUsable | Reported
  // VoiceBarState (:51-58) as one record. target is set while listening, working or failed, reg while a draft or applied,
  // note while idle or failed. attempt is the awaited attempt while working, and heard.id while confirming.
  type Bar = { kind: Kind, target: Target, attempt: int, reg: int, note: Note }
  // active: the page's active registration, 0 for none (VoiceBarProvider.tsx:89). counter: attemptRef (VoiceBar.tsx:201).
  // lastSend and answered are ghosts the code lacks: the registration the latest send targeted (0 for the command), and
  // the attempt whose answer built the current draft.
  type Env = { active: int, counter: int, lastSend: int, answered: int }

  pure val IDLE: Bar = { kind: Idle, target: Command, attempt: 0, reg: 0, note: NoNote }
  var bar: Bar
  var env: Env

  pure def regOf(t: Target): int = match t { | Form(r) => r | Command => 0 }
  pure def owner(b: Bar): int =  // voiceBarRegistrationOf (:80-92)
    if (b.kind == Listening or b.kind == Working or b.kind == Failed) regOf(b.target)
    else if (b.kind == Draft or b.kind == Applied) b.reg
    else 0

  action init = all { bar' = IDLE, env' = { active: 0, counter: 0, lastSend: 0, answered: 0 } }

  // :106-109. The UI offers the command or the active registration (VoiceBar.tsx:319).
  action listen(t: Target): bool = all {
    bar' = if (bar.kind == Listening or bar.kind == Working) bar else { ...IDLE, kind: Listening, target: t },
    env' = env,
  }

  // :118-119, unconditional: it replaces a draft or an applied state. The UI sends only to the command or the active
  // registration (VoiceBar.tsx:243-244), with the next attempt from the counter (:245-247).
  action send(t: Target): bool = all {
    bar' = { ...IDLE, kind: Working, target: t, attempt: env.counter + 1 },
    env' = { ...env, counter: env.counter + 1, lastSend: regOf(t) },
  }

  // :120-136. An attempt below the counter is a slow answer to an earlier send.
  action heard(a: int, empty: bool, noLines: bool): bool = {
    val live = bar.kind == Working and bar.attempt == a  // :121
    all {
      bar' = if (not(live)) bar
        else if (empty) { ...IDLE, kind: Failed, target: bar.target, note: NothingHeard }     // :123
        else if (bar.target == Command) { ...IDLE, kind: Confirming, attempt: a }             // :124-125
        else if (noLines) { ...IDLE, kind: Failed, target: bar.target, note: NothingUsable }  // :127
        else { ...IDLE, kind: Draft, reg: regOf(bar.target) },                                // :128-135
      env' = if (live) { ...env, answered: a } else env,
    }
  }

  action requestFailed(a: int): bool = all {  // :137-140
    bar' = if (bar.kind == Working and bar.attempt == a) { ...IDLE, kind: Failed, target: bar.target, note: Reported } else bar,
    env' = env,
  }

  // :148-151. r is the registration Add to form started with (VoiceBar.tsx:376, :385).
  action applied(r: int): bool = all {
    bar' = if (bar.kind == Draft and bar.reg == r) { ...IDLE, kind: Applied, reg: r } else bar,
    env' = env,
  }

  // :102-105. The provider dispatches it when the active registration changes (VoiceBarProvider.tsx:91-93).
  action registration(activeId: int): bool = all {
    activeId != env.active,
    bar' = if (owner(bar) != 0 and owner(bar) != activeId) { ...IDLE, note: PageChanged } else bar,
    env' = { ...env, active: activeId },
  }

  action dismiss: bool = all { bar' = IDLE, env' = env }  // :158-159
  action discardRecording: bool = all {  // :112-113
    bar' = if (bar.kind == Listening) { ...IDLE, note: Discarded } else bar, env' = env,
  }
  action dictationFailed: bool = all {  // :114-117
    bar' = if (bar.kind == Listening) { ...IDLE, kind: Failed, target: bar.target, note: Reported } else bar, env' = env,
  }

  val targets = if (env.active == 0) Set(Command) else Set(Command, Form(env.active))
  action step = any {
    { nondet t = targets.oneOf()
      listen(t) },
    { nondet t = targets.oneOf()
      send(t) },
    { nondet a = 1.to(env.counter).oneOf()
      nondet empty = Bool.oneOf()
      nondet noLines = Bool.oneOf()
      heard(a, empty, noLines) },
    { nondet a = 1.to(env.counter).oneOf()
      requestFailed(a) },
    { nondet r = 1.to(2).oneOf()
      applied(r) },
    { nondet activeId = 0.to(2).oneOf()
      registration(activeId) },
    dismiss, discardRecording, dictationFailed,
  }

  // The step for MBT traces: step, plus the UI's own sends and live answers. The simulator picks uniformly, so without
  // them a walk seldom gets past a page change. The UI never sends while working (VoiceBar.tsx:341).
  action flow = any {
    { nondet t = Set(Form(env.active)).oneOf()
      all { env.active != 0, bar.kind != Working, send(t) } },
    { nondet a = Set(bar.attempt).oneOf()
      nondet empty = Set(false).oneOf()
      nondet noLines = Set(false).oneOf()
      all { bar.kind == Working, heard(a, empty, noLines) } },
    { nondet r = Set(bar.reg).oneOf()
      all { bar.kind == Draft, applied(r) } },
  }
  action stepMbt = any { step, flow }

  // A draft or applied state holds the registration the latest send targeted, built from that send's answer:
  // a stale answer never lands.
  invariant draftIsLatest =
    (bar.kind == Draft or bar.kind == Applied) implies (bar.reg == env.lastSend and env.answered == env.counter)
  // @cc voice-bar-draft-bound-to-scope (:94-99): the bar's owner is no registration or the active one.
  invariant ownerIsActive = owner(bar) == 0 or owner(bar) == env.active

  // States we expect to reach, so the pass above is not vacuous.
  observation reachesApplied = bar.kind == Applied
  observation reachesConfirming = bar.kind == Confirming
}
