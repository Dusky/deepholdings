# Competitive read: the mobile-native incrementals (CIFI and ISEPS)

**Why these two.** The existing sample in
[`genre-cues.md`](./genre-cues.md) is Steam-first — NGU IDLE, Unnamed Space
Idle, Melvor Idle, Idle Hacking. Only Melvor has a real mobile client. That is
a hole, because Deep Holdings is Android-first and F2P, and the games it will
actually sit beside in the Play listing are neither.

CIFI and ISEPS fill it. Both are by **Octocube Games**, a Danish studio with
over a million downloads across its titles, and both are Play-native.

| | [CIFI](https://play.google.com/store/apps/details?id=com.OctocubeGamesCompany.CIFI) | [ISEPS](https://play.google.com/store/apps/details?id=com.AppSociety.ISEPS) |
| --- | --- | --- |
| Full name | Cell: Idle Factory Incremental | Idle Space Energy Particle Simulator |
| Installs | 500,000+ | not published |
| Status | Early Access, still shipping in 2026 | released, still updated |
| Model | free, ad tokens + paid currency | free, ads with a cheap ad-free unlock |
| Accolade | **r/incremental_games Best Mobile Incremental 2023, 2024 and 2025** | the studio's first title |

A three-year streak of the community award for the whole mobile category, from
a small studio, is the single most encouraging fact in this document: **this
niche is winnable by a team of our size on Play.** It is also where the
comfortable reading stops.

## What they are actually selling

The developer's own copy for CIFI leads with:

> "Massive upgrade trees built for players who love watching the numbers climb
> higher."

And the community description: *thousands of upgrades, multiple prestige
systems, months or years of progression*. ISEPS is described as "one of the
largest and most content-rich idle incrementals to date".

Both are, in other words, winning on **volume of numbers**.

## The uncomfortable comparison

Deep Holdings' product goal #8 is:

> **Numbers stay human.** Gold in the hundreds, permits in tiers, pensions in
> round numbers. Never ship scientific notation.

That is a deliberate, explicit rejection of the thing the category winner's
store page leads with. It may well be the right call — but it should be held
as a *bet*, not as a principle, because the evidence available says the
audience that installs mobile incrementals is substantially there for the
climb.

The second comparison is worse and is not a matter of taste:

| | CIFI / ISEPS | Deep Holdings |
| --- | --- | --- |
| upgrades | "thousands" | 19 prestige unlocks + 7 requisitions + 3 posts |
| prestige layers | multiple, stacked | one (pension → unlocks) |
| automation ladder | the spine of the genre | 3 posts, one tier (was: none) |
| stated longevity | "months or years" | untested; the content runs out well before that |
| depth ceiling | effectively unbounded | Floor 12, Permit D-8, and then nothing |

**The risk this surfaces is not that the game is bad. It is that the game is
short.** Everything measured so far — mortality, pension curves, cadence, the
new case files — describes a fortnight. Nothing in the design says what a
player does in month two, and the balance harness cannot tell us, because it
only ever ran fourteen days.

## What is worth stealing

- **A hard offline cap that is a design tool, not a punishment.** CIFI caps
  offline earnings at 24 hours, which is what makes a daily login worth
  something without punishing a missed day. Deep Holdings caps catch-up at
  `MAX_CATCHUP_TICKS` (12 hours) but *summarises* the overflow rather than
  dropping it, so a fortnight away costs the player nothing and gains them
  nothing. Ours is kinder; theirs creates a reason to open the app. Worth
  measuring whether the kind version costs retention.
- **Stacked prestige layers.** CIFI's "Loop Mods" sit on top of ordinary
  progression, so there is always a longer arc than the one you are on. Deep
  Holdings has exactly one prestige axis and no second layer designed.
- **Ads as the F2P default, with a cheap ad-free unlock.** Octocube's model is
  simpler than ours and proven on this store. Our monetization doc rules out
  anything but capped rewarded video, which is a stricter line than the
  category winner takes. Defensible; also untested revenue-wise.

## What not to steal

- **Particle-rendering spectacle.** ISEPS is reported to strain weaker phones
  because it renders particles in high quality. A CRT terminal has no such
  problem and should not acquire one.
- **Their onboarding problem.** "Complex mechanics", "mind-boggling number of
  upgrades" and "for any skill level" are in tension, and it is the same cliff
  `genre-cues.md` already identifies as where the genre loses people. Deep
  Holdings' progressive disclosure is a genuine advantage here — keep it.

## What this says about the open question

The question that prompted this research was *"are we sure the game is good?"*
This does not answer it, and could not. What it changes is which doubt to take
seriously.

It is now less likely that the loop is fundamentally unappealing: a text-heavy,
slow, mobile incremental won its category three years running, and Idle Hacking
(in [`idle-hacking.md`](./idle-hacking.md)) is a text-based idle MMO with an
82% score. There is an audience for this shape.

It is more likely that **the game is a fortnight long and does not know it.**
That is a content problem with a known fix, and it is measurable — unlike
"is it fun", which still needs the stranger M2 has been waiting for.

## The genre's actual complaint, and why it cuts against the fix

Player sentiment for these two specific games could not be read (see below).
What a broader search of incremental-game discussion does show, consistently,
is that the dominant complaint in the category is **late-game grind and
burnout** — content locked behind repetition, players quitting before the
later tiers, "the late game grind is the worst part".

That is the *opposite* failure from the one this document identifies for Deep
Holdings, and the two are in tension. The obvious fix for "the game is a
fortnight long" is more content; the genre's most common way to lose a player
is content that is technically there and tedious to reach. Padding the ceiling
with a longer grind would trade our problem for theirs, and theirs is the one
players write reviews about.

Whatever answers month two has to be *new*, not slower.

## Caveats

Stated plainly because this document will be cited later, and with the dead
ends recorded so nobody spends the attempts again:

- **No player sentiment for either game was read directly.** Unlike
  `idle-hacking.md`, which quotes actual reviews, nothing here is sourced from
  a player. Four routes were tried and all failed: reddit.com is not
  accessible to our web tooling at all (both search-by-domain and direct
  fetch), Google Play's listing pages are JavaScript-rendered so an automated
  fetch returns only the navigation shell, and both incrementaldb review pages
  return HTTP 403.
- **Neither game has a dedicated subreddit.** Their community lives on
  r/incremental_games, which is also the source of the award — so the single
  place the sentiment exists is the single place unreachable from here. If
  this gap is worth closing, it needs a person to read and paste, or a browser
  session.
- Install counts and the award streak come from store listings and search
  results, not a primary source opened directly.
- ISEPS install numbers are not published anywhere reachable.
- No rating figures were verified for either game.
- Nobody here has played either title. This is a read of positioning and
  store copy, not of the games.

## Sources

- [CIFI on Google Play](https://play.google.com/store/apps/details?id=com.OctocubeGamesCompany.CIFI)
- [ISEPS on Google Play](https://play.google.com/store/apps/details?id=com.AppSociety.ISEPS)
- [Octocube Games — CIFI](https://octocubegames.com/cifi/)
- [Octocube Games — ISEPS](https://octocubegames.com/iseps/)
- [CIFI wiki: Research Catalogue](https://cifi.game-vault.net/wiki/Research_Catalogue)
- [CIFI wiki: AD Tokens](https://cifi.game-vault.net/wiki/AD_Tokens)
- [ISEPS on the Incremental Games wiki](https://incrementalgames.miraheze.org/wiki/ISEPS_Idle_Particle_Simulator)
- [incrementaldb: CIFI](https://www.incrementaldb.com/game/cell-idle-factory-incremental-cifi) *(review page 403s to automated fetch)*
- [incrementaldb: ISEPS](https://www.incrementaldb.com/game/iseps-idle-particle-simulator)
