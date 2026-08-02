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
| M3 — It calls you back | Push verified on device; deep-link tap not | yes |
| M4 — It has direction | | yes |
| M5 — It has depth (crafting) | Items, clauses, Forms 12-C and 19 | *candidate cut* |
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
      hardware back returns to the Terminal. **Built and run on a physical
      device.** It did not build the first time, and "unverified" turned out to
      mean broken: `ic_launcher_background.xml` had a `--` inside an XML
      comment, which is illegal, so resource merging failed and the project had
      never compiled anywhere — through an icon pass, a notifications pass and
      a green CI job. AGP 8 also needs `buildFeatures.buildConfig` before
      `BuildConfig.DEBUG` exists. CI now parses every XML in the native tree,
      which would have caught it on the commit that introduced it.
      Needs JDK 21 specifically; 17 and 26 each fail differently.
- [x] **App icon and splash screen.** Generated from one definition by
      `packages/client/tools/make-icons.mjs` — 27 files: legacy mipmaps at five
      densities, adaptive foreground at five, both splash orientations, and the
      512 Play icon. Rendered geometry at the game's exact token values rather
      than a resampled raster, because an icon is judged at 48dp and lives on
      crisp edges. Verified down to 48 and under the circular mask.
      The mark is the command prompt: `>` and a cursor block on the screen, in
      the beige bezel. The bezel is the adaptive *background* layer, so it
      fills whatever shape a launcher masks to and the foreground carries only
      the screen — sized to the 66/108 safe circle.
      The rounded-bezel composition came out of a Krea 2 generation that read
      better than the squared frame drawn first; its palette and soft edges did
      not survive, the idea did.
      **The splash is flat, not photographic.** The app boots into a stylised
      CRT sequence and a photograph ahead of it is a cut between two media in
      the first second of the game — plus five densities of photo in the APK
      for something on screen under a second.
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
- [x] **The command line is genuinely good.** Thirteen verbs, not five screen
      names: `depth 9`, `retreat 30`, `loot relics`, `spend hoard`, `sell
      <partial name>`, `retire confirm`, `sync`, `help`. Persisted history on
      the arrow keys, completion on Tab *and* as tappable chips — completion
      that needs a desktop keyboard would make typing exactly the second-class
      path it must not be.
      **It answers now.** An unrecognised word used to do nothing whatsoever,
      which reads as a broken input rather than a wrong word.
      This changes what Keyboard Requisition can sell — see
      [`docs/design/requisitions.md`](docs/design/requisitions.md).
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
- [x] **FCM push** for the one genuinely unpredictable event: death.
      HTTP v1 with a service account, against `fetch` and `node:crypto` rather
      than firebase-admin — fifty megabytes of dependency to sign a JWT is a
      poor trade, and the legacy server key is a bearer credential with no
      scope and no expiry.
      **The hard part was not FCM.** Resolution is lazy, so a recruit who dies
      at 3am is not dead on the server until the officer next opens the app —
      by which point the notification has nothing to announce. The heartbeat
      now runs a bounded **death sweep**: accounts with a token, unread for
      fifteen minutes, 200 per beat, oldest first. It calls `resolve()` and
      throws the result away rather than calling `loadState`, because the
      obvious version would have eaten the "while you were away" digest for
      exactly the players who were away longest, and would have marked swept
      officers as present in the tavern. Ticks are seeded from
      `(characterId, tick)`, so the death the sweep sees is bit-for-bit the
      death the player's next read produces.
      Server-side rate discipline mirrors the client's: two pushes per account
      per day, deduped on `death:<characterId>` by primary key rather than by
      check-then-write, so two workers racing on one death send once.
      Without credentials the server runs `NullSender` and says so at boot —
      a supported state, not a broken one. See
      [`docs/ops/push.md`](docs/ops/push.md).
      **Verified end to end on a physical device.** `push:ping` reached the
      phone, and a death found by the sweep reached it unprompted with the app
      backgrounded, leaving exactly one `death:<characterId>` row in
      `push_sends` — so the dedupe path fired for real rather than in a test.
      The wire was not the hard part in the end: what stood in the way was the
      WebView refusing the LAN request as mixed content, which
      `network_security_config.xml` does not cover because it governs cleartext
      sockets rather than Chromium's own check against the `https://localhost`
      origin. Overridden for debug builds only, and moot under TLS.
