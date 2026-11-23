# Staff account and session

A clinic manager suspends a receptionist, demotes an admin, or gives someone a password reset code. Each of these is meant to change what that person can do. This model checks whether the change reaches the session the person already holds.

The account lives in two columns of `User`. `status` is ACTIVE, INACTIVE, SUSPENDED or PENDING. `isActive` is a boolean. The session is a signed JWT in the `auth_token` cookie. It carries the user id, email, role and branch at sign-in, plus `pwdStamp`, a digest of the password hash. It expires after `JWT_EXPIRES_IN`, which defaults to one day. No server-side session row exists. Every request reads the user row again.

## What the model covers

`AccessSession.tla` has one staff account and the one session its browser holds. The staff member signs in, opens a page, uses a manager action and redeems a reset code. A manager suspends and reactivates the account, demotes and promotes it, and issues a reset code. The clock ages the token until it expires.

| Model state | Code |
| --- | --- |
| `status` | `User.status`. INACTIVE and PENDING are read exactly like SUSPENDED by every check, so the model has ACTIVE and SUSPENDED only. |
| `isActive` | `User.isActive`. Only a status write sets it, through `statusColumns` (`users.service.ts:13`). `UserStatusDto`, `CreateUserDto` and `UpdateUserDto` have no such field, and the global `ValidationPipe` uses `whitelist: true` (`shared/logging/http-observability.ts:168`), so a client cannot slip it in. |
| `role` | `User.role`. ADMIN stands for any manager role and RECEPTION for any other. |
| `token` | The JWT. `role` is its role claim, `age` counts clock ticks up to `Lifetime`. |
| `token.stamp`, `stamp` | The number of password resets the account had when the token was signed, and the number it has now. The code's `pwdStamp` claim is the first 16 base64url characters of the SHA-256 of the stored bcrypt hash (`jwt.strategy.ts:11`). Every reset or change writes a new hash with a new salt, so the digest changes exactly when the model's count does. |
| `resetCode` | `User.resetToken` and `resetTokenExpiry` hold an unused code. |
| `last` | A snapshot of the account at the most recent API call or reset, so the safety rules can say what the server did at that moment. |

## Rules

| Rule | Kind | Before the fix | Code |
| --- | --- | --- | --- |
| `TypeOK` | invariant | holds | holds |
| `ColumnsAgree`. The account's status and its active flag say the same thing about whether it may be used. | invariant | breaks | holds |
| `NoAccessWhileSuspended`. The API never answers a session of a suspended account. | invariant | breaks | holds |
| `RoleIsCurrent`. A manager-only route answers only a user whose stored role is a manager role. | invariant | breaks | holds |
| `ResetEndsOldSessions`. A session signed in before the latest password reset no longer works. | invariant | breaks | holds |
| `NoResetWhileSuspended`. A suspended account cannot redeem a password reset code. | invariant | breaks | holds |
| `SessionsEnd`. Every session stops working by itself. | property | holds | holds |
| `AccessEnds`. Once an account is suspended, the API stops answering its session unless a manager reactivates it first. | property | holds | holds |

Before the fix the two liveness properties held only because the token expires. A suspended staff member kept full API access for the rest of the token's lifetime, one day by default. Now the next request after a suspension gets 401, which is what `NoAccessWhileSuspended` asks for.

## Findings and replays

TLC found five breaks in the code before the fix. `results/before.md` has the shortest path to each. Each is replayed in `backend/src/modules/auth/tests/access-session.formal-replay.database.spec.ts`, which now asserts the fixed outcome as a plain test. The replay boots `AuthModule` and `UsersModule` with the production guards (`JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`) and the production validation pipe, on a private PostgreSQL schema. It signs in over HTTP and carries the real `auth_token` cookie.

- **ColumnsAgree.** `PATCH /users/:id/status` wrote `status` only. After a suspension the row read SUSPENDED with `isActive` true.
- **NoAccessWhileSuspended.** `JwtStrategy.validate` returned the token claims without reading the user. A suspended account's open session kept answering `GET /auth/me` with 200 while a fresh sign-in got 403.
- **RoleIsCurrent.** `RolesGuard` read the role from the token. An admin demoted to RECEPTION called `PATCH /users/:id/role` on their own account with the old session and was ADMIN again.
- **ResetEndsOldSessions.** `resetPassword` changed the password hash and nothing else. The session signed in before the reset kept working.
- **NoResetWhileSuspended.** `issueResetCode` and `resetPassword` found the account by `isActive` only. Because suspension never cleared `isActive`, a suspended account was issued a code and redeemed it.

