# Deep Holdings — Roadmap

Living document. Milestones are ordered by dependency, not by date. Each has an
**exit criterion**: a thing that is either true or not, so "done" is never a
judgement call.

Competitive research behind several of these decisions lives in
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
3. **No pay-to-win.** There is a public death feed and a shared world. Bought
   advantage poisons both.
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

| Milestone | State |
| --- | --- |
| M0 — Playable loop, end to end | ✅ Done |
| M1 — On your phone | Next |
| M2 — Worth opening twice a day | |
| M3 — A game, not a demo | |
| M4 — An inhabited world | |
| M5 — Able to take money | |
| M6 — Store-ready | |
| M7 — Launch and learn | |

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

- [ ] **Portrait pass.** The 640px fixed screen and 1040px bezel are desktop
      shapes. Needs: fluid screen height, wrapping tab row, touch targets ≥44px,
      safe-area insets, and a command bar that survives the software keyboard.
- [ ] **Self-host the fonts.** Boot currently waits on Google Fonts; an app
      that opens on a train should not.
- [ ] **Capacitor wrapper.** Android project, app icon, splash screen, back
      button behaviour.
- [ ] **Deploy the server.** Managed Postgres + a small container host. Set
      `TOKEN_SECRET`, `DATABASE_URL`, `CORS_ORIGINS` (must include
      `capacitor://localhost`). TLS.
- [ ] **Migration tooling.** `001_init.sql` runs on boot today; needs a numbered
      migration table before there is data worth keeping.
- [ ] **Backups.** Automated, plus one restore drill. Before real players, not
      after.

**Exit:** the APK runs on your phone against the hosted API for seven days
without a crash or a data loss.

---

## M2 — Worth opening twice a day

**Goal:** the async loop actually pulls you back. This milestone is not
optional — an async game without notifications is a website you forget.

- [ ] **FCM push.** Recruit died; permit approved; descent stalled; guild
      objective closing.
- [ ] **Notification preferences.** Per-type toggles and quiet hours. Play
      requires a way to turn them off, and so does basic decency.
- [ ] **Deep links.** A death notification opens the death card, not the
      Terminal.
- [ ] **"While you were away" digest.** Returning after eight hours currently
      means reading 60 log lines. It should open on a summary — floors gained,
      gold banked, permits filed — with the raw log underneath.
- [ ] **Resume behaviour.** Refresh on foreground (done), plus handling for a
      device that slept through the heartbeat.
- [ ] **First-session onboarding.** The genre's biggest churn cause is the
      first thirty minutes: competitors' negative reviews cluster at 6–30
      minutes of playtime, citing an overwhelming interface with no direction.
      The boot sequence and the log are natural tutorial vehicles that cost us
      nothing in voice.
- [ ] **Progressive disclosure of the screens.** Do not hand a new officer all
      five tabs. Start on the Terminal; earn the Ledger, Tavern and Bulletin as
      clearance rises. Fixes the day-one and hour-hundred problems at once.
- [ ] **Prestige legibility.** A player must understand that death banks a
      pension, and that pensions are permanent, *before* their first recruit
      dies. "Not obvious when or why to prestige" is a standing complaint
      across the genre.

**Exit:** a push arrives, you tap it, and the app opens on something that
matters.

---

## M3 — A game, not a demo

**Goal:** two weeks of progression that doesn't repeat itself. This is the
milestone most likely to be underestimated.

- [ ] **Balance pass.** The numbers in `packages/shared/src/tuning.ts` and the
      curves in `resolve.ts` are first-pass guesses. Needs a target death rate,
      a permit-processing wait that isn't infuriating, and a difficulty curve
      through Depth 12.
- [ ] **Make the four knobs matter.** Target depth, retreat threshold, loot
      priority and spend policy should trade off against each other. Right now
      "deeper, braver" is close to strictly better.
- [ ] **Content volume.** More fauna, loot, journal copy, and permit tiers.
      The tone reference is `packages/server/src/domain/flavor.ts`.