- [x] **Notification preferences.** Master switch, per-type toggles and quiet
      hours (23:00–08:00), persisted with the other quality-floor settings. A
      delivery landing in quiet hours waits rather than being dropped.
- [x] **Deep links.** A tapped notification refreshes *first*, then routes to
      the screen named in its `extra`, clamped to the officer's clearance.
      Refresh-before-navigate is the load-bearing half: a notification is by
      definition about something that happened while the app was not looking,
      so landing on a stale Terminal that still shows the permit processing
      reads as the notification having lied. Cold start needs no separate
      branch — Capacitor replays the launch action into the listener — but the
      listener must be registered unconditionally on mount, which is why
      clearance is read through a ref rather than a dependency.
      **Still unverified on a device.** The listener only registers under
      `Capacitor.isNativePlatform()`, so nothing here runs in a browser and
      nothing here is covered by a test. The device run proved a notification
      *arrives*; nobody has yet tapped one and watched where it lands.
- [x] **Resume behaviour.** Three signals now: `focus` and `visibilitychange`
      for the browser, `App.appStateChange` for Android — where the WebView is
      not reliably told it became visible, and where `useInterval`'s timer does
      not run at all while the device sleeps. A phone that slept through eight
      hours of ticks used to wake with an eight-hour-old snapshot and no poll
      scheduled to correct it.
- [x] **Send rate discipline.** `native/sendBudget.ts`: at most four
      deliveries per local calendar day, and the same event never twice. The
      dedupe key is the *event* (`permit:4`), not the notification slot — D-4
      and D-5 share slot id 1001 and both deserve to arrive. Cancelling
      refunds the key, because the schedule is re-derived on every refresh and
      an officer who opens the app five times while one permit processes must
      not spend the whole day's budget on it. Nine tests.
      With two local notification types the cap is not yet binding; it is
      written now because the thing that makes it binding is FCM, and a budget
      added after push is a budget added after the first complaint.

**Exit:** a push arrives, you tap it, and the app opens on the thing it was
about. **Half met** — the push arrives, on a real phone, unprompted. The tap
has not been tried.

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
- [x] **Loot Priority is no longer thin.** Case files — the first slice of
      Requisition & Arbitration — make it the knob that decides what gear you
      end up carrying. 25 careers × 14 days each: gold 10.2 deaths and the most
      coin, gear 8.5 and two carried files, relics 8.6 with the best pension,
      knowledge 6.8 and Grade 20 at a third less income. Four legible
      strategies where there was one small trade.
      **Spend Policy is still thin** and stays open.
      See [`docs/design/balance.md`](docs/design/balance.md).
