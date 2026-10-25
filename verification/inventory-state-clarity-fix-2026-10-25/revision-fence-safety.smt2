; benchmark generated from python API
(set-info :status unknown)
(declare-fun expected_version () Int)
(declare-fun current_version () Int)
(assert
 (>= current_version expected_version))
(assert
 (>= expected_version 0))
(assert
 (let (($x81 (= current_version expected_version)))
(let ((?x75 (ite $x81 (+ current_version 1) current_version)))
(= ?x75 expected_version))))
(check-sat)
