# Staff account and session

A clinic manager suspends a receptionist, demotes an admin, or gives someone a password reset code. Each of these is meant to change what that person can do. This model checks whether the change reaches the session the person already holds.

The account lives in two columns of `User`. `status` is ACTIVE, INACTIVE, SUSPENDED or PENDING. `isActive` is a boolean. The session is a signed JWT in the `auth_token` cookie. It carries the user id, email, role and branch at sign-in, and it expires after `JWT_EXPIRES_IN`, which defaults to one day. No server-side session row exists.

## What the model covers

`AccessSession.tla` has one staff account and the one session its browser holds. The staff member signs in, opens a page, uses a manager action and redeems a reset code. A manager suspends and reactivates the account, demotes and promotes it, and issues a reset code. The clock ages the token until it expires.

| Model state | Code |
| --- | --- |
| `status` | `User.status`. INACTIVE and PENDING are read exactly like SUSPENDED by every check, so the model has ACTIVE and SUSPENDED only. |
| `isActive` | `User.isActive`. No endpoint writes it. `UserStatusDto`, `CreateUserDto` and `UpdateUserDto` have no such field, and the global `ValidationPipe` uses `whitelist: true` (`shared/logging/http-observability.ts:168`), so a client cannot slip it in. |
| `role` | `User.role`. ADMIN stands for any manager role and RECEPTION for any other. |
| `token` | The JWT. `role` is its role claim, `age` counts clock ticks up to `Lifetime`. |
| `token.stamp`, `stamp` | Not in the code. The number of password resets the account had when the token was signed, and the number it has now. The fix needs some claim like this, such as `iat` compared with a password-changed time. |
| `resetCode` | `User.resetToken` and `resetTokenExpiry` hold an unused code. |
| `last` | A snapshot of the account at the most recent API call or reset, so the safety rules can say what the server did at that moment. |

## Rules

| Rule | Kind | Code mode |
| --- | --- | --- |
| `TypeOK` | invariant | holds |
| `ColumnsAgree`. The account's status and its active flag say the same thing about whether it may be used. | invariant | breaks |
| `NoAccessWhileSuspended`. The API never answers a session of a suspended account. | invariant | breaks |
| `RoleIsCurrent`. A manager-only route answers only a user whose stored role is a manager role. | invariant | breaks |
| `ResetEndsOldSessions`. A session signed in before the latest password reset no longer works. | invariant | breaks |
| `NoResetWhileSuspended`. A suspended account cannot redeem a password reset code. | invariant | breaks |
| `SessionsEnd`. Every session stops working by itself. | property | holds |
| `AccessEnds`. Once an account is suspended, the API stops answering its session unless a manager reactivates it first. | property | holds |

The two liveness properties hold today only because the token expires. A suspended staff member keeps full API access for the rest of the token's lifetime, one day by default. `NoAccessWhileSuspended` is the safety rule that says access should end at once.

## Findings and replays

Every code-mode break is replayed in `backend/src/modules/auth/tests/access-session.formal-replay.database.spec.ts`. The replay boots `AuthModule` and `UsersModule` with the production guards (`JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`) and the production validation pipe, on a private PostgreSQL schema. It signs in over HTTP and carries the real `auth_token` cookie.

- **ColumnsAgree.** `PATCH /users/:id/status` writes `status` only (`users.service.ts:345`). After a suspension the row reads SUSPENDED with `isActive` true.
- **NoAccessWhileSuspended.** `JwtStrategy.validate` returns the token claims without reading the user (`jwt.strategy.ts:31`). A suspended account's open session keeps answering `GET /auth/me` with 200 while a fresh sign-in gets 403.
- **RoleIsCurrent.** `RolesGuard` reads the role from the token (`roles.guard.ts:31` and `:47`). An admin demoted to RECEPTION calls `PATCH /users/:id/role` on their own account with the old session and is ADMIN again.
- **ResetEndsOldSessions.** `resetPassword` changes the password hash and nothing else (`password-reset.service.ts:58`). The session signed in before the reset keeps working.
- **NoResetWhileSuspended.** `issueResetCode` and `resetPassword` find the account by `isActive` only (`password-reset.service.ts:32` and `:59`). Because suspension never clears `isActive`, a suspended account is issued a code and redeems it.

Each replay has a `.failing` test that asserts the correct outcome and a `today:` test that asserts what the code does now.

## Model to code

