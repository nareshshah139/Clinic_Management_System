import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location("access_session_model", Path(__file__).with_name("model.py"))
_model = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_model)
LIFETIME = int(_model.CONSTANTS["Lifetime"])

TITLE = "Staff account and session"


def _served(v):
    last = v["last"]
    if last["kind"] == "reset" and not last["usable"]:
        return "A suspended account resets its password"
    if last["kind"] not in ("staffRoute", "managerRoute") or not last["granted"]:
        return None
    if not last["usable"]:
        return "The API serves a suspended account"
    if last["kind"] == "managerRoute" and last["roleNow"] != "ADMIN":
        return "The API lets a demoted user act as admin"
    if not last["fresh"]:
        return "The API serves a session from before the reset"
    return None


def state(v):
    served = _served(v)
    if served:
        return served
    token = v["token"]
    suspended = v["status"] != "ACTIVE"
    if not (token["held"] and token["age"] < LIFETIME):
        return "Signed out, account suspended" if suspended else "Signed out"
    return "Suspended, browser still holds a session" if suspended else "Signed in"


STEPS = {
    "YouSignIn": "you sign in",
    "YouCallStaffRoute": "you open a page",
    "YouCallManagerRoute": "you use a manager action",
    "ManagerSuspends": "a manager suspends you",
    "ManagerReactivates": "a manager reactivates you",
    "ManagerDemotes": "a manager demotes you",
    "ManagerPromotes": "a manager promotes you",
    "ManagerIssuesResetCode": "a manager gives you a reset code",
    "YouResetPassword": "you reset your password",
    "Tick": "the session expires",
}


def step(action, frm, to):
    if action == "Tick" and to["token"]["age"] < LIFETIME:
        return "time passes"
    return STEPS.get(action, action)
