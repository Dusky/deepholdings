# Store assets

Everything in this directory is generated. Nothing here is hand-edited, so a
change to the game's palette or layout is a re-run rather than a redraw.

| File | Size | Where it goes |
| --- | --- | --- |
| `icon-512.png` | 512×512 | Play listing icon |
| `screenshot-*.png` | 1080×1920 | Play phone screenshots (2–8 required) |
| `feature-graphic-1024x500.png` | 1024×500 | Play feature graphic |

## Regenerating

The icon comes from the same tool that writes the Android mipmaps:

```bash
node packages/client/tools/make-icons.mjs
```

The screenshots and feature graphic need the game actually running, because
they are the game:

```bash
# a database and an API with the dev fast-forward available
createdb dh_shots
DATABASE_URL=postgres://…/dh_shots TOKEN_SECRET=shots DEV_TOOLS=true \
  PORT=8791 CORS_ORIGINS=http://127.0.0.1:4190 npm run dev:server

# the client, built against it
cd packages/client
VITE_API_URL=http://127.0.0.1:8791 npx vite build
npx vite preview --port 4190 --strictPort

node tools/store-shots.mjs
```

## Why these are screenshots and not key art

The first pass was generated photography — a warm amber CRT on a cluttered
desk, a lone clerk in a symmetric corridor of filing cabinets. It read as AI
slop, and the tells were specific enough to be worth recording:

- **dead-centre one-point perspective** with a glow at the vanishing point,
  which is the most recognisable generated composition there is;
- **no ugly light** — a uniform warm bloom everywhere, where a real government
  basement has a hideous fluorescent overhead washing everything flat;
- **props arranged rather than dropped**: papers fanned just so, the ashtray
  and the mug *placed*;
- **haze doing the emotional work** instead of composition;
- **no banality** — no wall calendar, no coat over a chair, no bin, no cable
  mess. Specific dull objects are what make a room look real, and there was
  not one.

The fix was not a better prompt. A listing's job is to show the thing being
installed, and this game's aesthetic argument *is* the screen: amber phosphor,
IBM Plex Mono, a beige bezel. Art built out of that cannot read as generated
because none of it is — it is the product, photographed. `ROADMAP.md` has said
"the CRT aesthetic is the marketing — lead with it" since before any of this.

## Two things the tooling got wrong first

Both worth keeping, because both produced plausible-looking output that was
wrong:

- **1080 is a pixel size, not a CSS width.** Rendering the client at a 1080px
  viewport gives the *desktop* layout — beige desk, full bezel, the whole
  machine — because the compact layout is keyed on `max-width: 720px`. The
  first screenshots therefore advertised a screen no phone will ever show, and
  the feature graphic came out as a bezel inside a bezel. It is 360 CSS px at
  3× now, which is a real phone viewport and lands on 1080×1920 exactly.
- **A fresh account has three journal lines.** Screenshots taken at hour zero
  are an honest picture of a game nobody has played and a dishonest picture of
  the game, so the tool fast-forwards a day and a half first and waits out the
  teletype reveal — a half-typed line photographs as a rendering bug.