- [ ] **Market that trades.** Selling inventory, not just reading prices.
- [ ] **Prestige depth.** Five unlocks is a demo. Needs tiers, and a reason to
      let a recruit die on purpose.
- [ ] **Journal pagination.** Capped at the last 60 lines; needs paging for
      players who want the whole shift.
- [ ] **A legible ladder.** The player should always see the next permit tier,
      what it unlocks, and how far away it is. Competitors churn hundred-hour
      players with "nothing is ahead of me"; our permit ladder is the structure
      they lack, but only if it is visible.
- [ ] **Milestone cadence.** Something visible moves every session. No
      multi-week walls — they are churn events with a countdown attached.

**Exit:** a tester plays for two weeks and can explain their strategy to you.

---

## M4 — An inhabited world

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

## M5 — Able to take money

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
- [ ] **The SKUs.** Cosmetic monitor swaps (the green phosphor unlock is the
      prototype) and rewarded-video "permit expediting" — a time skip that
      reads as bureaucratic bribery.
- [ ] **Rule: offline catch-up is never sold.** The nearest competitor puts
      extended offline progression behind a subscription and is steadily
      criticised for it — charging for the core promise of the genre. Automation
      is earned by default, too; an extra standing-order slot is convenience
      *and* power, and selling power breaks goal #3.

**Exit:** a test purchase survives an uninstall/reinstall cycle on a fresh
device.

---

## M6 — Store-ready

**Goal:** production access on Google Play. Mostly paperwork, and the long pole
is a calendar constraint you cannot compress.

- [ ] **Play Console account** (one-time registration fee).
- [ ] **Closed testing: 12 testers, opted in, 14 continuous days.** Required for
      personal developer accounts created after late 2023. **Start recruiting
      testers during M3** — this is a waiting requirement, not a work
      requirement, and it can run in parallel with everything else.
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

## M7 — Launch and learn

- [ ] **Soft launch** to one market or an open test.
- [ ] **Analytics:** D1/D7 retention, session length, funnel to first purchase.
- [ ] **Ops:** alerting, error tracking, a cost check at 100 and 1,000 players.
- [ ] **Iterate on retention before spending anything on user acquisition.**
      Paying to fill a leaky bucket is the classic indie mistake.

**Exit:** D7 retention measured, unit economics known.

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

## Decisions needed

| Decision | Options | Recommendation |
| --- | --- | --- |
| Monetisation mix | Cosmetics only / + time skips / + rewarded ads | Cosmetics + rewarded video. Both fit the fiction; neither sells power. |
| Hosting | Fly.io / Railway / Render / VPS | Whichever you'll actually operate. Lazy resolution means idle players cost nothing, so start on the cheapest tier. |
| Tavern scope | Full realtime / keep polling / cut for v1 | Keep polling through M3. It works, and WebSockets can wait for real concurrency. |
| Launch shape | Soft launch / open test / full release | Open test. It gets you real retention numbers without a launch you only get once. |
| Gear/affix crafting | Build it (M3) / skip it | Undecided — it is the most-praised system in the closest competitor and our biggest structural gap, but it is a large addition. Scope it deliberately or skip it deliberately. |
| Standing-order slots | Earned only / purchasable | Earned only. Convenience shades into power here. |

## Known risks

- **Retention without push.** M2 is load-bearing. An async game nobody is
  reminded about is an app nobody opens.
- **Balance is unproven.** Every tuning number is a guess by someone who has
  never played the game. M3 needs real play, not more spreadsheets.
- **Play's 14-day testing gate.** Schedule it early or it becomes two idle weeks
  between "finished" and "launched".
- **Solo scope.** M4 is the most cuttable milestone. Cut it before cutting M2 or
  M3.
- **Content treadmill.** The joke wears out faster than the mechanics. Budget
  writing time in every milestone, not just M3. Tone is the one thing a
  better-funded competitor cannot copy convincingly — in the genre's biggest
  hit, the writing is the second most-praised quality after progression.
- **Onboarding cliff.** Worth restating as a risk, not just a task: competitors
  lose most churned players inside thirty minutes, to the interface rather than
  the game.
