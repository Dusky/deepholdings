# Progression depth: why these games survive past the point ours stops

## Why this note exists

`longrun` measures the game running out. Median day **32.6** for the last new
thing, then **57.4 of the remaining 90 days have nothing new in them**. That is
the largest measured problem in the project and it has never had a research note
aimed at it.

The three existing notes each glanced at this and moved on.
`mobile-incrementals.md` filed "stacked prestige layers" as a single bullet under
*What is worth stealing*, next to the observation that we had one prestige axis
and no second layer designed. `idle-hacking.md` gave the closest competitor's
most-praised system — crafting, which it called "our biggest gap" — one table row
reading *"Scope it or consciously skip it."* The research located the fix for the
biggest problem in the game and spent forty words on it.

This note is the version that should have been written, and it exists because the
question "why floor 12, shouldn't we go to 100?" deserves an answer grounded in
what actually keeps these games alive.

## First, the units, because they nearly made this note wrong

Every hour figure quoted for NGU, Melvor and Idle Hacking is **active playtime**.
Our day 32.6 is **elapsed calendar time** in a game that asks for two check-ins a
day. Comparing them directly is a category error, and it flatters us.

Converted to the same axis:

| | Novelty runway | Basis |
| --- | --- | --- |
| Deep Holdings | **~33 days** | `longrun`, median day of last new thing |
| Melvor Idle | ~190 days at 2h/day | 384h median to content completion |
| NGU Idle | "over a year" | publisher's own claim, corroborated by an 8-chapter guide |
| Idle Hacking | 20–60 days at 2h/day | the 40–120h wall in `idle-hacking.md` |

The kinder reading is that we have roughly a sixth of Melvor's runway. The
harsher one: at two short check-ins a day, day 32.6 is about **65 sessions** —
call it four or five hours of a player's actual attention before the game stops
producing anything they have not seen. That is the number to be alarmed by.

## Finding 1 — none of them lengthen the number axis

This is the direct answer to "shouldn't we go to 100?". Not one of these games
solves longevity by extending its primary scale. They solve it by **adding
systems**.

- **Melvor Idle** ships **29 skills** — 9 combat, 20 non-combat — and reports a
  384h median to completion, ~1,500h to 100%. Its depth is *breadth*: mining
  feeds smithing feeds combat. No single number goes to 100.
- **NGU Idle** gates discrete features on boss number, not on a depth stat:
  Augmentation at Boss 17, Challenges and ITOPOD around Boss 58, then Titans at
  66, 82, 100, 116, 132. Each is a **new screen with new verbs**, not a deeper
  floor. On top of that sit named reset layers — Evil, Sadistic — each opening a
  chapter's worth of content.
- **CIFI** gates systems behind ships. Generators, Shards, Research Points,
  Academy Points, Fleet, the Arcade minigame and Loop Mods arrive as separate
  mechanics. Loop Mods alone has **11 categories** of modifier. Its prestige
  requirement scales gently — base 3 loops, +0.95 per reset — and its own
  beginner guide tells players the first reset should take **4–8 hours** and to
  stop rushing them.

The pattern is consistent: the number gets bigger *as a side effect* of new
systems arriving. Nobody's retention comes from the number.

## Finding 2 — a rung is a new verb, not a bigger permission

Our permit ladder has 8 rungs and each says the same sentence: *you may now work
one or two floors deeper*. `tuning.ts` already records what happens when a rung
says nothing new — D-5 once granted the same depth as D-4, and the comment calls
it "a milestone that is legibly worth nothing… worse than no milestone, because
the player did the work of noticing it."

Extending depth to 100 multiplies that failure by eight. Ninety-nine rungs, each
authorising one more floor of the same corridor, is the disconnected motor the
codebase already warns about — just longer.

Worse, depth is not even the binding constraint. `authorisedDepth` clamps to the
tightest of target, permit, **recruit level** and site bottom, and level resets on
death. Floors past ~12 would be unreachable for most of a career regardless of
what `MAX_DEPTH` says.

## Finding 3 — the crafting gap, measured

This is where the previous note's one line cost us most. The systems side by
side:

| | Idle Hacking | Deep Holdings |
| --- | --- | --- |
| Affixes / clauses | **100+** | **20** (11 endorsements, 9 riders) |
| Stats affected | "dozens" | **3** (vigour, survival, loot value) |
| Crafting verbs | **6** | **2** |
| Verb list | Augment, Prune, Reroll, Version Upgrade, Compile, Lock Affix | Form 12-C (reroll one clause), Form 19 (move one clause) |
| Budget mechanic | **Stability** — a finite pool of attempts per item | none |
| Build enablers | Signature Affixes with unique mechanics | none |
| Escape hatch | player market ("if you don't like crafting, use the market") | none |

Three things fall out of that table.

**Our reserved forms already map onto their verbs.** The Armoury tells players
that Forms 7-A, 3-B, N-1 and 44 — appraisal, amendment, notarisation, provenance
settlement — "are not yet released to your desk." Against Idle Hacking's list
those read almost exactly as Augment, Prune, Lock and Compile. The design
anticipated this; it was never finished.

**Stability is the idea we do not have.** A per-item budget of crafting attempts
is what turns rerolling from a slot machine into a decision — you are spending a
finite thing, so *when to stop* becomes the interesting question. Our Form 12-C
gambles a fee with no budget, which is the shallower version of the same idea.