The replay of `NoResetWhileSuspended` no longer follows TLC's `before` path, because a suspended account is now issued no code. It issues the code first, suspends, and checks that both a new issue and the redemption are refused. Two replays write a SUSPENDED row with `isActive` still set, which rows saved before the fix can hold, and check that the session and the reset are refused anyway. A third replay checks that `POST /users/:id/change-password` ends the earlier session too.

## The fix

| Guard | Code | Rules |
| --- | --- | --- |
| Every status write also writes `isActive = (status = ACTIVE)`. | `statusColumns` at `users.service.ts:13`, used by `createUser` at `:123`, `updateUser` at `:243` and `updateUserStatus` at `:348` | `ColumnsAgree`, `NoResetWhileSuspended` |
| `validate` reads the user by `sub` and answers 401 unless it exists, is ACTIVE and has `isActive` set. | `jwt.strategy.ts:41` to `:51` | `NoAccessWhileSuspended` |
| `validate` puts the stored role, email and branch on `request.user`, so `RolesGuard` (`roles.guard.ts:47`) and the OWNER bypass in `PermissionsGuard` (`permissions.guard.ts:47`) read the stored role. | `jwt.strategy.ts:53` | `RoleIsCurrent` |
| `login` signs `pwdStamp` from the stored hash, and `validate` answers 401 when it no longer matches. This covers `resetPassword` and `changePassword` alike. | `auth.service.ts:91` and `:97`, `jwt.strategy.ts:48` | `ResetEndsOldSessions` |
| Issuing and redeeming a reset code require ACTIVE and `isActive`, as sign-in does. | `USABLE` at `password-reset.service.ts:13`, used at `:36`, `:51` and `:63` | `NoResetWhileSuspended` |

The `fixed` mode needs only the `isActive` check on the reset paths, because with `statusColumns` the two columns always agree. The code checks both columns because rows saved before the fix can be SUSPENDED with `isActive` set, and no migration rewrites them. The model's `code` mode has this stronger guard as `ResetAllowed`.

Tokens issued before the fix carry no `pwdStamp`, so `validate` refuses them and every user signs in once after deploy.

## Model to code

| Model | Code |
| --- | --- |
| `YouSignIn`, guard `Usable` | `POST /auth/login` (`auth.controller.ts:67`), `validateUser` refuses unless `status` is ACTIVE and `isActive` is not false (`auth.service.ts:68`), `login` signs id, email, role, branch and `pwdStamp` (`auth.service.ts:90`) |
| `TokenWorks` | passport-jwt with `ignoreExpiration: false` (`jwt.strategy.ts:36`), lifetime `JWT_EXPIRES_IN` (`auth.module.ts:26`), default `1d` (`env.validation.ts:21`) |
| `Accepts` | `JwtAuthGuard` (`jwt-auth.guard.ts:16`). In `code`, `JwtStrategy.validate` reads the account and the stamp (`jwt.strategy.ts:41`), and `RolesGuard` uses `request.user.role`, now the stored role (`roles.guard.ts:47`). In `before`, `validate` returned the claims only. |
| `YouCallStaffRoute` | `GET /auth/me`, `Authenticated()` (`auth.controller.ts:138` to `:139`) |
| `YouCallManagerRoute` | `PATCH /users/:id/role`, `Roles(OWNER, ADMIN)` (`users.controller.ts:218`) |
| `ManagerSuspends`, `ManagerReactivates` | `PATCH /users/:id/status` (`users.controller.ts:236`), `updateUserStatus` writes `statusColumns(status)` with no from-check (`users.service.ts:337` to `:355`) |
| `ManagerDemotes`, `ManagerPromotes` | `PATCH /users/:id/role`, `assignRole` (`users.service.ts:358`, write at `:379`) |
| `ManagerIssuesResetCode`, guard `ResetAllowed` | `POST /auth/users/:id/reset-code` (`auth.controller.ts:41`), `issueResetCode` (`password-reset.service.ts:34`, filter at `:36`) |
| `YouResetPassword`, guard `ResetAllowed` | `POST /auth/reset-password` (`auth.controller.ts:54`), `resetPassword` compare-and-set on code, expiry, `status` and `isActive` (`password-reset.service.ts:58` to `:68`) |
| `Tick` | wall-clock time against the token's `exp` claim |

