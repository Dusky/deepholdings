# Deep Holdings — Case Officer Terminal

Client shell for **Deep Holdings**, an asynchronous, server-authoritative
incremental/MUD game. The player is a case officer: you file standing orders for
an autonomous adventurer, read the incident log, trade on a market, and talk in
the tavern channel — all through a terminal running on a beige 1983 desktop PC.

Two pieces are in place: the **CRT shell** (all five screens, the effect stack,
still running on local demo data) and the **server** (schema, HTTP contract, and
the lazy resolution engine, verified against Postgres). Wiring the shell to the
API is the next step.

## Workspaces

```
packages/
  shared/   domain types, HTTP contract, tuning constants, seeded RNG
  server/   Fastify + Postgres; resolution engine, world heartbeat
  client/   React 18 + TypeScript + Vite CRT shell
```

`shared` is imported by both, so a breaking contract change fails the client
typecheck rather than production.

```bash
npm install
npm run build        # shared → server → client
npm run test         # server suites (memory adapter; add TEST_DATABASE_URL for Postgres)
npm run dev          # client on http://localhost:5173
npm run dev:server   # API on http://localhost:8787
```

The server runs on an in-memory adapter when `DATABASE_URL` is unset — useful
for local UI work, and state is lost on restart. With a database:

```bash
export DATABASE_URL=postgres://…/deepholdings
npm run migrate --workspace @deepholdings/server
npm run dev:server
```

## Server architecture

**Nothing runs per player between requests.** Characters carry a
`last_resolved_tick` watermark; when a client shows up, the server replays the
missed ticks inside a transaction, writes the journal, and returns the result.
That is what makes offline progression real without a process per player.

Resolution is deterministic: every roll is keyed on `(character id, tick)` via
`tickSeed`, never on wall-clock or call order. The same span resolved twice
yields the same journal — which is what lets the tests assert on it, lets
support replay a disputed run, and will let the client predict a tick ahead
without diverging.

- **Ticks** are one minute of real time. A long absence is clamped to
  `MAX_CATCHUP_TICKS` (12h) and summarised as observed recess, so returning
  after a month gives a readable log rather than 40,000 lines.
- **The world heartbeat** is the only scheduled job. It advances shared state
  only — market prices, guild progress, region events — and is safe to run from
  several instances: the world row is locked and the beat only moves once due.
- **Storage sits behind a port** (`ports.ts`) with two adapters. Postgres is the
  real one; the in-memory adapter runs the same test suite. `transaction()` plus
  `SELECT … FOR UPDATE` is what stops two concurrent requests double-resolving
  the same ticks.
- **Writes never trust the client.** Standing orders are range-validated, and
  unlock purchases are checked and deducted server-side.

### API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/auth/device` | anonymous device account, returns a signed token |
| GET | `/v1/state` | resolve, then return character, orders, pension, world, journal |
| PUT | `/v1/orders` | file standing orders (resolves first, so orders are never retroactive) |
| GET | `/v1/ledger` | inventory, market, pension unlock offers |
| POST | `/v1/pension/unlocks` | buy a permanent unlock |
| POST | `/v1/pension/claim` | bank the award, take delivery of the next recruit |
| GET | `/v1/bulletin` | world event, guild objective, public death feed |
| GET/POST | `/v1/tavern` | channel messages |

Device tokens are a signed account id and nothing more — enough to get someone
playing in one round trip. **They must be upgraded to a real sign-in before
anything is purchasable**: an entitlement bound to a wiped device is a support
ticket, not a sale.

## Client layout

```
packages/client/src/
  styles/      tokens.css (palette, type, effect switches) + global.css
  data/        demo content standing in for server state
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

## Next: wiring the shell to the API

The client still runs on fixtures. Every client-side fiction is isolated and
commented, and each now has a server counterpart to replace it:

| Client fiction | Replace with |
| --- | --- |
| `gameReducer` `tick` / `heartbeatTick` | `GET /v1/state` — resolved character, `nextBeatInSeconds` |
| `fileOrders` | `PUT /v1/orders` |
| `purchaseUnlock` | `POST /v1/pension/unlocks` |
| `triggerDeath` (demo) | `state.pendingDeath`, then `POST /v1/pension/claim` |
| `data/fixtures.ts` log lines | `state.journal` (the fixture copy stays as the tone reference) |

Then, for Android: a portrait pass over the fixed 640px screen, self-hosted
fonts so boot does not wait on a CDN, Capacitor wrapper, and FCM push — "your
recruit died on Floor 7" is the retention loop for an async game.