**Twenty clauses over three stats cannot support a build.** Idle Hacking's
players are praised-by-reviewers for "experimenting with odd combinations that
become viable once the right item appears". That requires enough affixes that
combinations are not enumerable. Twenty is enumerable in an afternoon. The
ROADMAP already carries "clause pool 20→40" as an unscheduled concern; the
evidence says 40 is still low.

## Finding 4 — other players are the cheapest content

Idle Hacking's own community guide says, of its deepest system: *"If you don't
like crafting → use the market. Seriously."* A player economy converts every
other player's spare time into your content, and it costs the developer nothing
per hour of engagement.

We have a shared world already — guild objectives, the tavern, the public death
feed — and none of it is an economy. Nothing changes hands between officers. This
is the one place where a modest amount of work buys effectively unbounded
novelty, and it is closer to shipped than any of the alternatives, because the
shared-world plumbing exists.

It also cuts against `monetization.md`'s line on wealth display, so it is not
free — a market implies visible prices, and that document deliberately refused a
public wealth display. That tension needs deciding rather than ignoring.

## What this says about Floor 100

Raising `MAX_DEPTH` alone buys close to nothing, and several formulas break
before it gets there: encounter chance is `0.24 + depth × 0.012`, which saturates
at 1.0 around Floor 63, and `seniority(level) = level − MAX_DEPTH` would be
deleted outright by a cap of 100.

But depth is not worthless — it is the **carrier** for permits, which are the
game's arrival mechanism. The useful version is bands: extend depth in blocks of
roughly ten, where each block introduces a mechanic rather than a multiplier, and
where the permit granting entry to a band is a rung that means something. Forty
floors in four bands is worth more than a hundred floors of the same corridor.

## Recommendations, in order of value per unit of work

1. **Finish the crafting verbs.** Release 7-A, 3-B, N-1 and 44 as Augment, Prune,
   Lock and Compile; add a Stability budget per case file. This is the
   highest-value item because the fiction, the naming and the UI slot all exist —
   it is the closest thing to shipped content the project has.
2. **Widen the clause pool past 40 and past three stats.** Builds need
   combinations that cannot be enumerated. This is content work, not systems
   work, and can be done incrementally.
3. **Depth in bands, not a bigger cap.** Four bands of ten, each with a mechanic
   and a permit that means something. Fix the level gate first — it binds before
   the permit does for most of a career.
4. **Decide on a player market.** Highest novelty per unit of work of anything
   here, and the only item that scales without further authoring. Requires
   resolving the wealth-display line in `monetization.md`.
5. **Change what `longrun` reports.** It currently answers "on which day does the
   last new thing happen", which is why this problem read as distant. It should
   report **new things per session**, because that is the unit the player
   experiences and it would have surfaced the four-hour figure years earlier.

## What I could not get

Stated plainly, as `mobile-incrementals.md` started doing and this note
continues:

- **No per-item numbers for CIFI's Loop Mods.** The wiki index lists 11
  categories but the individual mod pages hold the costs, and I did not walk
  them. The scaling claim (+0.95 loops per reset) is from the beginner guide, not
  from the mod tables.
- **NGU's reset layers are named, not measured.** The chapter list gives Evil and
  Sadistic as phases; the Fandom wiki page that would have given exact unlock
  conditions returns HTTP 402 to automated fetch.
- **Idle Hacking's Stability numbers are not public.** The community guide calls
  it "your limited attempts" and confirms Compile consumes all of it, but no
  costs or failure rates are documented anywhere reachable.
- **Grokipedia's page on Idle Hacking 403s to automated fetch**, as
  incrementaldb did for the previous note.
- **Still no direct player sentiment for CIFI or ISEPS.** Unchanged from
  `mobile-incrementals.md`; r/incremental_games remains the only place it exists
  and remains unreachable from here.
- **Nobody here has played any of these games.** Every claim above is a read of
  documentation and reviews, not of play.

## Sources

- [Melvor Idle wiki: Skills](https://wiki.melvoridle.com/w/Skills)
- [Melvor Idle wiki: Beginners Guide](https://wiki.melvoridle.com/w/Beginners_Guide)
- [How long to beat Melvor Idle](https://truesteamachievements.com/game/Melvor-Idle/completiontime)
- [NGU Idle Guide (sayolove)](https://sayolove.github.io/ngu-guide/en/intro/)
- [NGU Idle wiki: New Player Guide](https://ngu-idle.fandom.com/wiki/New_Player_Guide_(Truth)) *(402 to automated fetch; unlock gates taken from search results)*
- [CIFI wiki: Beginners Guide](https://cifi.game-vault.net/wiki/Guide:Beginners_Guide)
- [CIFI wiki: Loop Mods](https://cifi.game-vault.net/wiki/Loop_Mods)
- [CIFI wiki: Loop Modifications](https://cifi.fandom.com/wiki/Loop_Modifications)
- [Idle Hacking — The Actually Useful Guide (Steam)](https://steamcommunity.com/sharedfiles/filedetails/?id=3698584572)
- [Idle Hacking on Steam](https://store.steampowered.com/app/4453290/Idle_Hacking_An_Inaction_RPG/)
- [MacGaming: Idle Hacking buildcrafting](https://www.macgaming.com/news/idle-hacking-an-inaction-rpg-for-mac-buildcrafting-syndicates-and-boss-events-in-a-truly-hands-off-mmo)
- [Wikipedia: Incremental game](https://en.wikipedia.org/wiki/Incremental_game)
