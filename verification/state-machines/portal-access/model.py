SPEC = "PortalAccess.tla"
CONSTANTS = {}
MODES = {m: {"MODE": f'"{m}"'} for m in [
    "code", "fixed", "noEligibility", "noAtomic", "noExpiryCheck", "noLock", "noRecheck", "noRebuild",
    "noRevoke", "linkReadsAnswers", "staffAcceptsPortal", "portalAcceptsStaff", "typeProbe",
]}
RULES = {
    "TypeOK": "invariant",
    "OwnDataOnly": "invariant",
    "LinkAnswersOnly": "invariant",
    "StaffCookieStaysStaff": "invariant",
    "NoCodeToIneligibleNumber": "invariant",
    "OneSessionPerCode": "invariant",
    "NoSignInWithDeadCode": "invariant",
    "ChangeEndsSessions": "invariant",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays inside its declared set of values.",
    "OwnDataOnly": "A session reads only the profile it chose, while that patient still has the number, the portal on, and is not archived.",
    "LinkAnswersOnly": "A task link reads only the questions of its patient's open check-in, never a stored answer, and nothing once revoked.",
    "StaffCookieStaysStaff": "No portal credential opens a staff route and no staff credential opens a portal route.",
    "NoCodeToIneligibleNumber": "A code is issued only to a number with a confirmed, portal-enabled, unarchived patient.",
    "OneSessionPerCode": "One code yields at most one session, however many correct submissions race.",
    "NoSignInWithDeadCode": "No session comes from an expired code or one with five wrong attempts.",
    "ChangeEndsSessions": "Turning a patient's portal off or changing their phone ends every session that chose them.",
}
EXPECT = {
    "code": {rule: "holds" for rule in RULES},
    "fixed": {rule: "holds" for rule in RULES},
    "noEligibility": {"NoCodeToIneligibleNumber": "breaks"},
    "noAtomic": {"OneSessionPerCode": "breaks"},
    "noExpiryCheck": {"NoSignInWithDeadCode": "breaks", "OneSessionPerCode": "holds"},
    "noLock": {"NoSignInWithDeadCode": "breaks", "OneSessionPerCode": "holds"},
    "noRecheck": {"OwnDataOnly": "breaks", "ChangeEndsSessions": "holds"},
    "noRebuild": {"OwnDataOnly": "breaks"},
    "noRevoke": {"ChangeEndsSessions": "breaks", "LinkAnswersOnly": "breaks", "OwnDataOnly": "holds"},
    "linkReadsAnswers": {"LinkAnswersOnly": "breaks", "OwnDataOnly": "holds"},
    "staffAcceptsPortal": {"StaffCookieStaysStaff": "breaks"},
    "portalAcceptsStaff": {"StaffCookieStaysStaff": "breaks"},
    "typeProbe": {"TypeOK": "breaks"},
}
CHARTS = ["code"]
REPLAYS = {}
TITLE = "Portal access: code, session, profile, task link"
