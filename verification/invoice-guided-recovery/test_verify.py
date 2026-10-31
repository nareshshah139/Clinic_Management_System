import unittest

from verify import project, recovery


class RecoveryEvidenceTests(unittest.TestCase):
    def test_replacement_cannot_rescue_a_trapped_invoice(self):
        states = {"trapped": {"phase": "blocked", "invoice": "A"}, "other": {"phase": "ready", "invoice": "B"}}
        distance, _, _ = recovery(states, [("trapped", "other", "ReplaceEditor")])
        self.assertEqual(distance, {"other": 0})

    def test_even_mislabelled_cross_invoice_edges_are_excluded(self):
        states = {"trapped": {"phase": "blocked", "invoice": "A"}, "other": {"phase": "ready", "invoice": "B"}}
        distance, _, _ = recovery(states, [("trapped", "other", "CheckReady")])
        self.assertNotIn("trapped", distance)

    def test_invalidation_cannot_count_as_repair(self):
        states = {"failed": {"phase": "blocked", "invoice": "A"}, "ready": {"phase": "ready", "invoice": "A"}}
        distance, _, _ = recovery(states, [("failed", "ready", "InvalidateEditor")])
        self.assertNotIn("failed", distance)

    def test_repair_witness_preserves_invoice_and_uses_shortest_path(self):
        states = {key: {"phase": phase, "invoice": "A"} for key, phase in
                  (("failed", "checkFailed"), ("checking", "checking"), ("ready", "ready"))}
        edges = [("failed", "checking", "BeginCheck"), ("checking", "failed", "CheckFailure"),
                 ("checking", "ready", "CheckReady")]
        distance, witness, _ = recovery(states, edges)
        self.assertEqual(distance, {"ready": 0, "checking": 1, "failed": 2})
        self.assertEqual(witness["failed"], ("checking", "BeginCheck"))

    def test_one_recoverable_member_cannot_color_an_entire_node(self):
        states = {"good": {"phase": "unchecked", "invoice": "A"}, "bad": {"phase": "unchecked", "invoice": "A"}}
        with self.assertRaisesRegex(ValueError, "Unrecoverable states in projected node unchecked"):
            project(states, [], {"good": 1}, {})


if __name__ == "__main__":
    unittest.main()