## Modes

`fixed` is the smallest change that makes every rule hold. Each negative control removes one guard from `fixed`.

| Mode | What it is | Breaks |
| --- | --- | --- |
| `before` | the code before the fix, kept as a regression control | `ColumnsAgree`, `NoAccessWhileSuspended`, `RoleIsCurrent`, `ResetEndsOldSessions`, `NoResetWhileSuspended` |
| `code` | the code now. `fixed`, with reset guards that check both columns. | nothing |
| `fixed` | `JwtStrategy.validate` reads the user, refuses one that is not ACTIVE with `isActive`, refuses a token older than the latest password change, and returns the stored role. `updateUserStatus` writes `isActive` with `status`. | nothing |
| `noAccountCheck` | the strategy does not refuse a suspended account | `NoAccessWhileSuspended` |
| `roleFromToken` | the role gate keeps reading the token's role | `RoleIsCurrent` |
| `noPasswordStamp` | the strategy does not compare the token with the password change | `ResetEndsOldSessions` |
| `statusOnly` | suspension writes `status` without `isActive` | `ColumnsAgree`, `NoResetWhileSuspended` |
| `noExpiry` | the token has no `exp` claim | `SessionsEnd` |
| `codeNoExpiry` | the code before the fix with no `exp` claim. `JwtService.sign` signs such a token when `signOptions` has no `expiresIn` key. An `expiresIn` that is present but undefined throws instead, and `validateEnv` defaults it to `1d`, so tokens always expire. | `SessionsEnd`, `AccessEnds` |
| `typeProbe` | suspension writes a status outside the enum | `TypeOK` |

`AccessEnds` needs a mode with neither the account check nor expiry, because either one alone ends access. That is why `codeNoExpiry` exists. It is a probe, not a negative control of `fixed`.

## Fairness

`Spec == Init /\ [][Next]_vars /\ WF_vars(Tick)`.

- `WF_vars(Tick)`. Wall-clock time passes, so an unexpired token eventually reaches its `exp`. Nobody acts for this to happen.

No user or manager action has fairness. The staff member may never sign in again and a manager may never reactivate the account.

## What the model leaves out

- **Sign-in is one step.** `validateUser` reads the user and `login` signs the token a moment later. A suspension in that gap yields a token for a suspended account. Every request reads the account again, so the gap does no harm.
- **Self-service password change.** `changePassword` (`users.service.ts:285`) writes a new hash at `:316`. The stamp changes with the hash, so earlier sessions end, including the one that made the change. No screen calls this route today. A caller that does must sign in again with the new password.
- **Logout.** `POST /auth/logout` expires the cookie only (`auth.controller.ts:94`). The token itself stays valid until `exp`, a password change or a suspension, and the login response body also returns it. The model has no logout because no rule here depends on it.
- **Deleted users.** `deleteUser` hard-deletes the row (`users.service.ts:277`). `validate` finds no user and answers 401 on every route.
- **Cookie lifetime.** The cookie lasts 7 days (`auth.controller.ts:84`) and the token one day. After a day the browser sends an expired token, gets 401 and is sent to sign-in. This is a client nuisance, not an access gap.
- **The client session** (`client-auth-session` in the census). The middleware, the dashboard layout and the 401 redirect are frontend code, and this unit's replay is backend only. Two client leads are worth their own model. `apiClient.logout` swallows a failed `POST /auth/logout`, so on a shared computer the cookie can survive a logout. A 401 from `/auth/me` triggers two navigations, one of which drops the return path.
- **Reset code expiry** (24 hours) and the one-code-per-user replacement are not modelled. `password-reset.database.spec.ts` covers them.
- **PENDING** has no producer except an explicit status write, and no activation flow. It behaves like SUSPENDED.
- **Rows saved before the fix** can hold SUSPENDED with `isActive` set. The model's columns always agree in `code`, so it cannot show such a row. The replays cover it.
- **Bounds.** One account, one session, two roles, `Lifetime = 2` ticks and at most one password reset (`stamp < MaxResets` is a model bound, not a code guard).
