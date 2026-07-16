(ns atradio.console
  "Centralized command hub for the atradio.fm monorepo.

  Every function shells out to the underlying bun/turbo/drizzle/pkl command from
  the repo root, streaming output. Use `(help)` to list commands."
  (:require [clojure.string :as str]))

(def ^:private root
  (or (System/getenv "ATRADIO_ROOT")
      (System/getProperty "user.dir")))

(defn- run*
  "Run a command in `dir` (relative to repo root), inheriting stdio."
  [dir args]
  (let [wd (if (str/blank? dir) root (str root "/" dir))
        pb (doto (ProcessBuilder. ^java.util.List (vec (map str args)))
             (.directory (java.io.File. wd))
             (.inheritIO))
        code (.waitFor (.start pb))]
    (when-not (zero? code)
      (println (str "✖ exited " code)))
    code))

(defn- root! [& args] (run* "" args))
(defn- web! [& args] (run* "apps/web" args))
(defn- api! [& args] (run* "apps/api" args))
(defn- lex! [& args] (run* "packages/lexicons" args))
(defn- cli! [& args] (run* "cli" args))

;; ---- workspace-wide (turbo) ----
(defn install "Install all workspace deps" [] (root! "bun" "install"))
(defn dev "Run every app in dev (turbo dev)" [] (root! "bun" "run" "dev"))
(defn build "Build everything" [] (root! "bun" "run" "build"))
(defn test* "Run all tests" [] (root! "bun" "run" "test"))
(defn typecheck "Typecheck all workspaces" [] (root! "bun" "run" "typecheck"))

;; ---- web ----
(defn web-dev "Run the web app (Vite)" [] (web! "bun" "run" "dev"))
(defn web-build "Build the web app" [] (web! "bun" "run" "build"))
(defn web-preview "Preview the web build (PWA active)" [] (web! "bun" "run" "preview"))
(defn web-deploy "Build + deploy the web app to Cloudflare Workers" [] (web! "bun" "run" "deploy"))
(defn gen-icons "Regenerate the PWA icon set" [] (web! "bun" "run" "generate-icons"))

;; ---- api ----
(defn api-dev "Run the API (server + Jetstream consumer)" [] (api! "bun" "run" "dev"))
(defn api-server "Run only the Express server" [] (api! "bun" "run" "start:server"))
(defn api-consumer "Run only the Jetstream consumer" [] (api! "bun" "run" "start:consumer"))
(defn gen-migration "Generate a Drizzle migration from the schema" [] (api! "bun" "run" "db:generate"))
(defn migrate "Apply Drizzle migrations" [] (api! "bun" "run" "db:migrate"))
(defn db-push "Push the Drizzle schema (dev)" [] (api! "bun" "run" "db:push"))
(defn db-up "Start local Postgres (docker compose up -d)" [] (root! "docker" "compose" "up" "-d"))
(defn db-down "Stop local Postgres (docker compose down)" [] (root! "docker" "compose" "down"))

;; ---- lexicons ----
(defn gen-lexicons "Generate lexicon JSON from Pkl" [] (lex! "bun" "run" "pkl:gen"))

;; ---- cli / TUI (the `atradio` Rust crate) ----
(defn cli-build "Build the atradio CLI (release)" [] (cli! "cargo" "build" "--release"))
(defn cli-run "Run the atradio TUI" [] (cli! "cargo" "run" "--"))
(defn cli-search "Search stations: (cli-search \"lofi\")" [q] (cli! "cargo" "run" "--" "search" q))
(defn cli-play "Play a stream URL or query: (cli-play \"jazz\")" [t] (cli! "cargo" "run" "--" "play" t))
(defn cli-login "Sign in (app password via env, or --oauth)" [] (cli! "cargo" "run" "--" "login"))
(defn cli-whoami "Show the signed-in account" [] (cli! "cargo" "run" "--" "whoami"))
(defn cli-gen-lexicons "Regenerate the CLI's Rust lexicon bindings" [] (cli! "bash" "scripts/gen-lexicons.sh"))

(def ^:private commands
  [["(install)"       "Install all workspace deps"]
   ["(dev)"           "Run every app in dev"]
   ["(build)"         "Build everything"]
   ["(test*)"         "Run all tests"]
   ["(typecheck)"     "Typecheck all workspaces"]
   ["(web-dev)"       "Run the web app (Vite)"]
   ["(web-build)"     "Build the web app"]
   ["(web-preview)"   "Preview the web build"]
   ["(web-deploy)"    "Deploy web to Cloudflare"]
   ["(gen-icons)"     "Regenerate PWA icons"]
   ["(api-dev)"       "Run API server + Jetstream"]
   ["(api-server)"    "Run only the Express server"]
   ["(api-consumer)"  "Run only the Jetstream consumer"]
   ["(gen-migration)" "Generate a Drizzle migration"]
   ["(migrate)"       "Apply Drizzle migrations"]
   ["(db-push)"       "Push the Drizzle schema"]
   ["(db-up)"         "Start local Postgres (docker)"]
   ["(db-down)"       "Stop local Postgres (docker)"]
   ["(gen-lexicons)"  "Generate lexicon JSON from Pkl"]
   ["(cli-build)"     "Build the atradio CLI (release)"]
   ["(cli-run)"       "Run the atradio TUI"]
   ["(cli-search q)"  "Search stations from the CLI"]
   ["(cli-play t)"    "Play a stream URL or query"]
   ["(cli-login)"     "Sign in via the CLI"]
   ["(cli-whoami)"    "Show the signed-in account"]
   ["(cli-gen-lexicons)" "Regenerate CLI lexicon bindings"]
   ["(help)"          "Show this list"]])

(defn help "List all console commands" []
  (println "\natradio.fm console — commands:\n")
  (doseq [[cmd doc] commands]
    (println (format "  %-16s %s" cmd doc)))
  (println)
  :ok)

(defn banner []
  (println "\n  ▟ atradio.fm command console — Clojure + rebel REPL")
  (println (str "  root: " root))
  (help))
