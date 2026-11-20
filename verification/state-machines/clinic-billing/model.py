SPEC = "ClinicBilling.tla"
CONSTANTS = {
    "StartTotal": "4",
    "Totals": "{2, 4}",
    "PayAmounts": "{2}",
    "RefundAmount": "2",
    "MaxRows": "4",
    "Confirmers": "{c1, c2}",
}
MODES = {m: {"MODE": f'"{m}"'} for m in (
    "code", "fixed", "staleBalance", "editBelowReceived", "unlinkedRefund",
    "confirmWithoutCAS", "noReconciler", "typeProbe")}
RULES = {
    "TypeOK": "invariant",
    "BalanceMatches": "invariant",
    "ReceivedWithinTotal": "invariant",
    "RefundsWithinPayment": "invariant",
    "ReceivedMatchesPayments": "invariant",
    "GatewayPaymentSettles": "property",
}
RULE_TEXT = {
    "TypeOK": "Every variable stays within its declared values.",
    "BalanceMatches": "The balance due is the total less what the bill has received, as billing.service.ts computes it.",
    "ReceivedWithinTotal": "A bill never holds more money than its total.",
    "RefundsWithinPayment": "The refunds of one payment never add up to more than that payment.",
    "ReceivedMatchesPayments": "What the bill has received equals its completed payments less its refunds.",
    "GatewayPaymentSettles": "A gateway payment nobody confirms does not stay pending forever.",
}
ALL = list(RULES)
EXPECT = {
    "code": {r: "holds" for r in ALL} | {
        "BalanceMatches": "breaks",
        "ReceivedWithinTotal": "breaks",
        "RefundsWithinPayment": "breaks",
        "GatewayPaymentSettles": "breaks",
    },
    "fixed": {r: "holds" for r in ALL},
    "staleBalance": {"BalanceMatches": "breaks"},
    "editBelowReceived": {"ReceivedWithinTotal": "breaks"},
    "unlinkedRefund": {"RefundsWithinPayment": "breaks"},
    "confirmWithoutCAS": {"ReceivedMatchesPayments": "breaks"},
    "noReconciler": {"GatewayPaymentSettles": "breaks"},
    "typeProbe": {"TypeOK": "breaks"},
}
CHARTS = ["code", "fixed"]
REPLAYS = {
    r: "backend/src/modules/billing/tests/clinic-billing.formal-replay.database.spec.ts"
    for r, v in EXPECT["code"].items() if v == "breaks"
}
