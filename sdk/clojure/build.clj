(ns build
  "Build the Clojars jar for the atradio Clojure SDK.

  Coordinate: fm.atradio/sdk (reverse-domain group — atradio.fm is owned).
  Run: clojure -T:build jar

  The jar ships src + resources/ (including atradio/manifest.json) but NOT the
  ~11 MB native library: fm.atradio.native downloads the matching prebuilt from
  the GitHub release on first load, verifying it against the manifest checksum.

  `clojure -T:build deploy` deploys to Clojars — set CLOJARS_USERNAME +
  CLOJARS_PASSWORD (a deploy token); the fm.atradio group must be verified."
  (:require [clojure.tools.build.api :as b]
            [deps-deploy.deps-deploy :as dd]))

(def lib 'fm.atradio/sdk)
(def version "0.1.1")
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
                      :tag (str "clojure-v" version)}
                :pom-data [[:licenses
                            [:license
                             [:name "MIT"]
                             [:url "https://opensource.org/licenses/MIT"]]]]})
  ;; Ship source + resources (manifest.json); the native lib is downloaded on
  ;; first load, never bundled.
  (b/copy-dir {:src-dirs ["src" "resources"] :target-dir class-dir})
  (b/jar {:class-dir class-dir :jar-file jar-file})
  (println "wrote" jar-file))

(defn deploy [_]
  (jar nil)
  (dd/deploy {:installer :remote
              :artifact jar-file
              :pom-file (b/pom-path {:lib lib :class-dir class-dir})})
  (println "deployed" lib version "to Clojars"))
