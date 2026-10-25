; benchmark generated from python API
(set-info :status unknown)
(declare-fun other () Int)
(declare-fun c () Int)
(declare-fun q () Int)
(assert
 (>= other 0))
(assert
 (>= c 0))
(assert
 (>= q other))
(assert
 (let ((?x33 (+ other c)))
(let (($x26 (>= ?x33 0)))
(let ((?x79 (+ q c)))
(let (($x51 (>= ?x79 0)))
(let (($x22 (and $x51 $x26 (<= ?x33 ?x79))))
(not $x22)))))))
(check-sat)
