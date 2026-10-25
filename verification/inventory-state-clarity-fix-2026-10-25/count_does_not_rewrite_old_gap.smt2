; benchmark generated from python API
(set-info :status unknown)
(declare-fun q () Int)
(declare-fun p () Int)
(declare-fun old_ledger () Int)
(assert
 (>= q 0))
(assert
 (>= p 0))
(assert
 (let (($x40 (= (- p (+ old_ledger (- p q))) (- q old_ledger))))
(not $x40)))
(check-sat)
