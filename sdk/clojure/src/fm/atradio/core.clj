(ns fm.atradio.core
  "Official Clojure SDK for atradio.fm.

  JVM Panama (java.lang.foreign) bindings to the shared Rust core's C ABI
  (crates/atradio-uniffi). The auth / record / reconcile logic is identical to
  the Rust, Go, TypeScript, Python, and Ruby SDKs. Requires JDK 22+."
  (:require [clojure.data.json :as json]
            [fm.atradio.native :as native])
  (:import [java.lang.foreign Arena Linker FunctionDescriptor SymbolLookup
            ValueLayout MemoryLayout MemorySegment Linker$Option]
           [java.lang.invoke MethodHandle]))

;; Native resolution is deferred behind delays so that merely requiring this
;; namespace (e.g. for doc generation on cljdoc) touches no native code: the
;; library is resolved — a local dev build if present on the classpath, else a
;; checksum-verified download from the GitHub release (cached) — only on the
;; first actual call. See fm.atradio.native.
(def ^:private lib-path (delay (native/resolve-lib)))

(def ^:private arena  (delay (Arena/ofShared)))
(def ^:private linker (delay (Linker/nativeLinker)))
(def ^:private lookup (delay (SymbolLookup/libraryLookup @lib-path ^Arena @arena)))

(def ^:private ADDR ValueLayout/ADDRESS)
(def ^:private I32 ValueLayout/JAVA_INT)

(defn- ^MethodHandle downcall
  "Bind a C function `name` to a MethodHandle. `ret` is nil for void."
  [name ret arg-layouts]
  (let [seg (.orElseThrow (.find ^SymbolLookup @lookup name))
        arr (into-array MemoryLayout arg-layouts)
        fd  (if ret
              (FunctionDescriptor/of ret arr)
              (FunctionDescriptor/ofVoid arr))]
    (.downcallHandle ^Linker @linker seg fd (make-array Linker$Option 0))))

(def ^:private h-recent   (delay (downcall "atradio_recent_stations" ADDR [ADDR I32])))
(def ^:private h-popular  (delay (downcall "atradio_popular_stations" ADDR [ADDR I32])))
(def ^:private h-global   (delay (downcall "atradio_global_recently_played" ADDR [ADDR I32])))
(def ^:private h-faves    (delay (downcall "atradio_favorites" ADDR [ADDR ADDR I32])))
(def ^:private h-rkey     (delay (downcall "atradio_favorite_rkey" ADDR [ADDR])))
(def ^:private h-free     (delay (downcall "atradio_string_free" nil [ADDR])))
(def ^:private h-login    (delay (downcall "atradio_agent_login" ADDR [ADDR ADDR ADDR ADDR])))
(def ^:private h-last-err (delay (downcall "atradio_last_error" ADDR [])))
(def ^:private h-afree    (delay (downcall "atradio_agent_free" nil [ADDR])))
(def ^:private h-fav      (delay (downcall "atradio_agent_favorite" ADDR [ADDR ADDR])))
(def ^:private h-unfav    (delay (downcall "atradio_agent_unfavorite" ADDR [ADDR ADDR])))
(def ^:private h-comment  (delay (downcall "atradio_agent_comment" ADDR [ADDR ADDR ADDR])))
(def ^:private h-setplay  (delay (downcall "atradio_agent_set_play_status" ADDR [ADDR ADDR])))
(def ^:private h-delplay  (delay (downcall "atradio_agent_delete_play_status" ADDR [ADDR])))
(def ^:private h-refresh  (delay (downcall "atradio_agent_refresh_session" ADDR [ADDR])))

(defn- read-free
  "Read an owned C string returned by the core, then free it. nil on NULL."
  [^MemorySegment seg]
  (when (and seg (not (zero? (.address seg))))
    (let [s (.getString (.reinterpret seg Long/MAX_VALUE) 0)]
      (.invokeWithArguments ^MethodHandle @h-free (object-array [seg]))
      s)))

(defn- unwrap
  "Parse a {\"ok\"|\"error\"} envelope, throwing ex-info on error."
  [seg]
  (let [m (json/read-str (read-free seg))]
    (if (contains? m "error")
      (throw (ex-info (str "atradio: " (get m "error")) {:error (get m "error")}))
      (get m "ok"))))

;; ---- reads (unauthenticated) --------------------------------------------

(defn recent-stations
  "Newest stations platform-wide."
  ([limit] (recent-stations limit nil))
  ([limit base]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle @h-recent
                                   (object-array [(.allocateFrom a (str (or base ""))) (int limit)]))))))

(defn popular-stations
  ([limit] (popular-stations limit nil))
  ([limit base]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle @h-popular
                                   (object-array [(.allocateFrom a (str (or base ""))) (int limit)]))))))

(defn global-recently-played
  ([limit] (global-recently-played limit nil))
  ([limit base]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle @h-global
                                   (object-array [(.allocateFrom a (str (or base ""))) (int limit)]))))))

(defn favorites
  "An actor's favorited stations."
  ([actor limit] (favorites actor limit nil))
  ([actor limit base]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle @h-faves
                                   (object-array [(.allocateFrom a (str (or base "")))
                                                  (.allocateFrom a (str actor))
                                                  (int limit)]))))))

(defn favorite-rkey
  "The deterministic favorite record key — identical across every atradio SDK."
  [station-id]
  (with-open [^Arena a (Arena/ofConfined)]
    (read-free (.invokeWithArguments ^MethodHandle @h-rkey
                                     (object-array [(.allocateFrom a (str station-id))])))))

;; ---- authenticated agent ------------------------------------------------
;;
;; Stations are Clojure maps with camelCase string keys ("stationId", "name",
;; "streamUrl", "source", …), matching the wire record shape. An agent is an
;; opaque native handle — release it with `agent-close`.

(defn login
  "Log in with an app password, persisting the session at `session-path`."
  [session-path identifier password & {:keys [appview]}]
  (with-open [^Arena a (Arena/ofConfined)]
    (let [^MemorySegment seg
          (.invokeWithArguments ^MethodHandle @h-login
                                (object-array [(.allocateFrom a (str session-path))
                                               (.allocateFrom a (str identifier))
                                               (.allocateFrom a (str password))
                                               (.allocateFrom a (str (or appview "")))]))]
      (if (zero? (.address seg))
        (throw (ex-info (str "atradio login: "
                             (or (read-free (.invokeWithArguments ^MethodHandle @h-last-err (object-array [])))
                                 "failed"))
                        {}))
        seg))))

(defn- agent-call [^MethodHandle h agent & args]
  (with-open [^Arena a (Arena/ofConfined)]
    (unwrap (.invokeWithArguments h
                                  (object-array (cons agent (map #(.allocateFrom a (str %)) args)))))))

(defn favorite      [agent station]      (agent-call @h-fav agent (json/write-str station)))
(defn unfavorite    [agent station]      (agent-call @h-unfav agent (json/write-str station)))
(defn comment-post  [agent station text] (agent-call @h-comment agent (json/write-str station) text))
(defn set-play-status [agent station]    (agent-call @h-setplay agent (json/write-str station)))
(defn delete-play-status [agent]         (agent-call @h-delplay agent))
(defn refresh-session [agent]            (agent-call @h-refresh agent))

(defn agent-close
  "Release an agent's native handle."
  [^MemorySegment agent]
  (.invokeWithArguments ^MethodHandle @h-afree (object-array [agent]))
  nil)