| Model | Code |
| --- | --- |
| `YouSignIn`, guard `Usable` | `POST /auth/login` (`auth.controller.ts:67`), `validateUser` refuses unless `status` is ACTIVE and `isActive` is not false (`auth.service.ts:67`), `login` signs id, email, role and branch (`auth.service.ts:88`) |
| `TokenWorks` | passport-jwt with `ignoreExpiration: false` (`jwt.strategy.ts:26`), lifetime `JWT_EXPIRES_IN` (`auth.module.ts:26`), default `1d` (`env.validation.ts:19`) |
| `Accepts`, code mode | `JwtAuthGuard` (`jwt-auth.guard.ts:16`), `JwtStrategy.validate` returns claims only (`jwt.strategy.ts:31`), `RolesGuard` uses `request.user.role` (`roles.guard.ts:31`) |
| `YouCallStaffRoute` | `GET /auth/me`, `Authenticated()` (`auth.controller.ts:138` to `:139`) |
| `YouCallManagerRoute` | `PATCH /users/:id/role`, `Roles(OWNER, ADMIN)` (`users.controller.ts:218`) |
| `ManagerSuspends`, `ManagerReactivates` | `PATCH /users/:id/status` (`users.controller.ts:236`), `updateUserStatus` writes `{ status }` with no from-check (`users.service.ts:334` to `:351`) |
| `ManagerDemotes`, `ManagerPromotes` | `PATCH /users/:id/role`, `assignRole` (`users.service.ts:355`, write at `:373`) |
| `ManagerIssuesResetCode`, guard `isActive` | `POST /auth/users/:id/reset-code` (`auth.controller.ts:41`), `issueResetCode` (`password-reset.service.ts:30`, filter at `:32`) |
| `YouResetPassword`, guard `isActive` | `POST /auth/reset-password` (`auth.controller.ts:53`), `resetPassword` compare-and-set on code, expiry and `isActive` (`password-reset.service.ts:54` to `:63`) |
| `Tick` | wall-clock time against the token's `exp` claim |

## Modes

`fixed` is the smallest change that makes every rule hold. Each negative control removes one guard from `fixed`.

| Mode | What it is | Breaks |
| --- | --- | --- |
| `code` | today | `ColumnsAgree`, `NoAccessWhileSuspended`, `RoleIsCurrent`, `ResetEndsOldSessions`, `NoResetWhileSuspended` |
| `fixed` | `JwtStrategy.validate` reads the user, refuses one that is not ACTIVE with `isActive`, refuses a token older than the latest password change, and returns the stored role. `updateUserStatus` writes `isActive` with `status`. | nothing |
| `noAccountCheck` | the strategy does not refuse a suspended account | `NoAccessWhileSuspended` |
| `roleFromToken` | the role gate keeps reading the token's role | `RoleIsCurrent` |
| `noPasswordStamp` | the strategy does not compare the token with the password change | `ResetEndsOldSessions` |
| `statusOnly` | suspension writes `status` without `isActive` | `ColumnsAgree`, `NoResetWhileSuspended` |
| `noExpiry` | the token has no `exp` claim | `SessionsEnd` |
| `codeNoExpiry` | today's code with no `exp` claim. `JwtService.sign` signs such a token when `signOptions` has no `expiresIn` key. An `expiresIn` that is present but undefined throws instead, and `validateEnv` defaults it to `1d`, so today's tokens always expire. | `SessionsEnd`, `AccessEnds` |
| `typeProbe` | suspension writes a status outside the enum | `TypeOK` |

`AccessEnds` needs a mode with neither the account check nor expiry, because either one alone ends access. That is why `codeNoExpiry` exists. It is a probe, not a negative control of `fixed`.

## Fairness

`Spec == Init /\ [][Next]_vars /\ WF_vars(Tick)`.

- `WF_vars(Tick)`. Wall-clock time passes, so an unexpired token eventually reaches its `exp`. Nobody acts for this to happen.

No user or manager action has fairness. The staff member may never sign in again and a manager may never reactivate the account.

## What the model leaves out

- **Sign-in is one step.** `validateUser` reads the user and `login` signs the token a moment later. A suspension in that gap yields a token for a suspended account. In `fixed` every request reads the account again, so the gap does no harm. In `code` the simpler path already breaks the rule.
- **Self-service password change.** `changePassword` (`users.service.ts:282`) writes the password hash at `:311` and also leaves earlier sessions working. It is the same finding as `ResetEndsOldSessions` and is not a separate action.
- **Logout.** `POST /auth/logout` expires the cookie only (`auth.controller.ts:93`). The token itself stays valid until `exp`, and the login response body also returns it. The model has no logout because no rule here depends on it.
- **Deleted users.** `deleteUser` hard-deletes the row (`users.service.ts:252`). The token still passes `JwtAuthGuard` and `RolesGuard`. `PermissionsGuard` refuses a missing user, so only `Permissions()` routes are closed.
- **PermissionsGuard's OWNER bypass** reads the role from the token (`permissions.guard.ts:47`), so a demoted OWNER keeps the bypass on `Permissions()` routes. ADMIN and DOCTOR bypasses read the stored role. The model's manager route is a `Roles()` route.
- **Cookie lifetime.** The cookie lasts 7 days (`auth.controller.ts:84`) and the token one day. After a day the browser sends an expired token, gets 401 and is sent to sign-in. This is a client nuisance, not an access gap.
- **The client session** (`client-auth-session` in the census). The middleware, the dashboard layout and the 401 redirect are frontend code, and this unit's replay is backend only. Two client leads are worth their own model. `apiClient.logout` swallows a failed `POST /auth/logout`, so on a shared computer the cookie can survive a logout. A 401 from `/auth/me` triggers two navigations, one of which drops the return path.
- **Reset code expiry** (24 hours) and the one-code-per-user replacement are not modelled. `password-reset.database.spec.ts` covers them.
- **PENDING** has no producer except an explicit status write, and no activation flow. It behaves like SUSPENDED.
- **Bounds.** One account, one session, two roles, `Lifetime = 2` ticks and at most one password reset (`stamp < MaxResets` is a model bound, not a code guard).
