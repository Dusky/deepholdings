# Push notifications

Push carries exactly one thing: **a recruit died.** Everything else this game
has to say is predictable from a tick — a permit clears at a known time, a
shift is worth reading after a few hours — and a scheduled local notification
says it with no server, no credentials and no delivery cost. Death is a die
roll, so it is the only event that needs a server to notice it on the player's
behalf.

## The problem push had to solve first

Resolution is lazy. A recruit's ticks are replayed when somebody reads them, so
the server's cost is proportional to players looking rather than to accounts
existing. That is the right trade everywhere except here: a recruit who dies at
three in the morning is *not dead on the server* until the officer next opens
the app — at which point they are already looking at the screen and the
notification has nothing left to announce.

So the heartbeat runs a **death sweep** (`packages/server/src/push/sweep.ts`).
Every five minutes it replays a bounded slice of away accounts and pushes on
any death it finds. Three bounds keep it from becoming the background job the
architecture was built to avoid:

- only accounts with a push token — no token, no reason to resolve early;
- only accounts nobody has read in fifteen minutes — anyone with the app open
  resolves themselves far more often than this would;
- at most 200 per beat, oldest-seen first, so a backlog drains in order and the
  per-beat cost is a constant rather than a function of total signups.

### The sweep writes nothing

It calls `resolve()` directly and throws the result away rather than calling
`loadState`. Using the ordinary read path is the obvious implementation and it
is wrong twice:

- **It would eat the digest.** "While you were away" is derived from the ticks
  resolved *in that call*. A sweep that resolved them first would leave the
  player's next read with nothing to summarise — so exactly the players who
  were away longest would be the ones who got no summary.
- **It would mark the player present.** `loadState` touches `last_seen_at`,
  which drives the tavern's presence count and the sweep's own away window.

Ticks are seeded from `(characterId, tick)`, so replaying them again on the
player's next read produces the identical death. The sweep is not predicting
anything that might turn out differently — it is reading something that has
already happened and has not been written down yet. The cost is that away
accounts get resolved twice, once here and once when they next look, which at
this game's scale is cheap and buys a background job that cannot damage a
player's first impression of their own absence.

## Rate discipline

Two budgets, because there are two senders.

| | where | cap | dedupe key |
| --- | --- | --- | --- |
| local notifications | `client/src/native/sendBudget.ts` | 4/day | `permit:4`, `shift:<recruit>:<day>` |
| push | `push_sends` table | 2/day | `death:<characterId>` |

The client budget cannot govern push — a push is decided on a machine the
client is not running on — so the same two rules are enforced again server
side. The push cap is lower deliberately: a push interrupts, and a scheduled
local notification is something the player already agreed to the shape of.

Server-side dedupe is the `push_sends` primary key, not a check-then-write.
Two heartbeat workers racing on the same death both attempt the same key and
exactly one wins.

## Setup

### 1. Android app config

Firebase Console → Project settings → your Android app → download
`google-services.json`, and put it at:

```
packages/client/android/app/google-services.json
```

The package name must match `appId` in `packages/client/capacitor.config.ts`
(`com.deepholdings.terminal`).

**It is gitignored.** The API key inside it is restricted to the package name
and signing certificate, so Google considers it safe to commit; "safe if the
restriction is correct" is not something this repository can verify, and a
credential is cheaper to hand over out of band than to un-publish. Nothing
breaks without it — the Capacitor template applies the `google-services`
Gradle plugin only when the file is present, and logs that push will not work
when it is not.

### 2. Server credentials

Firebase Console → Project settings → Service accounts → Generate new private
key. It downloads as `<project>-firebase-adminsdk-<hash>-<digits>.json`.

**Put it outside the repository.** Somewhere like `~/.config/deepholdings/`,
readable only by you:

```bash
mkdir -p ~/.config/deepholdings
mv ~/Downloads/*firebase-adminsdk*.json "$HOME/.config/deepholdings/fcm.json"
chmod 600 "$HOME/.config/deepholdings/fcm.json"
```

`.gitignore` covers both the `*service-account*` and `*firebase-adminsdk*`
shapes if it lands in the tree anyway, but out of the tree is the version that
cannot go wrong. Then either:

```bash
export FCM_SERVICE_ACCOUNT_FILE="$HOME/.config/deepholdings/fcm.json"
# or, for a host that only takes environment variables — Fly secrets, Railway
# variables, a systemd unit:
export FCM_SERVICE_ACCOUNT="$(cat "$HOME/.config/deepholdings/fcm.json")"
```

There is no `.env` loading in this server; it reads `process.env` and nothing
else. So the variable has to be exported in the shell that starts it, or set
in whatever the host uses for secrets. For local work that means one line
before `npm run dev:server`, not a file the process finds on its own.

