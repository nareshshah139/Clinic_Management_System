------------------------------ MODULE AccessSession ------------------------------
(* One staff account and the session its browser holds.

   The account lives in two columns of User: status (ACTIVE or SUSPENDED here;
   INACTIVE and PENDING behave like SUSPENDED everywhere) and isActive. Sign-in
   requires both. The session is a signed JWT carrying the role at sign-in and
   an expiry. The model adds a password stamp to each token, the number of
   password resets the account had when the token was signed, so a rule can
   ask whether a session predates the latest reset. Today's tokens carry no
   such claim, so in code mode nothing reads the stamp.

   Actors: you (the staff member) sign in, call a staff route, call a manager
   route and redeem a reset code. A manager suspends and reactivates you,
   demotes and promotes you, and issues a reset code. The clock ages the token.

   Each API call is one atomic step. last holds a snapshot of the account at
   the most recent call or reset, and is cleared by every other step, so the
   safety rules read what the server did at that moment. *)
EXTENDS Naturals

CONSTANTS Lifetime, MODE

Modes == {"code", "fixed", "noAccountCheck", "roleFromToken", "noPasswordStamp",
          "statusOnly", "noExpiry", "codeNoExpiry", "typeProbe"}

ASSUME Lifetime \in Nat \ {0}
ASSUME MODE \in Modes

Roles == {"ADMIN", "RECEPTION"}
Statuses == {"ACTIVE", "SUSPENDED"}
MaxResets == 1
\* held is FALSE while the browser holds no token.
Tokens == [held: BOOLEAN, role: Roles, age: 0..Lifetime, stamp: 0..MaxResets]
NoToken == [held |-> FALSE, role |-> "ADMIN", age |-> 0, stamp |-> 0]
Kinds == {"none", "staffRoute", "managerRoute", "reset"}
Snapshots == [kind: Kinds, granted: BOOLEAN, usable: BOOLEAN, roleNow: Roles, fresh: BOOLEAN]

VARIABLES status, isActive, role, stamp, resetCode, token, last

vars == <<status, isActive, role, stamp, resetCode, token, last>>

-----------------------------------------------------------------------------
(* Which guards run. code and codeNoExpiry are today; every other mode except
   typeProbe is fixed, minus at most one guard. *)
FixedLike == MODE \notin {"code", "codeNoExpiry", "typeProbe"}
ChecksAccount == FixedLike /\ MODE # "noAccountCheck"
RoleFromStore == FixedLike /\ MODE # "roleFromToken"
ChecksStamp == FixedLike /\ MODE # "noPasswordStamp"
SyncsColumns == FixedLike /\ MODE # "statusOnly"
Expires == MODE \notin {"noExpiry", "codeNoExpiry"}

Usable == status = "ACTIVE" /\ isActive

\* passport-jwt verifies the signature and exp claim.
TokenWorks == token.held /\ token.age < Lifetime

\* JwtAuthGuard, then RolesGuard. A manager route is Roles(OWNER, ADMIN).
Accepts(route) ==
  /\ TokenWorks
  /\ ChecksAccount => Usable
  /\ ChecksStamp => token.stamp = stamp
  /\ route = "managerRoute" => (IF RoleFromStore THEN role ELSE token.role) = "ADMIN"

NoCall == [kind |-> "none", granted |-> FALSE, usable |-> TRUE, roleNow |-> "ADMIN", fresh |-> TRUE]

Snap(kind, granted) ==
  [kind |-> kind, granted |-> granted, usable |-> Usable, roleNow |-> role,
   fresh |-> token.held /\ token.stamp = stamp]

-----------------------------------------------------------------------------
Init ==
  /\ status = "ACTIVE"
  /\ isActive = TRUE
  /\ role = "ADMIN"
  /\ stamp = 0
  /\ resetCode = FALSE
  /\ token = NoToken
  /\ last = NoCall

\* POST /auth/login: validateUser refuses unless status is ACTIVE and isActive.
YouSignIn ==
  /\ ~TokenWorks
  /\ Usable
  /\ token' = [held |-> TRUE, role |-> role, age |-> 0, stamp |-> stamp]
  /\ last' = NoCall
  /\ UNCHANGED <<status, isActive, role, stamp, resetCode>>

\* GET /auth/me, an Authenticated() route.
YouCallStaffRoute ==
  /\ token.held
  /\ last' = Snap("staffRoute", Accepts("staffRoute"))
  /\ UNCHANGED <<status, isActive, role, stamp, resetCode, token>>

