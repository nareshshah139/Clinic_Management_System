; benchmark generated from python API
(set-info :status unknown)
(declare-fun q () Int)
(declare-fun h () Int)
(declare-fun p () Int)
(assert
 (>= q 0))
(assert
 (>= h 0))
(assert
 (<= h q))
(assert
 (>= p h))
(assert
 (let (($x58 (<= h p)))
(let (($x16 (>= h 0)))
(let (($x59 (and (= (+ q (- p q)) p) $x16 $x58)))
(not $x59)))))
(check-sat)
