# Idempotency keys on the prescription pad

A doctor writes a prescription on the pad without a full visit. Saving it sends `POST /prescriptions/pad` with an `Idempotency-Key` header. The server creates an automatic visit and a prescription. The key is meant to make a retried save harmless: the second request should get the first answer and create nothing.

`Idempotency.tla` models one doctor, the browser's timeout and retry, and the server's `IdempotencyInterceptor` with the pad handler behind it. It checks whether a key really makes a save happen once.

## Domain

An idempotency record has no status column. The only state is whether a row exists for the key, user, resource and method (`IdempotencyRecord`, `backend/prisma/schema.prisma:10`). There is no marker for a request that is still running, and `expiresAt` is always null, so a stored row answers forever.

| Model variable | Code |
| --- | --- |
| `store[k]` `empty` or `ok` | no row, or a row with `statusCode` and `responseBody` for the key |
| `store[k]` `pending` | `fixed` only: a claim row written before the handler runs. The code has none. |
| `srv[r]` | where one HTTP attempt is inside the interceptor |
| `saving` | responses already sent whose `idempotencyRecord.create` has not run yet |
| `client`, `attempt`, `cur` | the browser's `performRequest` loop |
| `made` | the prescriptions created, each tagged with the save it belongs to |
| `got[o]` | what the screen showed for save `o` |

An issue is one prescription the doctor means to save. A request is one HTTP attempt. Retries and a second press of Save belong to the same issue.

## Model to code

| Model | Code |
| --- | --- |
| `KeyOf` in `code` | `createQuickPrescription` builds the key from a hash of the payload alone, `frontend/src/lib/api.ts:998`. The payload has no date or random part, `PrescriptionBuilder.tsx:2706`. |
| `DoctorSavesNew`, `DoctorSavesAgain` | `PrescriptionBuilder.tsx:2740` calls `createQuickPrescription` |
| `BrowserTimesOut` | the 30 second abort for `/prescriptions/...` saves, `api.ts:170` to `175`, then a retry with the same headers, `api.ts:189` to `193` |
| `Attempts` | `maxRetries` is 2 when a key is present, `api.ts:164`. The model allows one retry. A third attempt only adds more of the same. |
| `BrowserGetsAnswer` | `api.ts:210` to `234`. 425, 408, 429 and 5xx are retried. |
| `ServerLooksUpKey` | `findFirst` on the key, `idempotency.interceptor.ts:69` to `77`. A hit replays the stored status and body, `:78` to `86`. A miss runs the handler, `:96`. |
| `ServerCreatesPrescription` | `createPrescriptionPad`, `prescriptions.service.ts:1718`. It creates a visit, `:1748`, then the prescription, `:1775`. |
| `ServerStoresResponse` | the `tap` callback, `idempotency.interceptor.ts:97` to `110`. It is async and not awaited, so the response leaves before the row is written. A unique violation is swallowed, `:111`. |
| `ServerFails` | the handler throws. The pad deletes its visit, `prescriptions.service.ts:1801`. `tap` never sees an error, so nothing is stored. |
| `ServerClaimsKey` | `failOpenClaim` only. See the negative controls. |

## Rules

| Rule | Kind | Code | Fixed |
| --- | --- | --- | --- |
| `TypeOK` | invariant | holds | holds |
| `OnePrescriptionPerIssue`. One prescription the doctor saves creates at most one visit and one prescription, however often the browser retries. | invariant | breaks | holds |
| `NoStaleReplay`. Saving a new prescription never answers with an earlier prescription. | invariant | breaks | holds |
| `NoFailureStored`. A failed save is never stored, so its retry runs the handler again. | invariant | holds | holds |
| `BrowserLeavesSaving`. The save indicator always stops, even when the server never answers. | property | holds | holds |

### OnePrescriptionPerIssue breaks

