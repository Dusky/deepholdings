# Deep Holdings — Roadmap

Living document. Milestones are ordered by dependency, not by date. Each has an
**exit criterion**: a thing that is either true or not, so "done" is never a
judgement call.

Design decisions live in [`docs/design/`](docs/design/) — monetization policy
and the crafting system. Competitive research behind several of these lives in
[`docs/research/genre-cues.md`](docs/research/genre-cues.md) and
[`docs/research/idle-hacking.md`](docs/research/idle-hacking.md).

**Assumptions** (correct these and the plan changes):

- Solo developer, part-time, no fixed launch date.
- Android first; iOS and desktop are later ports of the same client.
- Free to play, monetised by cosmetics and time-skips. No pay-to-win.
- Small scale at launch: hundreds of players, not hundreds of thousands.

---

## Product goals

The things every decision gets checked against.

1. **The joke has to survive the simulation.** The deadpan clerical voice is the
   product. A feature that can't be written in that voice probably isn't a
   feature.
2. **Respect the player's time.** Two check-ins a day should be plenty. Absence
   is never punished — the recruit works while you're gone, and the log is
   waiting when you come back.
3. **Pay for convenience, never pay to win.** There is a public death feed and
   a shared world; bought advantage poisons both. The line is testable — see
   [`docs/design/monetization.md`](docs/design/monetization.md): given equal
   time played, a buyer must never end up ahead.
4. **Quality floor.** Every effect is defeatable: effects off, reduced motion,
   high contrast, font scale. Already built; keep it that way.
5. **Server is the only truth.** The client renders. It never invents a number
   that someone could sell, buy, or brag about.
6. **Reveal the machine slowly.** Everything-unlocked-at-once is the genre's
   most common fatal mistake — it reads as overwhelming on day one and hollow
   at hour one hundred. Clearance is our in-fiction unlock mechanism.
7. **Numbers stay human.** Gold in the hundreds, permits in tiers, pensions in
   round numbers. Never ship scientific notation.

### Success metrics (targets to beat, not predictions)

| Metric | Target | Why |
| --- | --- | --- |
| D1 retention | 35% | Below this, the loop isn't landing |
| D7 retention | 15% | The real signal for an async game |
| Sessions/day | 2+ | The design assumes check-ins, not grinding |
| Session length | 2–4 min | Longer means the log is too slow to read |
| Payer conversion | 2–5% | Typical for cosmetic-led F2P |
| Crash-free sessions | 99.5% | Play flags you below this |

---

## Status

| Milestone | State | In v1? |
| --- | --- | --- |
| M0 — Playable loop, end to end | ✅ Done | yes |
| M1 — On your phone | **Next** | yes |
| M2 — The first session | Built; needs a stranger to verify | yes |
| M3 — It calls you back | | yes |
| M4 — It has direction | | yes |
| M5 — It has depth (crafting) | | *candidate cut* |
| M6 — An inhabited world | | *candidate cut* |
| M7 — Able to take money | | yes |
| M8 — Store-ready | | yes |
| M9 — Launch and learn | | yes |

