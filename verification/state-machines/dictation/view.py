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
}


def state(v):
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


def step(action, frm, to):
    return STEPS.get(action, action)
