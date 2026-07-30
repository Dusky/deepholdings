# Competitive read: *Idle Hacking: An Inaction RPG*

Research note, July 2026. Source material: the Steam store page, ~100 recent
reviews via the Steam review API, and the top-rated English reviews.

## Why it is worth studying

It is our game with a different skin: a persistent, text-based idle MMO where
the character progresses while you are logged out, players group into guilds,
and the whole thing is presented as text rather than art.

| | Idle Hacking | Deep Holdings |
| --- | --- | --- |
| Theme | Cyberpunk hacking | 1983 bureaucratic dungeon delving |
| Presentation | Text-based | Text-based, CRT terminal |
| Progression | Offline up to 12h | Offline, clamped at 12h catch-up |
| Social | Syndicates, marketplace, global chat | Guilds, market, tavern channel |
| Platform | Steam (Win/Mac/Linux) + browser | Android first |
| Model | Free to play + IAP + ~$5/mo premium | TBD |

**Performance:** released 18 March 2026; ~223 reviews at 82% positive ("Very
Positive") about four months in. Retention in the reviews themselves is
striking — recommended reviews at 1,373h, 1,160h, 472h, 432h, 369h. A
text-based idle game holds people for hundreds of hours.

That is the headline finding: **the format works.** Nobody is bouncing off this
game because it is text.

## Where players churn

The negative reviews split cleanly into two clusters, and the playtimes tell
the story better than the words do.

### Cluster 1 — the first thirty minutes (onboarding)

Playtimes of 6, 15, 16, 18, 20, 77, 79 and 156 minutes. Near-universal theme:

> "Overwhelming interface from the start with no clear direction"

> "I didn't find it very engaging... tutorial extremely lacking"

> "players say do tutorials, which the game makes you do one of — apparently
> there's 5 of them but hidden somewhere"

These players never reached the loop. They were defeated by the first screen.

### Cluster 2 — the 40–120 hour wall (direction)

> "you kind of have access to everything from the jump... just grinding for
> grinding's sake" — 116h, not recommended

> "no juice here... no progression... feels kind of hollow" — 116h

> "wait times increase exponentially" — 40h

The systems are balanced and deep; what is missing is a reason. Players who
invested a hundred hours left because nothing was ever *ahead* of them.

### Cluster 3 — the community

Two reviews, at 13.5h and 451h, are negative purely about other players:
"whale overlords", "terminally online personalities". A 451-hour player leaving
a negative review over social dynamics is a retention failure that has nothing
to do with the game's mechanics.

## What they praise

- **Crafting depth.** ARPG-style prefix/suffix affixes (100+) on gear. The
  single most-cited reason people stay. "The crafting system is fun to
  experiment with."
- **Developer presence.** Cited in nearly every positive review. One player
  reported a bug fixed "in less than 5 minutes". Another: "Kai is the goat dev".
- **The community** (from the other side) — helpful, answers questions,
  syndicates reduce the isolation of an idle game.
- **Respecting time.** Offline progression is the feature people name when
  explaining why they can play it alongside a job.
- **Text presentation as personality**, not as a limitation.

## Monetization, as reported by players

Not itemised on the store page; the following is from reviews and should be
verified before being used as a model.

- Roughly **$5/month premium**, giving extended offline progression and
  automatic event joining.
- Premium currency and marketplace items, which players report are also
  obtainable with in-game currency.
- Most reviewers explicitly defend it: "not p2w despite the negative reviews."

The interesting failure mode: gating *offline progression* behind the
subscription produces a perception that "true idling requires payment" — in an
idle game, that is charging for the core promise. It has not sunk them, but it
is the friction their monetization generates.

---

## Takeaways for Deep Holdings

### 1. The first session is the whole ballgame

Most of their churn is people who quit inside half an hour to an overwhelming
interface. Our CRT shell is beautiful but presents five tabs, a command bar and
a form of four knobs with no explanation.

**Do:** treat the first session as a designed experience — the boot sequence is
a natural tutorial vehicle, and the log is a natural place for the Authority to
tell you what to do next. Nothing about that requires breaking voice.

### 2. Our permit ladder is the thing they are missing

Their hundred-hour churn is "everything is available from the jump, so nothing
is ahead of me." We already have a goal structure they lack: permits gate
depth, depth gates everything else, and permit applications take real time.
That is a ladder with visible rungs.

**Do:** make the ladder legible. The player should always be able to see the
next permit tier, what it unlocks, and how far away it is. This is a
strengthening of what exists, not new invention.

### 3. Depth of build, not just depth of numbers

Crafting is the most-praised feature in the entire corpus. Our four standing
orders are policy, not build. There is no equivalent of "I made this thing and
it is mine."

**Do:** consider gear affixes with the same clerical joke applied — items with
disputed provenance, contested modifiers, forms attached. This is a real M3
scope increase and worth deciding deliberately rather than drifting into.

### 4. Do not paywall the async promise

Their subscription extends offline hours. Ours must not: "absence is never
punished" is product goal #2, and selling relief from a punishment we designed
is the cynical version of this genre.

**Do:** keep catch-up free at whatever the right number is. Sell cosmetics
(monitor swaps already work), and sell *expediting a specific queue* — permit
processing — which is in voice and does not touch the baseline.

### 5. Moderation is a launch requirement, not a v2 feature

A 451-hour player left a negative review about other players. Chat is a
retention lever pointed at your own foot if it is unmoderated.

**Do:** keep report/block/rate-limit in M4 as non-negotiable, and consider
whether the tavern should have any status display at all — a public wealth
hierarchy is what produced "whale overlords."

### 6. Their platform gap is our opening

They are Steam-first with a browser client, and reviewers describe the mobile
web version as "janky... playing on mobile is a no go" — for a genre whose
audience checks in between other things. We are Android-native from the start.

**Do:** nothing differently. This validates the plan. It is also the sharpest
line in a store listing: the idle game that is actually good on a phone.

### 7. Developer presence is a feature

It appears in nearly every positive review. For a solo developer this is the
cheapest retention mechanism available and it is not something a bigger
competitor can copy convincingly.

**Do:** budget for being visible in the tavern. In our fiction the developer is
the Authority, which is a very funny seat to answer support questions from.

---

## Proposed roadmap changes

| Milestone | Change |
| --- | --- |
| M2 | Add **first-session onboarding** as an explicit deliverable. Currently implicit and it is their number one churn cause. |
| M3 | Add **"the ladder is legible"** — always show the next permit tier and its distance. Elevate from a nice-to-have. |
| M3 | Decide on **gear/affix crafting**. Their most-praised system; our biggest gap. Scope it or consciously skip it. |
| M4 | Promote **moderation tooling** to non-negotiable, and reconsider public wealth display in the tavern. |
| M5 | Rule: **offline catch-up is never sold.** Monetise cosmetics and permit expediting only. |

## Caveats

- ~223 reviews is a small sample, and Steam reviews skew toward the engaged.
- Playtime values from the review API are in **minutes**; anything quoted in
  hours here has been converted.
- Pricing is reported by reviewers, not confirmed on the store page.
- One negative review (a VPN/region issue) is disputed by the developer.
- No revenue data is public. "82% positive" says people like it, not that it
  earns.

## Sources

- [Steam store page](https://store.steampowered.com/app/4453290/Idle_Hacking_An_Inaction_RPG/)
- [Steam community reviews, top rated](https://steamcommunity.com/app/4453290/reviews?browsefilter=toprated)
- Steam review API (`store.steampowered.com/appreviews/4453290`), recent and
  filtered passes, July 2026