See [the cut line](#the-cut-line) for what "candidate cut" means — it is a
scheduling option, not a deletion.

---

## M0 — Playable loop, end to end ✅

CRT shell, server-authoritative resolution, client wired to the API.

- [x] Five screens, CRT effect stack, quality floor settings
- [x] Lazy resolution engine with deterministic, seeded ticks
- [x] Postgres schema, storage port, in-memory adapter for tests
- [x] HTTP contract shared between client and server
- [x] Client on live data: journal, resources, orders, pension, death
- [x] Degraded-link handling (last snapshot survives a dropped connection)

---

## M1 — On your phone

**Goal:** install an APK and play it for a week against a hosted server.

- [x] **Portrait pass.** Portrait below 720px goes full-bleed — desk and bezel
      drop to a slim beige strip, the screen takes the viewport, tabs scroll
      with the resource read-out pinned, touch targets ≥44px on coarse
      pointers, safe-area insets throughout. Landscape and up are unchanged.
- [x] **Self-host the fonts.** Bundled via `@fontsource/ibm-plex-mono`; boot no
      longer touches the network. VT323 dropped.
- [x] **Capacitor wrapper.** `android/` generated and committed, config set,
      hardware back returns to the Terminal. **Native build unverified** — no
      Android SDK in the dev environment; `./gradlew assembleDebug` is yours.
- [ ] **App icon and splash screen.** Placeholders from the Capacitor template
      are still in place.
- [ ] **Deploy the server.** Managed Postgres + a small container host. Set
      `TOKEN_SECRET`, `DATABASE_URL`, `CORS_ORIGINS` (must include
      `capacitor://localhost`). TLS.
- [x] **Migration tooling.** Numbered migrations in `schema_migrations`, each
      applied in its own transaction. Production refuses to boot against a
      schema that is behind rather than silently serving an old shape.
- [ ] **Backups.** Automated, plus one restore drill. Before real players, not
      after.

**Exit:** the APK runs on your phone against the hosted API for seven days
without a crash or a data loss.

---

## M2 — The first session

**Goal:** a stranger installs it and understands what they are doing. This is
where the genre loses most of the players it loses — competitors' negative
reviews cluster at 6–30 minutes of playtime, citing an overwhelming interface
with no direction.

- [x] **First-session onboarding.** Three journalled lines at account creation:
      what you have, what you control, and what death is for. The Authority
      explains the job because that is what the Authority would do.
- [x] **Progressive disclosure of the screens.** A new officer gets Terminal
      and Orders. Ledger arrives with a promotion, Bulletin with the second
      permit, Tavern at grade four — each announced in the log. Clearance is
      derived, not stored, and every condition is monotone across death so a
      screen is never taken away by a funeral.
- [x] **Prestige legibility.** "Pensions are paid on death and are permanent.
      Your recruit is not. Plan accordingly." — in the first three lines a new
      player reads.
- [x] **"While you were away" digest.** Counted by the resolver as it runs, so
      it describes the ticks actually simulated. Shown above the log for
      absences over fifteen minutes, dismissible.
- [x] **Empty and error states in voice.** Quiet channel, unavailable ledger,
      empty death feed, link fault, rejected filing, refused redemption.
- [ ] **The command line has to be genuinely good.** It is a power-user path
      that some players should *prefer*, not a fallback — history, autocomplete,
      and more verbs than navigation. This became load-bearing the moment
      interface upgrades went on the M7 SKU list: the free path being pleasant
      is what stops those from being a toll (see
      [`docs/design/monetization.md`](docs/design/monetization.md)).
- [ ] **The exit criterion still needs a stranger.** Everything above is built;
      whether it *works* is a question only someone who has never seen the game
      can answer.

**Exit:** someone who has never seen the game installs it, plays for twenty
minutes, and can tell you what they are supposed to do next — without asking
you.

---

## M3 — It calls you back

**Goal:** the async loop actually pulls people back. Not optional: an async
game nobody is reminded about is an app nobody opens.

- [x] **Scheduled local notifications** — permit approved, shift report ready.
      No push server, no credentials, no delivery cost, works offline. Most of
      what this game has to say is predictable, so most of it needs no FCM.
- [ ] **FCM push** for the unpredictable events only: death, guild objectives.
      Needs a Firebase project; the same project gives Crashlytics, which M8
      wants anyway.
- [x] **Notification preferences.** Master switch, per-type toggles and quiet
      hours (23:00–08:00), persisted with the other quality-floor settings. A
      delivery landing in quiet hours waits rather than being dropped.
- [ ] **Deep links.** A death notification opens the death card, not the
      Terminal.
- [ ] **Resume behaviour.** Refresh on foreground (done), plus handling for a
      device that slept through the heartbeat.
- [ ] **Send rate discipline.** A notification the player did not want is worse
      than none. Cap the daily count and never push twice for the same event.

**Exit:** a push arrives, you tap it, and the app opens on the thing it was
about.

---

## M4 — It has direction

**Goal:** two weeks of progression that doesn't repeat itself, and a player who
always knows what they are working toward.

- [x] **Balance pass.** Measured with a simulation harness against the real
      resolver (`npm run simulate`), findings written up in
      [`docs/design/balance.md`](docs/design/balance.md). Depth now pays,
      balanced play loses a recruit about every three days, and pensions accrue
      with service instead of rewarding death-farming.
- [x] **Target Depth and Retreat Threshold matter.** Depth is the income dial
      (106 → 265 gold/h across profiles); retreat is the death dial (60% never
      dies, 5% dies constantly).
- [ ] **Loot Priority and Spend Policy are still thin.** `LOOT_EFFECT` makes
      loot a real choice, but the interesting version needs crafting (M5).
      `hoard` is close to strictly worse and needs a reason to exist.
- [ ] **Greedy play should pay better.** It trades gold for pension but the
      deaths cost enough grade that it never reaches its target depth.
- [x] **Requisitions — a gold sink.** Gold buys **permanent office equipment**:
      four tracks, seven rungs — bulk filing, cabinet index, journal retention,
      pinned readouts. Permanent is the load-bearing word: gold dies with the
      recruit and equipment does not, so a requisition is the one way to move
      value across that line by choice, and Form R-1 gains the tension it
      lacked. **Rule: a requisition may add a faster path, never be the only
      path** — screen tabs stay out, because on a phone the "free" path would be
      a software keyboard. Clearance keeps granting tabs.
      Measured: a daily retirer's pension rate falls 87 → 76 once gold has
      somewhere to go, and the two strategies now buy visibly different things
      (a complete office, or pension and half an office). Four more catalogue
      entries are designed and unbuilt — they are what lengthens the sink, since
      pricing seven conveniences higher is not the answer. See
      [`docs/design/requisitions.md`](docs/design/requisitions.md).
- [ ] **Content volume.** More fauna, loot, journal copy, and permit tiers.
      The tone reference is `packages/server/src/domain/flavor.ts`.
- [x] **Market that trades.** Loot goes into a 12-slot filing cabinet as
      stacks with a real appraisal, and the Ledger sells them. The MARKET
      column is now a demand index over the four loot categories rather than
      absolute prices for four hardcoded items — the two columns used to
      contradict each other on the same screen. Demand is redrawn each world
      heartbeat and is priced into every sale, which finally gives `hoard`
      something to hoard *for*.
- [x] **Prestige depth.** Seven tracks of three tiers each, climbed in order, so
      only the next rung is ever on screen and there is always something ahead:
      permits, intake grade, estate settlement, stipend, cabinet capacity,
      pension accrual, and the cosmetic phosphor swap. Tier III of a track is a
      multi-week project on purpose.
      **Form R-1 (Voluntary Retirement)** replaces suicide-by-standing-order as
      the way to prestige — it pays exactly what death pays, so the only thing
      it buys is choosing the moment. Retiring at the legal minimum is a
      measured trap; see [`docs/design/balance.md`](docs/design/balance.md).
- [ ] **Journal pagination.** Retention is now 60/150/400 lines depending on
      the Extended Journal Retention requisition, which raises the ceiling
      without solving the problem: there is still no way to page back past
      whatever the ceiling is.
- [x] **A legible ladder.** The Terminal shows the permit in processing, the
      depth it authorises and an estimate — and permit processing was
      lengthened to three hours so the wait is actually visible to someone who
      checks in twice a day. See `docs/design/balance.md`.
- [ ] **Milestone cadence.** Something visible moves every session. No
      multi-week walls — they are churn events with a countdown attached.

**Exit:** a tester plays for two weeks and can explain their strategy to you.

---

## M5 — It has depth

**Goal:** items that feel like yours. The largest single addition on the
roadmap, designed in full at [`docs/design/crafting.md`](docs/design/crafting.md).

- [ ] **Requisition & Arbitration** — gear with affixes, where the crafting
      system is the bureaucracy: items are case files, crafting actions are
      forms, and forms take real time to process. Also does most of the "make
      the four knobs matter" work, since Loot Priority decides which clause
      pools drop.
- [ ] **ARMOURY screen**, gated behind clearance like the other late screens.
- [ ] **Equipment policy** as a fifth standing order, with countersigned slots
      that automatic equipping may never override.
- [ ] **~40 clauses to start.** Our competitor has 100+ after years. A shallow
      pool shipped beats a deep pool planned.
- [ ] **Staging plan.** If this milestone slips, ship items and clauses first
      and the full form catalogue second. Do not cut it to nothing.

**Exit:** a player can show you an item they built and explain why it is theirs.

---

## M6 — An inhabited world

**Goal:** other case officers are visible and matter. Cuttable if time is short
— but the tavern is a lot of the charm.

- [ ] **Realtime tavern.** WebSocket instead of the 10s poll, with presence.
- [ ] **Chat safety — non-negotiable.** Rate limiting, length caps (done), a
      report path, and a block list. A competitor has negative reviews from a
      451-hour player written purely about other players.
- [ ] **No public wealth display.** Visible spending hierarchies are what
      produced "whale overlords" in a comparable game's chat.
- [ ] **Guild objectives fed by real play.** Contribution should come from
      resolution, not a fixture.
- [ ] **Leaderboards.** Depth reached, pension banked, most creative death.
- [ ] **Death feed detail.** Tap a death, read the last ten lines of that
      officer's log. Free content from data you already store.

**Exit:** ten concurrent testers, live chat, and a guild bar that moves because
people played.

---

## M7 — Able to take money

**Goal:** a purchase grants an entitlement that survives a reinstall.

- [ ] **Real sign-in.** Google Sign-In or Play Games. Device tokens cannot hold
      an entitlement — a wiped phone must not mean a lost purchase.
- [ ] **Account migration.** Anonymous device account → signed-in account,
      without losing the pension.
- [ ] **Entitlements and purchases tables.** Server-owned, like everything else.
- [ ] **Play Billing + server-side receipt validation.** The client never grants
      itself anything.
- [ ] **Restore, refund, revoke.** Including the unhappy paths: chargebacks and
      Play-initiated refunds have to remove the entitlement.
- [ ] **The SKUs.** Per [`docs/design/monetization.md`](docs/design/monetization.md):
      monitor swaps, additional filing cabinets (storage), standing-order
      templates, extended journal retention, and an optional Union membership
      bundling them. Permit expediting ships as a capped rewarded video —
      free to everyone — rather than a purchase, because in an idle game a
      time skip bought with money is power.
- [ ] **Real money never touches requisitions.** Office equipment is a gold
      sink (M4, [`docs/design/requisitions.md`](docs/design/requisitions.md)),
      and a gold sink that can be topped up with a card is a gold sink with a
      price tag. Cosmetics are the only overlap, because a palette confers
      nothing.
- [ ] **Rule: offline catch-up is never sold.** The nearest competitor puts
      extended offline progression behind a subscription and is steadily
      criticised for it — charging for the core promise of the genre. Automation
      is earned by default, too; an extra standing-order slot is convenience
      *and* power, and selling power breaks goal #3.

**Exit:** a test purchase survives an uninstall/reinstall cycle on a fresh
device.

---

## M8 — Store-ready

**Goal:** production access on Google Play. Mostly paperwork, and the long pole
is a calendar constraint you cannot compress.

- [ ] **Play Console account** (one-time registration fee).
- [ ] **Closed testing: 12 testers, opted in, 14 continuous days.** Required for
      personal developer accounts created after late 2023. **Start recruiting
      testers from M4** — this is a waiting requirement, not a work
      requirement, and it runs in parallel with everything else.
- [ ] **Privacy policy** and the **Data Safety** form.
- [ ] **Content rating** questionnaire.
- [ ] **Target API level** for the current Play requirement; minimal
      permissions.
- [ ] **Crash and ANR reporting** wired up before launch, not after.
- [ ] **Store listing.** Screenshots, feature graphic, description, short video.
      The CRT aesthetic is the marketing — lead with it.

> Verify every Play requirement against current policy before relying on it;
> the specifics change annually.

**Exit:** production access granted and the listing is complete.

---

## M9 — Launch and learn

- [ ] **Soft launch** to one market or an open test.
- [ ] **Analytics:** D1/D7 retention, session length, funnel to first purchase.
- [ ] **Ops:** alerting, error tracking, a cost check at 100 and 1,000 players.
- [ ] **Iterate on retention before spending anything on user acquisition.**
      Paying to fill a leaky bucket is the classic indie mistake.

**Exit:** D7 retention measured, unit economics known.

---

## The cut line

A solo part-time developer does not get to ship everything before launching.
This is the honest version of what v1 needs.

**v1 must have:** M1–M4 (it runs on a phone, a stranger understands it, it calls
you back, and it has direction), plus M7–M8 (money and store compliance).

**v1 could ship without:** M5 (crafting) and M6 (the social layer).

That is not a demotion. Shipping M5 as the first major post-launch update is
arguably *better* than launching with it:

- A new player will not hit the depth wall crafting solves for several weeks.
  Launch-day retention is decided by M2 and M4, not by affixes.
- It gives you a reason to be in front of people again six weeks after launch,
  when the initial attention has faded. Launching with a content pipeline
  already loaded is a live-ops advantage, not an admission.
- It converts the roadmap's biggest scope risk into a scheduling decision you
  make with real retention data instead of a guess.

The same logic applies to M6, with one exception: **the chat safety work is not
cuttable if chat ships at all.** Either the tavern launches moderated, or it
does not launch.

**Decide this at the end of M4, not now** — by then you will know how M2 and M3
actually landed.

---

## Parallel tracks

Things that are not milestones because they run alongside all of them.

- **Tester recruitment.** Start from M4. Play's closed-testing gate is 12
  testers for 14 continuous days; it is a calendar cost, not a work cost, and
  it is the single easiest thing to be blocked by at the end.
- **Writing.** Budget copy time in every milestone. Tone is the moat, and it
  wears out faster than the mechanics do.
- **Ops hygiene.** Backups, migrations, alerting — grow these as the player
  count does, not in one heroic sprint before launch.
- **Play a build every week** from M1 onward. Nothing in this document
  substitutes for that.

---

## Cross-cutting engineering

Not a milestone; pick these up as they start to hurt.

- [ ] CI: typecheck, test (with a Postgres service), build on every push
- [ ] Idempotency keys on mutations — a retried purchase must not double-charge
- [ ] Rate limiting on write endpoints
- [ ] Structured logging and error tracking (Sentry or equivalent)
- [ ] Heartbeat health metric and an alert when beats stop
- [ ] Load check: how many resolutions per second before Postgres complains?

---

## Decisions

### Still open

| Decision | Options | Recommendation |
| --- | --- | --- |
| Push delivery | FCM / OneSignal / local-only | Supabase is the database, but Android push still goes through FCM whatever the backend. Many of our events are *predictable* (permit approval, next world tick), so Capacitor local notifications could cover most of M3 with no push infrastructure at all — worth trying before wiring FCM. |
| --- | --- | --- |
| Compute host | Fly.io / Railway / Render / VPS | **Supabase is the database** (decided). It does not host a Node API, so the Fastify server still needs somewhere to run. Note for the adapter: Supabase's pooler in transaction mode needs prepared statements disabled. Free projects also pause after inactivity. |
| Tavern scope | Full realtime / keep polling / cut for v1 | Keep polling through M3. It works, and WebSockets can wait for real concurrency. |
| Launch shape | Soft launch / open test / full release | Open test. It gets you real retention numbers without a launch you only get once. |

### Settled

| Decision | Outcome |
| --- | --- |
| Monetisation model | **Convenience and cosmetics only.** Time skips are capped rewarded-video, free to all, never sold. Offline catch-up is never touched. |
| Gear/affix crafting | **Build it in M3** as Requisition & Arbitration — crafting as bureaucracy, forms that take real time to process. |
| Standing-order slots | **Earned only.** More concurrent policy is power, not convenience. |
| Equipment policy | **Automatic with a sticky manual override.** A fifth standing order sets the metric; an item issued by hand is countersigned and never auto-substituted until released. |

## Known risks

- **Retention without push.** M2 is load-bearing. An async game nobody is
  reminded about is an app nobody opens.
- **Balance is unproven.** Every tuning number is a guess by someone who has
  never played the game. M3 needs real play, not more spreadsheets.
- **Play's 14-day testing gate.** Schedule it early or it becomes two idle weeks
  between "finished" and "launched".
- **Solo scope.** M4 is the most cuttable milestone. Cut it before cutting M2 or
  M3.
- **Crafting scope.** Requisition & Arbitration is the largest single addition
  on the roadmap and lands in the milestone already most at risk of being
  underestimated. If M3 slips, it is the piece to stage rather than cut — ship
  items and clauses before the full form catalogue.
- **Content treadmill.** The joke wears out faster than the mechanics. Budget
  writing time in every milestone, not just M3. Tone is the one thing a
  better-funded competitor cannot copy convincingly — in the genre's biggest
  hit, the writing is the second most-praised quality after progression.
- **Onboarding cliff.** Worth restating as a risk, not just a task: competitors
  lose most churned players inside thirty minutes, to the interface rather than
  the game.
