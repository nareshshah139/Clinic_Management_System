TITLE = "Clinic bill payments"

STEPS = {
    "DeskTakesPayment": "the desk takes a payment",
    "DeskStartsGatewayPayment": "the desk starts a card or UPI payment",
    "DeskOpensConfirm": "the desk opens a confirmation",
    "DeskConfirms": "the desk confirms the card or UPI payment",
    "DeskRefunds": "the admin refunds a payment",
    "AdminOpensEdit": "the admin opens the bill to edit",
    "AdminSavesEdit": "the admin saves an edited bill",
    "GatewayPaymentExpires": "the system closes an unconfirmed payment",
}


def _refunds_over(v):
    pays = v["pays"]
    for i, row in enumerate(pays, start=1):
        if row["kind"] != "refund":
            refunded = sum(r["amt"] for r in pays if r["kind"] == "refund" and r["of"] == i)
            if refunded > row["amt"]:
                return True
    return False


def state(v):
    total, received, balance = v["total"], v["received"], v["balance"]
    problems = []
    if balance != max(total - received, 0):
        problems.append("the balance due is wrong")
    if received > total:
        problems.append("the bill holds more than its total")
    if _refunds_over(v):
        problems.append("a payment is refunded twice")
    if problems:
        return "Bill wrong: " + " and ".join(problems)
    if any(r["st"] == "PENDING" for r in v["pays"]):
        return "Card or UPI payment waiting for confirmation"
    if received < total:
        return "Money due"
    return "Paid in full"


def step(action, frm, to):
    return STEPS.get(action, action)
