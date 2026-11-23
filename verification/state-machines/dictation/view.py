TITLE = "Dictation and voice capture"

STEPS = {
    "YouStop": "you press stop",
    "YouDiscard": "you discard or leave the page",
    "ServerAnswersOffer": "the server answers the live offer",
    "ChannelOpens": "the live channel opens",
    "ChannelDrops": "the live channel drops",
    "ServerHearsWords": "OpenAI hears words",
    "ServerAcksCommit": "OpenAI confirms the last words",
    "ServerCompletesItem": "OpenAI completes a piece",
    "ServerFailsItem": "OpenAI fails a piece",
    "ServerSendsFatal": "OpenAI reports an error",
    "ServerAnswersUpload": "the server transcribes the recording",
    "ServerAnswersSpeakers": "the server splits the speakers",
    "ConnectTimerFires": "the 10 second connect timer fires",
    "TailTimerFires": "the last words are committed",
    "FinishTimerFires": "the 8 second finish timer fires",
    "MaxTimerFires": "the 10 minute cap stops it",
    "RequestTimerFires": "the request times out",
    "ServerAnswersFill": "voice fill answers",
    "FillTimerFires": "the 240 second abort fires",
    "YouStartClip": "you press the voice fill button",
    "YouStopClip": "you press stop",
    "YouCancelClip": "you press Escape",
    "BrowserGrantsMic": "the browser grants the microphone",
    "BrowserDeniesMic": "the browser denies the microphone",
    "ClipTimerFires": "the 40 minute cap stops it",
}


def clip_state(c):
    if c["rec"] == "recording":
        return "Clip recording" if c["ui"] else "Recording while the button shows idle"
    return "Asking for the microphone" if c["ui"] else "Voice fill button idle"


def state(v):
    if v["surface"] == "clip":
        return clip_state(v["clip"])
    d = v["ds"]
    if d["failedOnce"] and d["item"] == "final":
        return "Live preview kept a failed piece"
    if d["ended"]:
        return "Voice bar working it out" if v["bar"] == "working" else "Dictation ended"
    if "inflight" in (d["upload"], d["speakers"]):
        return "Waiting for the server's transcript"
    if d["phase"] == "connecting":
        return "Opening the live preview"
    if d["phase"] == "finishing":
        return "Finishing the live transcript"
    return "Listening with live preview" if d["live"] else "Listening, recording only"


def settled_attempt(frm, to):
    a, b = frm["clip"], to["clip"]
    for i, (was, now) in enumerate(zip(a["att"], b["att"])):
        if was == "pending" and now == "settled":
            return i
    return None


def step(action, frm, to):
    if action in ("BrowserGrantsMic", "BrowserDeniesMic"):
        i = settled_attempt(frm, to)
        if i is not None and frm["clip"]["attGen"][i] != frm["clip"]["gen"]:
            return "the browser denies an old request" if action == "BrowserDeniesMic" else "the browser grants an old request"
    return STEPS.get(action, action)