The doctor saves. The pad handler is slow. After 30 seconds the browser aborts and retries with the same key. The server is still running the first attempt, and nothing is stored for the key yet, so the retry misses too. Both attempts create a visit and a prescription. The first stored response wins, and the second `create` fails on the unique index and is swallowed. The screen shows the retry's prescription. The first one stays in the patient's history as a duplicate, and `createPrescription` pulls each one into the pharmacy queue, `prescriptions.service.ts:165`. The interceptor already names this as a target obligation (`idempotency-concurrent-first-requests`, `idempotency.interceptor.ts:33`).

The window is wider than the handler. The response leaves before `idempotencyRecord.create` runs, so a retry that lands between the two also misses. TLC's shortest path uses that gap, and so does the replay.

### NoStaleReplay breaks

The key is a hash of the payload, and a stored response never expires. When the doctor saves the same prescription for the same patient again later, for example a monthly repeat, the second save gets the first save's answer. The screen says it saved. No new visit or prescription exists. `createPrescription`, `api.ts:961`, and template saves, `api.ts:1031`, build keys the same way. They are outside this model.

## Fixed

`fixed` changes two things.

1. The interceptor inserts the key as a pending row under the unique index before it runs the handler. A request that finds a pending row answers 425, which the browser already retries. The handler's answer replaces the pending row before the response leaves. A failure deletes the row.
2. The browser keys each draft. The key stays the same across retries and presses of Save until a save succeeds, then the next prescription gets a new key. `createPharmacyPurchaseInvoiceDraft` already keeps a random key across manual retries, `api.ts:616` to `619`.

A pending row left by a crashed server would block its key forever. The real fix needs an age limit on pending rows. The model has no crash, so it does not show this.

## Negative controls

| Mode | Mistake it reproduces | Breaks |
| --- | --- | --- |
| `failOpenClaim` | The claim is written after the lookup, and a unique violation is swallowed the way the interceptor swallows store errors today. Two attempts both look, both claim, both run. | `OnePrescriptionPerIssue` |
| `payloadKey` | The claim is in place but the key is still a hash of the payload. | `NoStaleReplay` |
| `storeErrors` | A failed response is stored, for example by moving the store into `finalize`. Every retry then replays the error. | `NoFailureStored` |
| `noTimeout` | A save endpoint outside the 30 second pattern at `api.ts:172`. When the server never answers, the browser waits forever. | `BrowserLeavesSaving` |
| `typeProbe` | The browser starts in a phase outside its type. | `TypeOK` |

## Fairness

`Spec` has one fairness clause, `WF_vars(BrowserTimesOut)`. It says the browser's abort timer fires when the browser stays in Saving. That is a timer, not a person. No server step has fairness, so the model allows a server that never answers. No doctor step has fairness.

## Replays

`backend/src/shared/interceptors/tests/idempotency.formal-replay.database.spec.ts` mounts the real `PrescriptionsController` behind the real `IdempotencyInterceptor` and the production validation pipe, on a private PostgreSQL schema. Only `JwtAuthGuard` is replaced, by a guard that signs in a synthetic doctor.

- `OnePrescriptionPerIssue`. The first request is paused at `idempotencyRecord.create` with `gate()`, after it created its prescription and sent its answer. The retry runs to completion. Then the first request is released. Today the patient has 2 visits and 2 prescriptions.
- `NoStaleReplay`. The same pad is saved twice with the same key, after the first response is stored. Today the second answer carries the first prescription's id, and the patient has 1 prescription.

The replay sends the retry itself. The browser's abort does not reach the server, because Express does not cancel a handler when the client goes away. The replay uses a fixed key per test in place of the payload hash. The browser sends the same key for the same payload, which is the property that matters.

## What the model leaves out

- Different users, resources and methods. Keys are scoped by all four, `idempotency.interceptor.ts:70` to `76`. Anonymous callers share an empty user id, a known target obligation at `:38`.
- Store outages. The interceptor fails open on a read or write error, `:91` and `:111`. A failed write behaves like a store that never happened, which the model already allows by leaving `ServerStoresResponse` without fairness.
- Every endpoint other than the pad. The interceptor is global, `app.module.ts:109`, so the same race applies to every keyed write whose browser call retries.
- A server crash, and the age limit a claim row would need.
