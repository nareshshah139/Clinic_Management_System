; benchmark generated from python API
(set-info :status unknown)
(declare-fun q () Int)
(declare-fun h () Int)
(declare-fun p () Int)
(declare-fun d () Int)
(assert
 (>= q 0))
(assert
 (>= h 0))
(assert
 (<= h q))
(assert
 (>= p 0))
(assert
 (< p h))
(assert
 (= d (- h p)))
(assert
 (let (($x43 (and (>= (- q d) (- h d)) (= (- h d) p) (= (+ (- q d) (- p (- q d))) p))))
(not $x43)))
(check-sat)
