# Deep Holdings — Case Officer Terminal

Client shell for **Deep Holdings**, an asynchronous, server-authoritative
incremental/MUD game. The player is a case officer: you file standing orders for
an autonomous adventurer, read the incident log, trade on a market, and talk in
the tavern channel — all through a terminal running on a beige 1983 desktop PC.

This repository currently covers **build order step 2: the CRT shell** — all five
screens, the effect stack, and static demo data. No server, no persistence beyond
local settings.

## Stack

React 18 + TypeScript + Vite, CSS Modules for component styling and CSS custom
properties for the design tokens. No UI or state libraries — the whole shell is
one `useReducer` plus two contexts. Capacitor/Tauri wrappers come later, so
nothing here assumes a browser-only host beyond `localStorage`/`sessionStorage`.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run typecheck
```

## Layout

```
src/
  styles/      tokens.css (palette, type, effect switches) + global.css
  data/        static demo content standing in for server state
  state/       game reducer + settings, each behind a context
  hooks/       interval, boot sequence, persisted settings
  components/  hardware shell: desk, bezel, screen, tabs, command bar, overlays
  components/ui/  reusable controls: chip, slider, progress bar, action button
  screens/     the five screens
```

The five screens are not routes. One always-mounted shell switches on
`activeScreen`, driven by both the tab row and the command bar.

## Design tokens

Everything visual reads from custom properties in `src/styles/tokens.css`:

| Token | Value | Use |
| --- | --- | --- |
| `--phosphor-bright` | `#FFB742` | headings, active values, bright text |
| `--phosphor-body` | `#D98A2B` | log and body text |
| `--phosphor-dim` | `#7A4A18` | metadata, timestamps, borders |
| `--screen-black` | `#14100C` | screen background (never pure black) |
| `--bezel-beige` | `#D8CDB4` | hardware case |
| `--alert-red` | `#FF4530` | deaths and critical alerts, sparingly |

Palette and effect switching happen through data attributes on the shell root
(`src/components/Desk.tsx`), so no component needs to know which palette is live:

- `data-contrast="high"` — white/black high-contrast palette; also forces the
  effect stack off.
- `data-phosphor="green"` — the cosmetic "Monitor Swap: Green Phosphor" unlock.
- `data-effects="off"` — neutralises glow, chromatic aberration, scanlines,
  vignette, LED pulse and screen flicker in one place.
- `data-motion="reduced"` — stops flicker, roll, the teletype reveal and the
  progress-bar transition, keeping the glow.

Type scales off `--font-scale` (0.85–1.4), stepped by the A-/A+ control. The
hardware chrome (`--hw-*`) is deliberately excluded from palette swaps — the case
is a physical object.

Fonts load from Google Fonts: IBM Plex Mono for everything, VT323 preloaded and
reserved for a future bitmap-face pass on the boot sequence and screen headers.

## Interaction notes

- **Boot** — 12 BIOS lines at 260ms intervals, tap or click "(tap to skip)" to
  skip. A `sessionStorage` flag keeps it to cold launches only, never resumes.
- **Teletype** — each log line wipes in once via `clip-path`, staggered 120ms.
  Tapping the screen finishes them; reduced motion skips the animation entirely.
- **Commands** — `status`/`terminal`/`log`, `tavern`/`chat`, `orders`,
  `market`/`ledger`, `bulletin`/`news`, and `die` (demo death trigger).
- **Settings** — the gear opens the quality-floor panel: effects, reduced motion,
  high contrast, font size, and the demo death button. Persisted to
  `localStorage`; reduced motion seeds from `prefers-reduced-motion`.

## Deviations from the design prototype

Deliberate, and all in the direction the handoff asked for:

- **Custom slider.** The prototype tinted the native range input with
  `accent-color`; this build styles the track and thumb to match the phosphor
  palette, as the handoff called for.
- **Character name is derived.** The prototype hard-coded `GRIMWALD IV` in the
  stat line while the death card showed the next ordinal. Both now read from
  `recruitNum`, so claiming a pension advances the name (IV → V) everywhere.
- **Green phosphor actually swaps the palette.** In the prototype the unlock was
  purchasable but inert.
- **Heartbeat counts real seconds.** The prototype decremented it on the 400ms
  idle tick.
- **Semantics and keyboard support.** Tabs, chips, unlocks and toggles are real
  buttons with `role`/`aria-*` state; sliders are labelled; the death card is a
  dialog; Escape closes the settings panel.

## Wiring up the server

The client-side fictions, all isolated and commented:

- `gameReducer` `tick`/`heartbeatTick` — replace with resolved character state and
  the real heartbeat timestamp from the world journal (spec §3.2). Gold, supplies
  and activity progress must not be computed on the client.
- `purchaseUnlock`, `fileOrders` — validate and persist server-side
  (`standing_orders`, `pensions`).
- `triggerDeath` — demo scaffolding. Death is a server event that arrives with
  its pension calculation and the next recruit; the client only renders it.
- `data/fixtures.ts` — log lines, tavern messages, market, inventory, bulletin.
  The log copy doubles as the tone reference for generated lines.
