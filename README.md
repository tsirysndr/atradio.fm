# atradio.fm

A synthwave-themed internet radio player. Search stations from
[radio-browser.info](https://www.radio-browser.info/) and TuneIn, stream them
right in the browser, favorite the ones you love, and add your own. Installable
as a PWA.

> **Frontend only.** There is no backend yet — favorites and your own stations
> live in `localStorage`. Search hits the public provider APIs directly (TuneIn
> via a dev proxy).

## Stack

- **Monorepo:** Turborepo + Bun workspaces
- **App:** Vite + React 19 + TypeScript
- **Styling:** Tailwind CSS **v4** + [HeroUI **v3**](https://www.heroui.com/), dark synthwave-80s theme
- **Fonts:** JetBrains Mono (body/mono) paired with Outfit + Lexend (UI/display)
- **Icons:** [@tabler/icons-react](https://tabler.io/icons)
- **Routing:** TanStack Router
- **Data:** TanStack Query
- **State:** Jotai (with `localStorage` persistence)
- **Forms:** React Hook Form + Zod (incl. live stream-URL verification)
- **PWA:** vite-plugin-pwa (Workbox service worker + web manifest)
- **Tests:** Vitest + Testing Library
- **Toolchain:** pinned via `mise` (Node 24, Bun 1.3)

## Getting started

```bash
mise install      # optional: install the pinned Node + Bun
bun install
bun dev           # turbo -> vite dev server on http://localhost:3000
```

Other tasks (run from the repo root, orchestrated by Turbo):

```bash
bun run build         # type-check + production build (also builds the PWA)
bun run preview       # preview the production build (PWA/service worker active)
bun run test          # run unit tests   ⚠️ use `bun run test`, NOT `bun test`
bun run typecheck     # type-check only
```

> ⚠️ `bun test` runs Bun's **built-in** test runner and bypasses Vitest. Always
> use `bun run test` (which goes through Turbo → Vitest).

App-scoped scripts (in `apps/web`):

```bash
bun run generate-icons   # regenerate the PWA icon set from the synthwave mark
```

## Project layout

```
atradio.fm/
├─ apps/
│  └─ web/                 # the Vite React app
│     ├─ src/
│     │  ├─ atoms/         # Jotai state (player, favorites, custom stations, ui)
│     │  ├─ components/    # Navbar, Player, StationCard, CategoryGrid, modals, …
│     │  ├─ hooks/         # search, debounce, keyboard shortcuts
│     │  ├─ lib/
│     │  │  ├─ api/        # radio-browser + TuneIn clients + unified search
│     │  │  ├─ audio/      # stream resolution, stream probe, ICY metadata
│     │  │  └─ validation/ # Zod schema for the add-station form
│     │  ├─ routes/        # SearchPage, ProfilePage
│     │  └─ test/          # Vitest setup + smoke/modal tests
│     ├─ scripts/          # generate-icons.mjs (sharp)
│     └─ vite.config.ts    # TuneIn dev proxy + PWA config
├─ turbo.json
├─ mise.toml
└─ package.json            # bun workspaces
```

## Providers & the TuneIn proxy

- **radio-browser** sends permissive CORS headers, so it's queried directly. A
  random mirror is chosen per session.
- **TuneIn** (`opml.radiotime.com`) sends **no** CORS headers, so browser
  requests are blocked. All TuneIn traffic is routed through a proxy:
  - **dev:** Vite proxies `/api/tunein/*` → `https://opml.radiotime.com/*`.
  - **prod:** set `VITE_TUNEIN_PROXY` to an equivalent server-side proxy.

  If the proxy is unreachable, search degrades gracefully — radio-browser
  results still show, with an inline notice.

## Adding your own station

The "Add station" form is validated with **React Hook Form + Zod**. Beyond
format checks, it **verifies the stream is actually playable**: the URL is
loaded into a throwaway `<audio>` element (media loads aren't blocked by CORS
the way `fetch` is). If the probe fails — e.g. an HLS stream that only plays via
hls.js — an **"add it anyway"** option appears. An optional logo/picture URL is
supported, with a live preview.

## "Now playing" (ICY metadata)

The player reads **ICY** (`StreamTitle`) metadata directly from the byte stream
(`Icy-MetaData: 1` + `icy-metaint` parsing) and shows the current track when
available. This is best-effort: many stream hosts don't expose CORS/`icy-metaint`,
in which case no title is shown. HLS streams carry no ICY metadata.

## PWA

Built with `vite-plugin-pwa` (Workbox `generateSW`):

- Installable with a web manifest + maskable icons.
- Offline app shell (precached build + fonts), `NetworkFirst` caching for
  radio-browser responses and `CacheFirst` for station artwork.
- Auto-updates when a new build is deployed.

The service worker is disabled in dev; test it via `bun run build && bun run preview`.

## Keyboard shortcuts

| Key            | Action                     |
| -------------- | -------------------------- |
| `/`            | Focus search               |
| `Space` / `K`  | Play / pause               |
| `M`            | Mute / unmute              |
| `F`            | Favorite current station   |
| `A`            | Add your own station       |
| `↑` / `↓`      | Volume up / down           |
| `?`            | Show the shortcuts overlay |
| `Esc`          | Close dialogs / blur input |

## Roadmap

- Real backend API (accounts, synced favorites, server-side TuneIn proxy)
- Recently played history & sleep timer
- Route-level code splitting to shrink the initial bundle
