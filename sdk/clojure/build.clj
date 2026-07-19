(ns build
  "Build the Clojars jar for the atradio Clojure SDK.

  Coordinate: fm.atradio/sdk (reverse-domain group — atradio.fm is owned).
  Run: clojure -T:build jar   (after ./build.sh has produced native/).

  NOTE: the native library in native/ is platform-specific. This jar bundles the
  host's lib; a real multi-platform release should ship per-platform classifiers
  or download the matching lib on first load (as the Erlang SDK does)."
  (:require [clojure.tools.build.api :as b]))

(def lib 'fm.atradio/sdk)
(def version "0.1.0")
(def class-dir "target/classes")
(def basis (delay (b/create-basis {:project "deps.edn"})))
(def jar-file (format "target/atradio-sdk-%s.jar" version))

(defn clean [_] (b/delete {:path "target"}))

(defn jar [_]
  (clean nil)
  (b/write-pom {:class-dir class-dir
                :lib lib
                :version version
                :basis @basis
                :src-dirs ["src"]
                :scm {:url "https://github.com/tsirysndr/atradio.fm"
                      :tag (str "clojure-v" version)}})
  (b/copy-dir {:src-dirs ["src" "native"] :target-dir class-dir})
  (b/jar {:class-dir class-dir :jar-file jar-file})
  (println "wrote" jar-file))