Both are read at boot and a malformed one fails immediately, because a typo in
a private key must not present as "push is quietly off". With neither set the
server logs a warning and runs `NullSender` — every code path up to the wire,
and nothing sent. That is a supported state: deaths still resolve and record
normally, and the game is entirely playable without push.

`FCM_SERVICE_ACCOUNT` holds a private key that can send a notification to every
device registered to the project. It never goes in the repository, in a log, or
in a chat message.

### 3. Verify

```bash
npm run migrate --workspace @deepholdings/server   # applies 005_push.sql
```

Then on a device: open the app, allow notifications, confirm a row appears in
`push_tokens`. To force a death without waiting for one, use the dev
fast-forward (`DEV_TOOLS=true`) from a *different* device or leave the app
closed for fifteen minutes so the account becomes a sweep candidate.

## Why FCM HTTP v1, and not firebase-admin

v1 rather than the legacy server-key endpoint: legacy is deprecated, and the
server key is a bearer credential with no scope and no expiry — a bad thing to
keep in an environment variable. v1 wants a service account and a short-lived
OAuth token, which is more work in `push/fcm.ts` and much less to lose.

Implemented against `fetch` and `node:crypto` rather than the Firebase Admin
SDK, which is roughly fifty megabytes of dependency to sign a JWT and POST some
JSON, and which brings its own opinions about process lifecycle into a Fastify
server that already has some.

v1 has no multicast, so it is one request per token. At hundreds of players
with a push only on death that is a handful of requests per beat; batching is a
problem to solve when a measurement says it is one.

## What is verified

Run end to end on 2026-08-02 against a real Firebase project, a debug APK on
a physical device (Pixel 10 Pro XL) over the LAN, and a Postgres-backed dev
server with `DEV_TOOLS=true`:

1. **`npm run push:ping -w @deepholdings/server -- --account <id>`** — a
   notification landed in the system tray. This confirms the credentials, the
   JWT-signed OAuth exchange, and the HTTP v1 send all work against Google for
   real, isolated from whether the sweep can find anything to send.
2. **A death found by the sweep, unprompted.** With the app backgrounded,
   `POST /v1/dev/away` followed by `POST /v1/dev/sweep` replayed the account's
   outstanding ticks, found a death, and a second, distinct notification
   ("GRIMWALD I, THE UNREMARKABLE did not return...") arrived without the app
   ever being opened. `push_sends` recorded exactly one
   `death:<characterId>` row, confirming the dedupe key that stands between
   this and a duplicate send.

Getting there surfaced three bugs, all now fixed, none of them in the push
code itself:

- **The native Android project had never built.** `ic_launcher_background.xml`
  had `--bezel-beige` inside an XML comment — `--` is illegal inside an XML
  comment and aapt refused to parse it. Fixed by rewording the comment.
  Building also needs `buildFeatures.buildConfig true` in `app/build.gradle`
  (AGP 8 stopped generating `BuildConfig` by default, and the fix below reads
  `BuildConfig.DEBUG`) and a JDK between 21 and the ceiling Gradle 8.14.3
  itself will run on — 17 is too old to target the `capacitor-android`
  module's bytecode level, and this machine's JDK 26 is too new for Gradle to
  parse its own build scripts with (`Unsupported class file major version
  70`). `device-testing.md` now says so.
- **The WebView blocked every request to the LAN API as mixed content**,
  independent of `network_security_config.xml`. That file permits cleartext
  *sockets* at the OS level, which is a different gate from the WebView's own
  mixed-content policy: the app loads from `https://localhost`
  (`capacitor.config.ts`'s `androidScheme`), so Chromium blocked a JS `fetch`
  to `http://<lan-ip>:8787` as insecure content before a socket ever opened.
  `push:ping` and the dev-tools sweep don't exercise this path — only the
  on-device client does — so nothing prior to this session's device run could
  have caught it. Fixed in `MainActivity.java`: debug builds now set
  `WebSettings.MIXED_CONTENT_ALWAYS_ALLOW` on the bridge's `WebView`, gated on
  `BuildConfig.DEBUG` so release keeps the strict default.
- **The desktop firewall silently dropped inbound LAN traffic on 8787.** Not a
  code bug, but worth recording here since it looks identical to the other
  two from the phone's side (nothing arrives, no error): even a plain browser
  tab on the phone hit `http://<desktop-ip>:8787/health` and hung, while curl
  from the desktop itself to its own LAN IP returned `200` instantly. `sudo
  ufw allow 8787/tcp` on the desktop resolved it.

Everything else the design depends on — the sweep's away-window and per-beat
bounds, the server-side budget, the `push_sends` dedupe, registration and
unregistration — is exercised by the suite in `push/sweep.ts`'s and
`push/fcm.ts`'s tests against both storage adapters
(`TEST_DATABASE_URL=... npm test -w @deepholdings/server`, 192 passing,
0 skipped).
