# Idempotency keys on the prescription pad

A doctor writes a prescription on the pad without a full visit. Saving it sends `POST /prescriptions/pad` with an `Idempotency-Key` header. The server creates an automatic visit and a prescription. The key is meant to make a retried save harmless: the second request should get the first answer and create nothing.

`Idempotency.tla` models one doctor, the browser's timeout and retry, and the server's `IdempotencyInterceptor` with the pad handler behind it. It checks whether a key really makes a save happen once.

## Domain

An idempotency record has no status column (`IdempotencyRecord`, `backend/prisma/schema.prisma:10`). The interceptor gives a row two meanings within the existing columns. A row with `statusCode` 0 is a claim: a request owns the key and its handler has not answered. No HTTP response has status 0. Its `expiresAt` is the claim's lease. Any other row is a stored answer with `expiresAt` null, and it answers forever.

| Model variable | Code |
| --- | --- |
| `store[k]` `empty`, `pending` or `ok` | no row, a claim row, or a row with the stored `statusCode` and `responseBody` |
| `srv[r]` | where one HTTP attempt is inside the interceptor |
| `saving` | `before` only: responses already sent whose `idempotencyRecord.create` had not run yet |
| `client`, `attempt`, `cur` | the browser's `performRequest` loop |
| `made` | the prescriptions created, each tagged with the save it belongs to |
| `got[o]` | what the screen showed for save `o` |

An issue is one prescription the doctor means to save. A request is one HTTP attempt. Retries and a second press of Save belong to the same issue.

## Model to code

| Model | Code |
| --- | --- |
| `KeyOf` in `code` | `PrescriptionBuilder.tsx:734` keeps one key per pad draft. `:2745` creates it on the first press of Save and sends it with `createQuickPrescription`. `:2751` clears it once the server confirms the save. `createQuickPrescription` itself falls back to a random key, `frontend/src/lib/api.ts:997`. |
| `KeyOf` in `before` | `createQuickPrescription` built the key from a hash of the payload alone. |
| `DoctorSavesNew`, `DoctorSavesAgain` | `PrescriptionBuilder.tsx:2743` calls `createQuickPrescription` |
| `BrowserTimesOut` | the 30 second abort for `/prescriptions/...` saves, `api.ts:170` to `175`, then a retry with the same headers, `api.ts:189` to `193` |
| `Attempts` | `maxRetries` is 2 when a key is present, `api.ts:164`. The model allows one retry. A third attempt only adds more of the same. |
| `BrowserGetsAnswer` | `api.ts:210` to `234`. 425, 408, 429 and 5xx are retried. |
| `ServerLooksUpKey` in `code` | `claim`, `backend/src/shared/interceptors/idempotency.interceptor.ts:107`. A stored answer replays its status and body, `:90` to `93`. A miss inserts a claim row, `:124`. A second insert fails on the unique index with P2002 and answers busy, `:129`, so the lookup and the claim act as one step. A live claim answers 425, `:87` to `89`. |
| `ServerCreatesPrescription` | `createPrescriptionPad`, `prescriptions.service.ts:1718`. It creates a visit, `:1748`, then the prescription. In `code` the answer replaces the claim before the response leaves, `idempotency.interceptor.ts:95` to `98` and `settle` at `:135`. |
| `ServerStoresResponse` | `before` only. The `tap` callback stored the response after it was emitted and was not awaited. A unique violation was swallowed. |
| `ServerFails` | the handler throws. The pad deletes its visit, `prescriptions.service.ts:1802`. In `code` the claim is deleted, `idempotency.interceptor.ts:100` and `release` at `:142`. |
| `ServerClaimsKey` | `failOpenClaim` only. See the negative controls. |

## Rules

| Rule | Kind | Before | Code | Fixed |
| --- | --- | --- | --- | --- |
| `TypeOK` | invariant | holds | holds | holds |
| `OnePrescriptionPerIssue`. One prescription the doctor saves creates at most one visit and one prescription, however often the browser retries. | invariant | breaks | holds | holds |
| `NoStaleReplay`. Saving a new prescription never answers with an earlier prescription. | invariant | breaks | holds | holds |
| `NoFailureStored`. A failed save is never stored, so its retry runs the handler again. | invariant | holds | holds | holds |
| `BrowserLeavesSaving`. The save indicator always stops, even when the server never answers. | property | holds | holds | holds |

### OnePrescriptionPerIssue broke before the fix

The doctor saved. The pad handler was slow. After 30 seconds the browser aborted and retried with the same key. The server was still running the first attempt, and nothing was stored for the key yet, so the retry missed too. Both attempts created a visit and a prescription. The first stored response won, and the second `create` failed on the unique index and was swallowed. The screen showed the retry's prescription. The first one stayed in the patient's history as a duplicate, and `createPrescription` pulled each one into the pharmacy queue.

The window was wider than the handler. The response left before `idempotencyRecord.create` ran, so a retry that landed between the two also missed. TLC's shortest path in `results/before.md` uses that gap.