\* PATCH /users/:id/role, a Roles(OWNER, ADMIN) route.
YouCallManagerRoute ==
  /\ token.held
  /\ last' = Snap("managerRoute", Accepts("managerRoute"))
  /\ UNCHANGED <<status, isActive, role, stamp, resetCode, token>>

\* PATCH /users/:id/status: updateUserStatus writes status only.
ManagerSuspends ==
  /\ status = "ACTIVE"
  /\ status' = IF MODE = "typeProbe" THEN "DELETED" ELSE "SUSPENDED"
  /\ isActive' = IF SyncsColumns THEN FALSE ELSE isActive
  /\ last' = NoCall
  /\ UNCHANGED <<role, stamp, resetCode, token>>

ManagerReactivates ==
  /\ status = "SUSPENDED"
  /\ status' = "ACTIVE"
  /\ isActive' = IF SyncsColumns THEN TRUE ELSE isActive
  /\ last' = NoCall
  /\ UNCHANGED <<role, stamp, resetCode, token>>

\* PATCH /users/:id/role: assignRole writes the stored role.
ManagerDemotes ==
  /\ role = "ADMIN"
  /\ role' = "RECEPTION"
  /\ last' = NoCall
  /\ UNCHANGED <<status, isActive, stamp, resetCode, token>>

ManagerPromotes ==
  /\ role = "RECEPTION"
  /\ role' = "ADMIN"
  /\ last' = NoCall
  /\ UNCHANGED <<status, isActive, stamp, resetCode, token>>

\* POST /auth/users/:id/reset-code: issueResetCode finds the target by isActive.
ManagerIssuesResetCode ==
  /\ isActive
  /\ ~resetCode
  /\ resetCode' = TRUE
  /\ last' = NoCall
  /\ UNCHANGED <<status, isActive, role, stamp, token>>

\* POST /auth/reset-password: resetPassword matches the code and isActive.
\* stamp < MaxResets bounds the model, not the code.
YouResetPassword ==
  /\ resetCode
  /\ isActive
  /\ stamp < MaxResets
  /\ stamp' = stamp + 1
  /\ resetCode' = FALSE
  /\ last' = [kind |-> "reset", granted |-> TRUE, usable |-> Usable, roleNow |-> role, fresh |-> TRUE]
  /\ UNCHANGED <<status, isActive, role, token>>

\* Time passes. A token with no expiry has nothing to age.
Tick ==
  /\ Expires
  /\ token.held
  /\ token.age < Lifetime
  /\ token' = [token EXCEPT !.age = @ + 1]
  /\ last' = NoCall
  /\ UNCHANGED <<status, isActive, role, stamp, resetCode>>

Next ==
  \/ YouSignIn
  \/ YouCallStaffRoute
  \/ YouCallManagerRoute
  \/ ManagerSuspends
  \/ ManagerReactivates
  \/ ManagerDemotes
  \/ ManagerPromotes
  \/ ManagerIssuesResetCode
  \/ YouResetPassword
  \/ Tick

Spec == Init /\ [][Next]_vars /\ WF_vars(Tick)

-----------------------------------------------------------------------------
TypeOK ==
  /\ status \in Statuses
  /\ isActive \in BOOLEAN
  /\ role \in Roles
  /\ stamp \in 0..MaxResets
  /\ resetCode \in BOOLEAN
  /\ token \in Tokens
  /\ last \in Snapshots

\* The two columns say the same thing about whether the account may be used.
ColumnsAgree == isActive = (status = "ACTIVE")

\* The API never answers a suspended account.
NoAccessWhileSuspended ==
  (last.kind \in {"staffRoute", "managerRoute"} /\ last.granted) => last.usable

\* A manager route answers only an account whose stored role is a manager.
RoleIsCurrent ==
  (last.kind = "managerRoute" /\ last.granted) => last.roleNow = "ADMIN"

\* A session signed before the latest password reset no longer works.
ResetEndsOldSessions ==
  (last.kind \in {"staffRoute", "managerRoute"} /\ last.granted) => last.fresh

\* A suspended account cannot redeem a reset code.
NoResetWhileSuspended == last.kind = "reset" => last.usable

\* Every session stops working by itself.
SessionsEnd == [](TokenWorks => <>~TokenWorks)

\* Once the account is suspended, the API stops answering its session,
\* unless a manager reactivates it first.
AccessEnds == [](~Usable => <>(Usable \/ ~Accepts("staffRoute")))
=============================================================================
