; benchmark generated from python API
(set-info :status unknown)
(declare-fun p () Int)
(declare-fun signed () Int)
(declare-fun q () Int)
(declare-fun d () Int)
(assert
 (>= p 0))
(assert
 (= q (+ p signed)))
(assert
 (let ((?x72 (+ q d)))
 (>= ?x72 0)))
(assert
 (let ((?x72 (+ q d)))
(let (($x31 (= ?x72 (+ p (+ signed d)))))
(not $x31))))
(check-sat)