- [x] **Greedy play should pay better** — wrong diagnosis, real bug behind it.
      Depth already pays: ordering Floor 9 with an ordinary retreat threshold
      gives up 6% of income and returns 105 pension/h, better than the daily
      retirer. The failure was entirely the **retreat threshold**, which ran
      5-80 and meant something across only part of that. Narrowed to 10-45, so
      every position on the slider changes an outcome.
      *Re-measured after the fast-forward fix, 12 careers × 14 days per point:*
      the collapse is real but starts higher than first reported — retreat 60
      and 80 are identical (zero deaths in 12 of 12, Grade 21 in all of them)
      and 50 is nearly there, at 0.42 deaths with 10 of 12 careers banking
      nothing. 35 through 45 are *not* identical: 12.3, 6.8, 1.7 and 1.3 deaths
      a fortnight. So 45 is the right ceiling, but because it is where careers
      start banking nothing at all — not because everything above 35 resolves
      the same way. The original claim came off the broken endpoint.
      Found on the way: successors never inherited anything, so death was a
      total wipe in the shipped game. Both in
      [`docs/design/balance.md`](docs/design/balance.md).
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
- [x] **Content volume.** Encounter names are generated from a grammar —
      `{species}, {qualifier} (Grade N)`, with species banded by depth — which
      turns a flat list of seven into roughly nine hundred per band. Journal
      copy roughly quadrupled, with form and case numbers generated inside
      otherwise fixed sentences. **Loot names stay written and bounded**,
      because they are inventory stack keys: a generated name means every
      acquisition is its own stack and a twelve-slot cabinet liquidates
      everything forever. They are depth-banded instead, so Floor 12 pays in
      things Floor 1 has never seen.
      Two findings came out of it, both in
      [`docs/design/balance.md`](docs/design/balance.md): prose must draw from
      its own rng or writing copy silently re-rolls combat, and permit D-5
      used to authorise the same depth as D-4 — a three-hour wait for a
      milestone that granted nothing.
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
- [x] **Journal pagination.** `GET /v1/journal?before=<id>` pages backwards to
      the start of the recruit's file, sixty lines a tap, with the scroll
      position anchored so a prepend does not throw the reader across the log.
      Paged-in history is not typed out — the officer asked for it.
      This settled what Extended Journal Retention actually sells. Nothing in
      the journal is ever deleted, so if retention capped how far back you
      could read, the requisition would be the **only** path to older lines —
      which the requisitions rule forbids. It buys how many lines the Terminal
      *opens* with; paging is free and unlimited for everyone. The catalogue
      copy said "keeps 150 lines", implying a deletion that never happened, and
      now says "opens with".
- [x] **A legible ladder.** The Terminal shows the permit in processing, the
      depth it authorises and an estimate — and permit processing was
      lengthened to three hours so the wait is actually visible to someone who
      checks in twice a day. See `docs/design/balance.md`.
- [x] **Milestone cadence.** Something visible moves every session, and there
      is now a number for it: on the shipped defaults, over 20 careers × 14
      days, 6.1% of 12-hour windows contain no state change and the longest
      silence is one day. The old defaults were 60.7% and 2.5 days. Measured
      with `npm run cadence -w @deepholdings/server`, which drives the resolver
      rather than the server. Repeating "you are still stuck" lines are
      excluded, as is the guaranteed twice-daily service review — counting
      either would make the criterion unfalsifiable.
      **What this does not settle:** whether the 93.9% *reads* as something
      happening. Journal-line density is not the same as a player feeling their
      career moved, and that needs the tester in the exit criterion.
- [x] **The default standing orders are a dead end — fixed.**
      Target Depth defaults to 3, which is exactly what Permit D-2 authorises,
      so the recruit never stalls, never applies for a permit and never
      descends. Retreat defaults to 28%, which at Floor 2 never kills anybody,
      so pension stays zero and all nineteen prestige unlocks are invisible.
      Confirmed on 20 careers × 14 days: zero deaths in 20 of 20, zero pension
      in 20 of 20, Permit D-2 in all of them.
      Now Target Depth 12, Retreat 35: 12.3 deaths a fortnight, median 49k
      pension, Permit D-8, and 6.1% empty check-ins. 35 over 38 because they
      tie on pension and 35 is three times better on cadence — *not* because
      38 is bimodal, which was an artifact of the broken fast-forward below.
      See [`docs/design/balance.md`](docs/design/balance.md).
- [x] **Developer time travel.** `advance <hours>` in dev builds moves the
      world clock forward and lets the ordinary resolver catch up in
      catch-up-sized chunks, so a fast-forwarded career is the career a real
      absence produces. An idle game that takes a fortnight to answer a
      question never gets asked one.
- [x] **The fast-forward was a treadmill — fixed.** It used to wind the
      character's watermark *backwards* against a fixed `Date.now()`. Every
      tick is seeded from `(characterId, tick)`, so replaying the same absolute
      window replays the same seeds: six one-hour advances simulated the same
      hour six times. Careers fast-forwarded through a fortnight lived one
      hour, and death rates came out about sixteen times too low. Nothing threw
      and all four endpoint tests passed, because none asserted that advanced
      time was *different* time — which is the regression test now. Every
      balance number taken through the endpoint has been re-measured on a
      harness that drives the resolver directly.

