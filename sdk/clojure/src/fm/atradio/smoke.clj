(ns fm.atradio.smoke
  "Live read smoke test. Run: clojure -M:smoke"
  (:require [fm.atradio.core :as at]))

(defn -main [& _]
  (let [recent (at/recent-stations 3)]
    (println "recent-stations:" (count recent)
             "— first:" (get-in (first recent) ["station" "name"])))
  (println "popular-stations:" (count (at/popular-stations 3)))
  (println "global-recently-played:" (count (at/global-recently-played 3)))
  (let [rk (at/favorite-rkey "rb:00000000-0000-0000-0000-000000000000")]
    (println "favorite-rkey(rb:0000…):" rk "(len" (count rk) ")")
    (assert (= 16 (count rk)) "favorite rkey must be 16-char hex"))
  (println "Clojure read smoke OK")
  (shutdown-agents))
