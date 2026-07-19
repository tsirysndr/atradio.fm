(ns build
  "Build the Clojars jar for the atradio Clojure SDK.

  Coordinate: fm.atradio/sdk (reverse-domain group — atradio.fm is owned).
  Run: clojure -T:build jar

  The jar ships src + resources/ (including atradio/manifest.json) but NOT the
  ~11 MB native library: fm.atradio.native downloads the matching prebuilt from
  the GitHub release on first load, verifying it against the manifest checksum."
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
  ;; Ship source + resources (manifest.json); the native lib is downloaded on
  ;; first load, never bundled.
  (b/copy-dir {:src-dirs ["src" "resources"] :target-dir class-dir})
  (b/jar {:class-dir class-dir :jar-file jar-file})
  (println "wrote" jar-file))