**Exit:** a tester plays for two weeks and can explain their strategy to you.

---

## M5 — It has depth

**Goal:** items that feel like yours. The largest single addition on the
roadmap, designed in full at [`docs/design/crafting.md`](docs/design/crafting.md).

Being taken in the staged order the last item asks for. Half of it is in.

- [x] **Case files** — items with a grade, a case number, clauses, and a
      three-slot drawer that evicts its weakest entry rather than refusing a
      find. Drop rates are biased by Loot Priority, so that knob now decides
      what the recruit brings back and not merely how much.
- [x] **ARMOURY screen**, gated on permit D-3 or a second recruit. Shows the
      drawer, every clause and what it does, and the combined effect against
      its ceilings — including the figure the ceiling took off, because a
      player who adds up their clauses and gets a different number has found a
      bug as far as they know.
- [x] **20 clauses** — 11 endorsements, 9 riders. Half the target pool.
- [x] **Union Standing** as a real currency. It had been in the log copy since
      the prototype against no stored number; it is earned at a grade review
      and spent filing forms, and it is not inherited.
- [x] **Form 12-C — Arbitration**, and the filing rails under it: forms queue
      with a resolution tick, resolve inside the tick loop, and are seeded on
      the filing so a replayed span cannot change the ruling. The case can be
      dismissed and the fee retained, which is the risk the whole form exists
      to carry.
- [x] **Form 19 — Requisition.** Carries one clause from one file onto another
      and strikes the first from the register. Four hours, no standing, cannot
      be dismissed — deliberately the opposite of 12-C, because a catalogue
      where every entry is a dice roll with a different name is a catalogue
      with one form in it. In the drawer it is a two-tap carry, and illegal
      destinations are never offered rather than refused afterwards.
- [ ] **The rest of the form catalogue** — 7-A, 3-B, N-1 and 44. Each needs
      something that does not exist yet (hidden clauses, vacant slots,
      provenance), and each of those changes what drops, which means
      re-measuring. Authoring on rails that now exist.
- [ ] **~40 clauses.** Our competitor has 100+ after years. A shallow pool
      shipped beats a deep pool planned.
- [ ] **Equipment policy** as a fifth standing order, with countersigned slots
      that automatic equipping may never override.
- [ ] **Provenance and Union Standing**, which the forms spend.

**Exit:** a player can show you an item they built and explain why it is theirs.
**Substantially met** — a player can now say "I contested that clause twice,
then fed a Grade IV relic into it to keep the one endorsement I wanted". They
cannot yet fill a vacant slot, lock a roll, or settle a provenance.

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
- [x] **Store listing art.** Icon, five phone screenshots and the 1024×500
      feature graphic in [`docs/store/`](../docs/store/), all generated by
      `packages/client/tools/store-shots.mjs` from the running game rather than
      drawn or prompted. Description and short video still to write.
      A generated-photography pass came first and read as AI slop; the tells
      and the reasoning are recorded in
      [`docs/store/README.md`](../docs/store/README.md). The listing shows the
      screen because the screen is the argument.

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

- [x] CI: typecheck, test (with a Postgres service), build and `cap sync` on
      every push. `.github/workflows/ci.yml`. The Postgres service is not
      optional: `test/adapters.ts` refuses to run when `CI` is set without
      `TEST_DATABASE_URL`, because the skip is silent and a green tick would
      otherwise cover 69 of 115 tests. The `cap sync` step found
      `@capacitor/local-notifications` missing from the committed gradle
      files on its first run — M3's notifications were in `package.json` and
      absent from any APK built off this tree.
      A second gap closed the same way: `cap sync` reconciles the plugin list
      but compiles nothing, so the tree could hold a resource file no tool in
      the job ever read. It did — an illegal `--` in an XML comment meant the
      Android project had never compiled anywhere, and a device build found it
      rather than CI. Parsing every XML in `packages/client/android` needs no
      SDK and would have caught it on the commit that introduced it.
