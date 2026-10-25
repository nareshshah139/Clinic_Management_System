; benchmark generated from python API
(set-info :status unknown)
(declare-fun q () Int)
(declare-fun h () Int)
(declare-fun r () Int)
(declare-fun d () Int)
(assert
 (>= q 0))
(assert
 (>= h 0))
(assert
 (<= h q))
(assert
 (>= r 0))
(assert
 (<= r h))
(assert
 (let ((?x21 (- h r)))
 (let ((?x20 (+ q d)))
 (>= ?x20 ?x21))))
(assert
 (let ((?x20 (+ q d)))
(let (($x23 (>= ?x20 0)))
(let (($x26 (and $x23 (>= (- h r) 0) (<= (- h r) ?x20))))
(not $x26)))))
(check-sat)
