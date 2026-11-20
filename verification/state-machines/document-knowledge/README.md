# Inventory document outcome

The inventory document editor saves and posts stock documents such as a stock loss. It must never claim an outcome it has not confirmed. If a save or stock action is interrupted, the editor says Outcome not confirmed, blocks every write, and offers Check saved status. This model checks that design and the one gap it leaves.

`DocumentKnowledge.tla` models one tab, one stock-loss document that is either new or a saved draft, the server, and one other user who saves the same draft. Writes the tab stopped waiting for stay in `orphans` and may still reach the server.

| Model variable | Code |
| --- | --- |
| `k` | `knowledge.state`, the `DocumentKnowledge` union, `workflow-document-state.ts:7-11`, `WorkflowDocumentEditor.tsx:108` |
| `op`, `refSaved` | the `operation` and `ref` of an `unconfirmed` knowledge |
| `envelope`, `expected` | `pendingRecovery` and its sessionStorage copy, `documentVersion` in it, `WorkflowDocumentEditor.tsx:110`, `464-469`, `357-368` |
| `pc` | the await the tab is parked on. The `lock` ref is held whenever `pc` is not `idle` or `load` (`Busy`). |
| `shown`, `shownPosted` | the document on screen, known or `lastKnown` |
| `orphans` | requests already sent that the tab no longer awaits |
| `docs`, `sver`, `sposted`, `posted` | the server's documents for the request key, version, status and stock postings |

## Model to code

| Action | Code |
| --- | --- |
| `YouSaveTheNewDraft` | `perform()` on a new draft: `markPending('create')` before the POST, `WorkflowDocumentEditor.tsx:548-553` |
| `YouPostStock` | `perform(action)` on a saved draft: `markPending('save')`, PATCH, `apply`, `markPending('transition')`, POST transition, re-read, `WorkflowDocumentEditor.tsx:526-580`. Guarded by `lock` and `presentation.canMutate` (`527`, `workflow-document-state.ts:61-66`). |
| `TheServerAnswers` | the reply to the request at `pc`. Server rules: create returns the existing document for a known request key (`inventory-workflow.service.ts:400-413`); PATCH and transition refuse a stale version with 409 (`396-399`, `919-922`); a transition posts only from DRAFT; resolve bumps the version when it equals the fence, returns the document when newer, and refuses when older (`842-866`). |
| catch block | `WorkflowDocumentEditor.tsx:581-608`. It re-reads the document. A 400/403/409/422, a version past `expected`, or an undispatched request apply the server copy. Anything else stays `unconfirmed`. |
| `YouCheckSavedStatus` | `checkSavedStatus`, `WorkflowDocumentEditor.tsx:470-525`. A request reference is looked up by key and the create is replayed with the same key on 404. A saved reference is read. An unsettled save or transition is fenced with POST `/resolve` before the editor shows the outcome. |
| `YouReloadThePage` | remount, `initialise`, `WorkflowDocumentEditor.tsx:176-312`. A stored envelope comes back as `loading` then `unconfirmed`, or as `unconfirmed` straight away for a create that never got an id. |
| `TheRequestFails` | a dropped connection or a 5xx. The write may still reach the server later. |
| `TheRequestTimesOut` | does not exist in the code. `api.ts:170-172` gives no timeout to inventory requests. `fixed` adds one. |
| `AnOldRequestLands` | an orphaned write reaches the server |
| `AnotherUserSaves` | someone else saves the same draft |

## Rules and what TLC says

| Rule | code | Replay |
| --- | --- | --- |
| `TypeOK` | holds | |
| `PostedOnce` | holds | |
| `OneDocument` | holds | |
| `KnownMeansSettled` | holds | |
| `NoSubmitWhileUnknown` | holds | |
| `BusyEndsIfAnswered` | holds | |
| `BusyEnds` | breaks | `today:` and `.failing` pass |

This is a well-built machine. Every safety rule holds in `code` mode, across reloads, lost replies, late requests and a second user. The editor shows a confirmed outcome only when no earlier write can still change the document, because Check saved status fences an unsettled operation with `/resolve` and the server compares versions.

`BusyEnds` breaks. No inventory request has a client timeout. If the server never answers a save or stock action, `perform` awaits it forever and holds `lock`. Check saved status returns early on `lock` (`WorkflowDocumentEditor.tsx:471`) and is rendered disabled while `busy` (`680`). Back is disabled too (`652`). Only a page reload frees the editor. The replay in `frontend/__tests__/formal/document-knowledge.formal-replay.test.tsx` renders the real editor, stubs only `fetch`, follows TLC's path (reload, then save the new draft with no answer), and checks ten minutes later.

## Fixed mode and negative controls

`fixed` adds one guard. Every request is aborted after a timeout, which runs the existing catch block.

| Mode | Mistake it reproduces | Breaks |
| --- | --- | --- |
| `noTimeout` | no client timeout, as today | `BusyEnds` |
| `noFence` | Check saved status shows the read-back without POST `/resolve` | `KnownMeansSettled` |
| `mutateWhileUnknown` | the write buttons work while the outcome is unconfirmed | `NoSubmitWhileUnknown` |
| `transitionTrustsClient` | the transition checks neither the version nor the DRAFT status | `PostedOnce` |
| `freshKeyOnReplay` | the replayed create gets a new request key | `OneDocument` |
| `unlockOnSuccessOnly` | the lock is released only on success, not in `finally` | `BusyEndsIfAnswered` |
| `typeProbe` | the posting count leaves its type | `TypeOK` |

## Fairness

- `WF_vars(TheRequestTimesOut)`. A client timeout fires on its own. It is enabled only where a timeout exists.
- `BusyEndsIfAnswered` assumes the server answers. The assumption sits inside the property as `WF_vars(TheServerAnswers) => ...`.
- `BusyEnds` assumes nothing about the server.
- No user action is fair. Nobody has to press Check saved status or reload.

## What the model leaves out

- The unreadable recovery record. It produces a request reference with an empty key, and Check saved status then throws on purpose and asks for an administrator, `WorkflowDocumentEditor.tsx:232-234`, `489`. That record also blocks every new document of the same kind in that tab until the tab closes, because new drafts share the recovery key. This is a deliberate stop, not modelled.
- Cancel, reverse, release and the other actions. They follow the same `markPending` and catch path as the stock post.
- Two concurrent creates with one request key at the server. The unique key decides that race. The inventory-documents model covers the server side.
- Route changes inside one editor. `routeGeneration` discards late replies; the lock is shared, so a hung request on one document also blocks the next document opened in the same editor.
- Census id `purchase-stock-outcome-unknown`, the purchase workbench's own unknown-stock gate in `PurchaseInvoiceWorkbench.tsx`. It is a separate implementation of the same idea and is not modelled here.
