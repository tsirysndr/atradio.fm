(ns fm.atradio.core
  "Official Clojure SDK for atradio.fm.

  JVM Panama (java.lang.foreign) bindings to the shared Rust core's C ABI
  (crates/atradio-uniffi). The auth / record / reconcile logic is identical to
  the Rust, Go, TypeScript, Python, and Ruby SDKs. Requires JDK 22+."
  (:require [clojure.java.io :as io]
            [clojure.data.json :as json])
  (:import [java.lang.foreign Arena Linker FunctionDescriptor SymbolLookup
            ValueLayout MemoryLayout MemorySegment Linker$Option]
           [java.lang.invoke MethodHandle]
           [java.io File]))

(def ^:private lib-name
  (let [os (.toLowerCase (System/getProperty "os.name"))]
    (cond
      (.contains os "mac") "libatradio_uniffi.dylib"
      (.contains os "win") "atradio_uniffi.dll"
      :else "libatradio_uniffi.so")))

(def ^:private lib-path
  (if-let [r (io/resource lib-name)]
    (.getAbsolutePath (File. (.toURI r)))
    (throw (ex-info (str "native library " lib-name " not found on the classpath — run ./build.sh")
                    {:lib lib-name}))))

(def ^:private ^Arena arena (Arena/ofShared))
(def ^:private ^Linker linker (Linker/nativeLinker))
(def ^:private ^SymbolLookup lookup (SymbolLookup/libraryLookup lib-path arena))

(def ^:private ADDR ValueLayout/ADDRESS)
(def ^:private I32 ValueLayout/JAVA_INT)

(defn- ^MethodHandle downcall
  "Bind a C function `name` to a MethodHandle. `ret` is nil for void."
  [name ret arg-layouts]
  (let [seg (.orElseThrow (.find lookup name))
        arr (into-array MemoryLayout arg-layouts)
        fd  (if ret
              (FunctionDescriptor/of ret arr)
              (FunctionDescriptor/ofVoid arr))]
    (.downcallHandle linker seg fd (make-array Linker$Option 0))))

(def ^:private h-recent   (downcall "atradio_recent_stations" ADDR [ADDR I32]))
(def ^:private h-popular  (downcall "atradio_popular_stations" ADDR [ADDR I32]))
(def ^:private h-global   (downcall "atradio_global_recently_played" ADDR [ADDR I32]))
(def ^:private h-faves    (downcall "atradio_favorites" ADDR [ADDR ADDR I32]))
(def ^:private h-rkey     (downcall "atradio_favorite_rkey" ADDR [ADDR]))
(def ^:private h-free     (downcall "atradio_string_free" nil [ADDR]))
(def ^:private h-login    (downcall "atradio_agent_login" ADDR [ADDR ADDR ADDR ADDR]))
(def ^:private h-last-err (downcall "atradio_last_error" ADDR []))
(def ^:private h-afree    (downcall "atradio_agent_free" nil [ADDR]))
(def ^:private h-fav      (downcall "atradio_agent_favorite" ADDR [ADDR ADDR]))
(def ^:private h-unfav    (downcall "atradio_agent_unfavorite" ADDR [ADDR ADDR]))
(def ^:private h-comment  (downcall "atradio_agent_comment" ADDR [ADDR ADDR ADDR]))
(def ^:private h-setplay  (downcall "atradio_agent_set_play_status" ADDR [ADDR ADDR]))
(def ^:private h-delplay  (downcall "atradio_agent_delete_play_status" ADDR [ADDR]))
(def ^:private h-refresh  (downcall "atradio_agent_refresh_session" ADDR [ADDR]))

(defn- read-free
  "Read an owned C string returned by the core, then free it. nil on NULL."
  [^MemorySegment seg]
  (when (and seg (not (zero? (.address seg))))
    (let [s (.getString (.reinterpret seg Long/MAX_VALUE) 0)]
      (.invokeWithArguments ^MethodHandle h-free (object-array [seg]))
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
     (unwrap (.invokeWithArguments ^MethodHandle h-recent
                                   (object-array [(.allocateFrom a (str (or base ""))) (int limit)]))))))

(defn popular-stations
  ([limit] (popular-stations limit nil))
  ([limit base]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle h-popular
                                   (object-array [(.allocateFrom a (str (or base ""))) (int limit)]))))))

(defn global-recently-played
  ([limit] (global-recently-played limit nil))
  ([limit base]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle h-global
                                   (object-array [(.allocateFrom a (str (or base ""))) (int limit)]))))))

(defn favorites
  "An actor's favorited stations."
  ([actor limit] (favorites actor limit nil))
  ([actor limit base]
   (with-open [^Arena a (Arena/ofConfined)]
     (unwrap (.invokeWithArguments ^MethodHandle h-faves
                                   (object-array [(.allocateFrom a (str (or base "")))
                                                  (.allocateFrom a (str actor))
                                                  (int limit)]))))))

(defn favorite-rkey
  "The deterministic favorite record key — identical across every atradio SDK."
  [station-id]
  (with-open [^Arena a (Arena/ofConfined)]
    (read-free (.invokeWithArguments ^MethodHandle h-rkey
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
          (.invokeWithArguments ^MethodHandle h-login
                                (object-array [(.allocateFrom a (str session-path))
                                               (.allocateFrom a (str identifier))
                                               (.allocateFrom a (str password))
                                               (.allocateFrom a (str (or appview "")))]))]
      (if (zero? (.address seg))
        (throw (ex-info (str "atradio login: "
                             (or (read-free (.invokeWithArguments ^MethodHandle h-last-err (object-array [])))
                                 "failed"))
                        {}))
        seg))))

(defn- agent-call [^MethodHandle h agent & args]
  (with-open [^Arena a (Arena/ofConfined)]
    (unwrap (.invokeWithArguments h
                                  (object-array (cons agent (map #(.allocateFrom a (str %)) args)))))))

(defn favorite      [agent station]      (agent-call h-fav agent (json/write-str station)))
(defn unfavorite    [agent station]      (agent-call h-unfav agent (json/write-str station)))
(defn comment-post  [agent station text] (agent-call h-comment agent (json/write-str station) text))
(defn set-play-status [agent station]    (agent-call h-setplay agent (json/write-str station)))
(defn delete-play-status [agent]         (agent-call h-delplay agent))
(defn refresh-session [agent]            (agent-call h-refresh agent))

(defn agent-close
  "Release an agent's native handle."
  [^MemorySegment agent]
  (.invokeWithArguments ^MethodHandle h-afree (object-array [agent]))
  nil)