- [ ] Idempotency keys on mutations — a retried purchase must not double-charge
- [x] Rate limiting on write endpoints. Token bucket, per account and per
      route, in `src/rateLimit.ts`. A fixed window would let someone spend a
      whole allowance at one boundary and the next immediately after — twice
      the intended rate at the worst moment.
      The tavern is the only limit chosen for a reason rather than a guess:
      six a minute is faster than anyone types thoughtfully and slower than a
      flood. The rest are generous, because a limiter that fires during
      ordinary play teaches players the game is broken.
      **Reads are never limited** — resolution happens on read, so throttling
      `/v1/state` would stall the game, and the load check says a read costs
      about 12ms. A request whose token does not verify is left alone entirely
      so it gets 401 rather than 429: a client told to back off will back off
      instead of re-authenticating, which is the one action that would fix it.
      In-process, so two instances multiply the effective limit. Written down
      in the module rather than discovered later.
- [ ] Structured logging and error tracking (Sentry or equivalent)
- [ ] Heartbeat health metric and an alert when beats stop
- [x] Load check: `npm run load -w @deepholdings/server`. 500 accounts on
      Postgres 16, staleness spread across the whole catch-up window, single
      connection: **read path p50 11.7ms, p99 36.9ms — about 86 reads/sec.**
      The sweep costs 2.4ms an account, so a full 200-account beat is 486ms
      against a 300s interval, or 0.16% of one worker. `SWEEP_LIMIT = 200` was
      a guess and turns out to be conservative by two orders of magnitude.
      **It found a real one.** The journal read — the hottest query in the
      game, one per `/v1/state` — had no usable index and the planner was
      walking the *primary key* backwards, discarding 7,871 rows to return 60.
      That cost scales with how much everybody has played rather than with this
      player, and the journal is never pruned by design. Migration 006 adds
      `(character_id, id DESC)`: 16x on the query, and the read path's p99 on a
      caught-up account went 143.8ms to 12.2ms.

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
- **The game may simply be short, and not know it.**
  [`docs/research/mobile-incrementals.md`](docs/research/mobile-incrementals.md)
  reads the two Play-native incrementals we will actually sit beside. Both sell
  "thousands of upgrades" and "months or years"; we have 19 unlocks, 7
  requisitions, one prestige axis, and a hard ceiling at Floor 12 / Permit D-8
  with nothing past it. Every balance measurement taken so far describes a
  fortnight, because the harness has only ever run fourteen days. Nothing in
  any design document says what a player does in month two.
  This is a bigger risk than "is the loop fun", and unlike that one it is
  measurable without a tester. **Now measured**: `npm run longrun` said the
  last new thing happened on **day 13.4**, with 76 of 90 days containing
  nothing the player had not seen.
  **Three structural faults found and fixed**, in the order they were found:
  Grade climbed to 46 while `authorisedDepth` had been capped at 12 since day
  four (now surplus grade becomes `seniority`, which shifts case-file quality);
  the 19 unlocks arrived in three lump sums rather than a curve (tier 2 and 3
  re-priced and spread); and — the one the first two exposed — **the game was
  ending itself**. `maxHpForLevel` scaled with grade while damage scales with
  depth, so past Grade ~26 nothing in the game could kill the recruit; death is
  the only pension source, so progression stopped dead on about day 14 and
  never resumed. Deaths per fortnight read 8, then 0, then 0.
  After the cap: last new thing **day 39.2**, 19 of 19 unlocks bought, income
  flat-to-rising across all six fortnights, empty check-in windows 6.8% → 4.0%.
  Fifty days still have nothing new in them, but that is now a content gap
  rather than a system refusing to pay out.
  Full timeline and arithmetic in
  [`docs/design/balance.md`](docs/design/balance.md).
- **Onboarding cliff.** Worth restating as a risk, not just a task: competitors
  lose most churned players inside thirty minutes, to the interface rather than
  the game.
