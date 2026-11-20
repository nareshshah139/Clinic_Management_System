# Staff account and session, before mode

TLC explored 476 states and 2582 steps. The chart has 8 states and 29 arrows.

| Rule | Kind | Result |
| --- | --- | --- |
| TypeOK | invariant | holds |
| ColumnsAgree | invariant | breaks |
| NoAccessWhileSuspended | invariant | breaks |
| RoleIsCurrent | invariant | breaks |
| ResetEndsOldSessions | invariant | breaks |
| NoResetWhileSuspended | invariant | breaks |
| SessionsEnd | property | holds |
| AccessEnds | property | holds |

Holds: TypeOK, SessionsEnd, AccessEnds.

## ColumnsAgree breaks

The account's status and its active flag say the same thing about whether it may be used.

1. Signed out
2. a manager suspends you: Signed out, account suspended

## NoAccessWhileSuspended breaks

The API never answers a session of a suspended account.

1. Signed out
2. you sign in: Signed in
3. a manager suspends you: Suspended, browser still holds a session
4. you open a page: The API serves a suspended account

## RoleIsCurrent breaks

A manager-only route answers only a user whose stored role is a manager role.

1. Signed out
2. you sign in: Signed in
3. a manager demotes you: Signed in
4. you use a manager action: The API lets a demoted user act as admin

## ResetEndsOldSessions breaks

A session signed in before the latest password reset no longer works.

1. Signed out
2. you sign in: Signed in
3. a manager gives you a reset code: Signed in
4. you reset your password: Signed in
5. you open a page: The API serves a session from before the reset

## NoResetWhileSuspended breaks

A suspended account cannot redeem a password reset code.

1. Signed out
2. a manager suspends you: Signed out, account suspended
3. a manager gives you a reset code: Signed out, account suspended
4. you reset your password: A suspended account resets its password