### NoStaleReplay broke before the fix

The key was a hash of the payload, and a stored response never expires. When the doctor saved the same prescription for the same patient again later, for example a monthly repeat, the second save got the first save's answer. The screen said it saved. No new visit or prescription existed.

## The fix

`code` takes the same branches as `fixed`.

1. The interceptor claims the key before the handler runs. `claim`, `backend/src/shared/interceptors/idempotency.interceptor.ts:107`, inserts a row with `statusCode` 0 (`PENDING`, `:8`) under the unique index, `:124`. A request that finds a live claim, or loses the insert with P2002 (`:129`), answers 425 with "This save is still in progress. Wait a few seconds, then save again." (`:87` to `89`). The browser already retries 425.
2. The answer replaces the claim before the response leaves. `concatMap` awaits `settle` before it emits, `:95` to `98`. `settle` (`:135`) and `release` (`:142`) filter on the row id, status 0 and the lease, so a request that lost its claim cannot overwrite the new owner's row.
3. A failed handler deletes its claim, `:100`, so its retry runs the handler again.
4. A claim past its lease was left by a process that crashed. The next request takes it over once with a conditional `updateMany`, `:117`. The lease is two minutes, `CLAIM_LEASE_MS` at `:13`. Keyed handlers finish inside their 30 second transaction timeouts, so a live request does not reach it.
5. The pad keys each draft. `PrescriptionBuilder.tsx:734` holds the key, `:2745` creates it on the first press of Save, and `:2751` clears it when the save is confirmed. Retries and later presses of Save for the same draft send the same key. A new draft gets a new key.

The interceptor still fails open. When the claim cannot be read or written, the handler runs without one, `:84`. When the answer cannot be stored, the claim is released, `:97`.

`createPrescription`, `api.ts:961`, and template saves, `api.ts:1031`, still build keys from a hash of the payload. They are outside this model. With the claim in place a retry of either no longer runs twice. A later save of an identical payload would still replay the first answer.

## Negative controls

| Mode | Mistake it reproduces | Breaks |
| --- | --- | --- |
| `failOpenClaim` | The claim is written after the lookup, and a unique violation is swallowed the way the interceptor swallowed store errors before the fix. Two attempts both look, both claim, both run. | `OnePrescriptionPerIssue` |
| `payloadKey` | The claim is in place but the key is still a hash of the payload. | `NoStaleReplay` |
| `storeErrors` | A failed response is stored, for example by moving the store into `finalize`. Every retry then replays the error. | `NoFailureStored` |
| `noTimeout` | A save endpoint outside the 30 second pattern at `api.ts:172`. When the server never answers, the browser waits forever. | `BrowserLeavesSaving` |
| `typeProbe` | The browser starts in a phase outside its type. | `TypeOK` |

## Fairness

`Spec` has one fairness clause, `WF_vars(BrowserTimesOut)`. It says the browser's abort timer fires when the browser stays in Saving. That is a timer, not a person. No server step has fairness, so the model allows a server that never answers. No doctor step has fairness.

## Replays

`backend/src/shared/interceptors/tests/idempotency.formal-replay.database.spec.ts` mounts the real `PrescriptionsController` behind the real `IdempotencyInterceptor` and the production validation pipe, on a private PostgreSQL schema. Only `JwtAuthGuard` is replaced, by a guard that signs in a synthetic doctor. Both tests now pass as plain tests.

- `OnePrescriptionPerIssue`. The first request is paused with `gate()` at `idempotencyRecord.updateMany`, after it created its prescription and before it stores its answer. The retry gets 425. Once the first is released, a later retry replays its prescription. The patient has 1 visit and 1 prescription.
- `NoStaleReplay`. Two drafts with the same payload each send their own key and each create a prescription.

`frontend/__tests__/visits/PrescriptionBuilder.pad-key.test.tsx` drives the real `PrescriptionBuilder` and the real `ApiClient` with `fetch` faked. It checks that a second press of Save after a refused save sends the same key, and that a new draft with the same payload sends a new one. It fails with the payload hash, and with the random fallback key alone.

The replay sends the retry itself. The browser's abort does not reach the server, because Express does not cancel a handler when the client goes away.

## What the model leaves out

- Different users, resources and methods. Keys are scoped by all four, `idempotency.interceptor.ts:75` to `81`. Anonymous callers share an empty user id, a known target obligation at `:52`.
- Store outages. The interceptor fails open on a read or write error, `idempotency.interceptor.ts:84` and `:97`.
- Every endpoint other than the pad. The interceptor is global, `app.module.ts:108`, so the claim guards every keyed write. The model checks only the pad.
- A server crash. The code takes over a claim past its two minute lease, `idempotency.interceptor.ts:117`. The model has no crash, so it does not check the takeover. A handler that runs longer than the lease could run twice, as every handler could before the fix. `idempotency.interceptor.spec.ts` covers the takeover.
