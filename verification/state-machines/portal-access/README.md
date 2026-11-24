# Portal access

Release 1c of the patient portal spec lets a patient sign in with a one-time code sent on WhatsApp, choose a profile when several patients share the number, and read their own records. Release 1b already lets a task link answer one check-in. This model checks that each credential reaches only what it should, that a code yields at most one session and only while it is live, and that staff changes end the sessions they should.

## What the model covers

`PortalAccess.tla` has one confirmed number N shared by two patients, p1 and p2. The number asks for a code, sends wrong codes, waits five minutes, and submits the right code twice so the two submissions race. It holds one session that chooses a profile and reads records, and the session ends by itself. p1 also holds a task link for its latest check-in, which is answered and replaced by the next. Staff turn the portal off and on, archive a patient, or move a patient's phone to M. A staff credential and each portal credential are tried on the other side's routes.

| Model state | Code |
| --- | --- |
| `Eligible(p)` | `numberCanSignIn` and `profilesFor` (`portal/session.ts`): a `PatientPortalProfile` on the number with `phoneConfirmedAt`, `portalEnabled`, and the patient not archived |
| `code`, `wrong` | the newest `PortalOtpChallenge` with purpose `SIGN_IN`: `consumedAt`, `expiresAt`, `attempts` |
| `Submit`, `Commit` | `SignInService.verifyCode` reads the challenge, then spends it with a conditional `updateMany` (`consumedAt` null, `expiresAt` later than now, `attempts` below 5) in the transaction that creates the `PortalSession` |
| `sess` | the `PortalSession` row the `__Host-portal_session` cookie names: `revokedAt`, `idleExpiresAt`, `absoluteExpiresAt`, `patientId` |
| `Choose` | `POST /portal/session/profile`; a single-patient number chooses at sign-in, which the model folds into `Choose` |
| `ReadRecord` | any `PortalPatient()` route: `PortalGuard` resolves the session and rebuilds the profile list on every request (`SignInService.resolve`) |
| `RevokeFor` | `revokePatientSessions` and `revokeTaskLinks`, called by `syncPatientPhone` and `setPortalEnabled` in the same transaction as the change |
| `Archive` | `PatientsService.archive` stops the patient's tracks, which cancels their open check-ins; a task link reads only open check-ins |
| `linkAlive`, `checkIn` | `PortalTaskLink.revokedAt` and the state of its check-in |
| `PortalCredentialOnStaffRoute`, `StaffCredentialOnPortalRoute` | `JwtStrategy` reads only `auth_token` or a bearer JWT; `PortalGuard` reads only the portal cookie or a task token. Both refuse in `code` mode, so these actions exist only in the negative controls |

## Rules

| Rule | Code |
| --- | --- |
| `OwnDataOnly` | holds |
| `LinkAnswersOnly` | holds |
| `StaffCookieStaysStaff` | holds |
| `NoCodeToIneligibleNumber` | holds |
| `OneSessionPerCode` | holds |
| `NoSignInWithDeadCode` | holds |
| `ChangeEndsSessions` | holds |

Negative controls, each removing one guard: `noEligibility` (issue a code without the eligibility check), `noAtomic` (consume without the conditional update), `noExpiryCheck`, `noLock`, `noRecheck` (trust the chosen patient without rebuilding the list in the guard), `noRebuild` (choose from the list shown at sign-in), `noRevoke` (no revocation on phone change or portal off), `linkReadsAnswers`, `staffAcceptsPortal`, `portalAcceptsStaff`, `typeProbe`.

`noRevoke` keeps `OwnDataOnly`, because the guard rebuilds the list on every request. Revocation is the second barrier for sessions and the only one for a task link after a phone change.

No rule breaks in `code` mode, so there are no replay tests. The database tests in `backend/src/modules/portal/tests/sign-in.database.spec.ts` drive the same rules through the real service, including four concurrent correct submissions of one code, and `portal-routes.spec.ts` drives the route boundary.

## What the model leaves out

- Time. The five-minute expiry, the 30-minute idle and 24-hour absolute session limits are one `Expire` and one `SessionEnds` step each. The database tests check the exact limits.
- The per-number and clinic-wide limits of PP-57. They are counts, tested in the database spec.
- More than one session. Sessions are independent rows; one is enough for every rule here.
- WhatsApp delivery of the code. The outbound-message model covers sending.

```
python3 verification/state-machines/verify.py --jar tla2tools.jar portal-access
python3 verification/state-machines/chart.py --jar tla2tools.jar portal-access
```
