SPEC = "AccessSession.tla"
CONSTANTS = {"Lifetime": "2"}
MODES = {
    "before": {"MODE": '"before"'},
    "code": {"MODE": '"code"'},
    "fixed": {"MODE": '"fixed"'},
    "noAccountCheck": {"MODE": '"noAccountCheck"'},
    "roleFromToken": {"MODE": '"roleFromToken"'},
    "noPasswordStamp": {"MODE": '"noPasswordStamp"'},
    "statusOnly": {"MODE": '"statusOnly"'},
    "noExpiry": {"MODE": '"noExpiry"'},
    "codeNoExpiry": {"MODE": '"codeNoExpiry"'},
    "typeProbe": {"MODE": '"typeProbe"'},
}
RULES = {
    "TypeOK": "invariant",
    "ColumnsAgree": "invariant",
    "NoAccessWhileSuspended": "invariant",
    "RoleIsCurrent": "invariant",
    "ResetEndsOldSessions": "invariant",
    "NoResetWhileSuspended": "invariant",
    "SessionsEnd": "property",
    "AccessEnds": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays inside its declared set of values.",
    "ColumnsAgree": "The account's status and its active flag say the same thing about whether it may be used.",
    "NoAccessWhileSuspended": "The API never answers a session of a suspended account.",
    "RoleIsCurrent": "A manager-only route answers only a user whose stored role is a manager role.",
    "ResetEndsOldSessions": "A session signed in before the latest password reset no longer works.",
    "NoResetWhileSuspended": "A suspended account cannot redeem a password reset code.",
    "SessionsEnd": "Every session stops working by itself.",
    "AccessEnds": "Once an account is suspended, the API stops answering its session unless a manager reactivates it first.",
}
EXPECT = {
    "before": {
        "TypeOK": "holds",
        "ColumnsAgree": "breaks",
        "NoAccessWhileSuspended": "breaks",
        "RoleIsCurrent": "breaks",
        "ResetEndsOldSessions": "breaks",
        "NoResetWhileSuspended": "breaks",
        "SessionsEnd": "holds",
        "AccessEnds": "holds",
    },
    "code": {rule: "holds" for rule in RULES},
    "fixed": {rule: "holds" for rule in RULES},
    "noAccountCheck": {"NoAccessWhileSuspended": "breaks", "AccessEnds": "holds"},
    "roleFromToken": {"RoleIsCurrent": "breaks"},
    "noPasswordStamp": {"ResetEndsOldSessions": "breaks"},
    "statusOnly": {"ColumnsAgree": "breaks", "NoResetWhileSuspended": "breaks", "NoAccessWhileSuspended": "holds"},
    "noExpiry": {"SessionsEnd": "breaks", "AccessEnds": "holds"},
    "codeNoExpiry": {"SessionsEnd": "breaks", "AccessEnds": "breaks"},
    "typeProbe": {"TypeOK": "breaks"},
}
CHARTS = ["before", "code"]
REPLAYS = {}
