# Redesign: Deep Holdings as an incremental that works

> **Status: proposal, second draft.** No code has been changed.
>
> The first draft diagnosed the game correctly and then prescribed for the wrong
> genre — it moved Deep Holdings into the premium narrative column (Lifeline,
> Sunless Sea) on the strength of [`../research/reference-class.md`](../research/reference-class.md).
> The owner wants a **number-go-up incremental**. That is a legitimate and
> better-evidenced target: it is the column the Play audience is in, it is where
> CIFI took three consecutive category awards, and its content comes from
> systems rather than from a writer.
>
> This draft re-points the same diagnosis at that column. The finding gets
> *sharper*, not softer — and much less code gets deleted. The rejected
> narrative direction is recorded in §9 rather than erased.
>
> Fixed constraints, unchanged: **progression continues while the player is
> away**, and **the player is the handler, not the adventurer.** The 1983
> terminal frame and the bureaucratic joke remain available to cut.

## 1. The diagnosis, re-pointed

The first draft argued that a policy applied to homogeneous events yields one
optimum and therefore no decisions. That is true, and it is *also* true of every
successful game in this genre. Melvor is timers. CIFI is a tree. Kittens Game is
resources accumulating. None of them has moment-to-moment decisions either, and
all of them retain for hundreds of hours.

So the honest question is not "why is an incremental boring" — it is **why is
*this* incremental boring when those are not.** The answer is specific, and it
is measurable from the code:

> **Deep Holdings is a single pipe. Every incremental that survives is a
> lattice.**

One producer (the recruit) making one thing (gold), with a second currency
(pension) that is a slow function of the first. Every system built on top —
sites, case files, clauses, commendations, requisitions, licences — modifies the
rate of that one pipe. That is why the roadmap's own conclusion reads *"every
reward in this game lands on the same few numbers"*, and why three separate
attempts at a build decision each moved single digits. They were all multipliers
on the same pipe.

### The genre offers five decisions. We have about half of one.

| Decision the genre runs on | Exemplar | Deep Holdings |
| --- | --- | --- |
| **Allocation across parallel producers** | Kittens' jobs, Melvor's 29 skills, CIFI's trees | **none** — one recruit |
| **When to prestige** | the defining decision of the genre | exists as Form R-1, hidden behind a form, not the primary path |
| **What to unlock next** | NGU gates *features*; CIFI gates *systems* | 19 unlocks, all rate or capacity — the choice is arithmetic |
| **Which bottleneck to break** | Kittens' storage caps, moving constantly | gold, forever |
| **Build divergence** | Realm Grinder factions, NGU's reset layers | measured at single digits |

### The unlock catalogue is the proof

`progression-depth.md` finding 2 already stated the law — *"a rung is a new verb,
not a bigger permission"* — and then the catalogue violates it nineteen times
out of nineteen:

> Permits clear in 90 minutes instead of 180. New recruits start at Level 2.
> Successors inherit 120 gold. +2 gold per minute. Four more stacks. Pensions
> accrue 20% faster.

Every one is a rate or a capacity. Not one opens a screen, adds a resource, or
gives the player anything new to *do*. "What should I buy next" therefore has an
arithmetic answer — cheapest per unit of rate — which is why nineteen unlocks
produce no build and arrive as three lump sums.

Compare what the same research measured in the games that last: NGU gates
Augmentation, Challenges, ITOPOD and five Titans on boss number, each a new
screen with new verbs. CIFI gates Generators, Shards, Research Points, Academy
Points, Fleet, an arcade minigame, and Loop Mods with eleven categories.

### Prestige happens *to* you

The most important single fault, and the one most specific to us.

In every game in the sample the player chooses when to reset. Here the primary
prestige path is **the recruit dying**, which is a dice roll. The player does not
time it; it is done to them. Form R-1 exists and the simulation says it is a real
axis — daily retirement trades ~20% of income for **4.5×** the pension rate — but
it is one form among dozens rather than the spine of the game.

And the coupling has already caused the worst bug in the project's history: when
`maxHpForLevel` outran damage, recruits stopped dying, and because death was the
only pension source, **progression stopped entirely on day 14 and never
resumed**. A prestige loop that can be switched off by a balance error is not a
loop, it is a side effect.

### What this diagnosis does *not* say

It does not say the parts are bad. Two systems in this codebase are genuinely
genre-correct and the first draft wrongly listed both for deletion:

- **`staff.ts`** is an automation ladder where every hire takes a *standing
  instruction rather than a toggle* — "automation that removes the decision
  removes the game… what you are choosing moves up a level." That is exactly
  `genre-cues.md` finding 8, implemented well, plus the economy's only recurring
  sink in the wages.
- **`assignments.ts`** is Antimatter Dimensions challenges — replay content you
  have beaten with one rule changed, which is the best content-per-authored-line
  mechanic in the genre.

Both are the right shape. They are bolted to a single pipe, which is why neither
saved the game.

---

## 2. The fix, in one line

> **Stop selling multipliers on one producer. Build several producers, several
> chains, and make the player allocate between them.**

Everything below follows from that.

---

## 3. The five changes

### 3.1 A roster, not a recruit — *the big one*

Several recruits working in parallel, each with their own aptitudes, each
assignable to a site, a depth, and a task.

This is the single change that creates decisions without requiring a writer.
Allocation across parallel producers is the genre's core verb — Kittens' jobs,
Melvor's skills, CIFI's trees — and it is the one reward shape that **cannot be
collapsed into a multiplier on one career**, which is precisely why the
roadmap's own "concurrent postings" idea kept surfacing and kept being deferred.

It is also number-go-up in the most direct sense: roster size is a number, recruit
quality is a number, and both are things to buy.

Research support, all pointing the same way: Darkest Dungeon's roster of 20+ so
no single death cripples the campaign; Majesty's autonomous heroes directed by
bounties rather than orders; Tap Titans 2's hero roster. The handler premise gets
*stronger* — you are running a department, which is what `staff.ts` already says
the fiction is asking for.

### 3.2 Chains that feed chains

Today: **delve → gold.** One pipe, and the market is a place to convert the pipe's
output into the same number.

Instead, a lattice — raw material from the deep feeds refining, refining feeds
equipment, equipment feeds deeper delving, depth feeds rarer material. Each link
has its own number, its own upgrade path, and its own bottleneck.

This is where "months of content" actually comes from, and it is *systems* work
rather than writing — the answer to the content-cliff risk that has haunted the
project since `longrun` said the last new thing happens on day 39.

Kittens Game's specific lesson is worth taking literally: **storage caps that
gate goals**. Repeatedly being unable to afford something because you cannot
*hold* enough converts waiting into planning, which is a decision. `cabinet`
already exists as a capacity concept; it should bind on more than one thing.

### 3.3 Prestige becomes the loop, and the player times it

Promote Form R-1 from a form to **the** progression path.

- Retiring a recruit is the deliberate act that banks meta-currency.
- **Death becomes a failure mode of pushing too hard**, not the payout
  mechanism. Dying should cost you the timing you were waiting for, which makes
  depth a genuine risk instead of the only route to progress.
- The genre's most-cited onboarding failure — *"it is never obvious when or why
  to prestige"* — gets answered explicitly in the first session, because it is
  now the thing the game is about.

**And you choose what carries over.** Sunless Sea's Legacy system offers five
inheritances at a captain's death — the Correspondent hands over the entire
discovered chart. That is a prestige *decision* rather than a payout, it is the
genre's standard build-divergence mechanic (cf. Realm Grinder's factions), and it
is the cheapest available source of the build variety the game has never had.

### 3.4 Unlocks must be verbs

Retire the nineteen rate multipliers, or demote them to a cheap background tier
that is bought without thinking. The meta-currency should buy **new systems**:

- a second recruit slot, then a third
- a new chain in the lattice
- a new site with its own rules
- a piece of automation from the `staff.ts` ladder
- a challenge from the `assignments.ts` catalogue

The test, borrowed from the project's own `tuning.ts` comment about permit D-5 —
*"a milestone that is legibly worth nothing… worse than no milestone, because
the player did the work of noticing it"* — becomes a rule: **if a rung cannot be
described without the words "faster", "more" or "cheaper", it is not a rung.**

### 3.5 Mastery, not a casebook

The first draft's best idea was that knowledge should be the meta-progression.
The genre already has that idea and it is a number: **Melvor's Mastery.** Every
action grants Mastery XP toward that specific activity, plus a pool that
accelerates the rest of the skill, with thresholds that unlock capability.

So: per-site and per-activity mastery that accrues with use, survives the
recruit, and unlocks *options* at thresholds rather than just rates. It is
number-go-up, it is genre-native, it gives the officer something that is
theirs rather than the recruit's, and it does the job the pension was failing to
do. Melvor rebuilt its Mastery system entirely after launch because the first
version's sense of progression was sub-par — worth knowing that this specific
system is hard to get right and survivable to redo.

---

## 4. What this means for the numbers

`genre-cues.md` finding 6 and product goal 8 say **numbers stay human, never
ship scientific notation**, and `mobile-incrementals.md` already flagged that as
a *bet* rather than a principle, because the category winner's store page leads
with "watching the numbers climb higher."

If the target is a number-go-up incremental, that bet should be relaxed. A
lattice of interacting chains produces large numbers as a matter of arithmetic,
and refusing them means capping the lattice. This does not require scientific
notation on day one — but "gold in the hundreds" cannot survive §3.2 and should
not be defended.

## 5. What survives in the codebase

Far more than the first draft claimed. This is a redesign of the progression
spine, not a rewrite.

**Kept, and now load-bearing:** the lazy resolution architecture and tick
watermark; deterministic seeding; storage ports, adapters, migrations, auth,
rate limiting, idempotency, errors, heartbeat, health; the simulation harness
(`simulate`, `longrun`, `forecast`), which is the single most valuable asset here
and needs only new questions; **`staff.ts`** as the automation ladder;
**`assignments.ts`** as the challenge catalogue; items, the market and
requisitions as the beginnings of the lattice; the client application and
Capacitor wrapper.

**Cut or rebuilt:**

| Area | Disposition |
| --- | --- |
| The 19 pension unlocks | rebuilt as verbs (§3.4); rate tiers demoted |
| Permits / grade as depth gates | cut — eight rungs saying the same sentence |
| Death as the prestige trigger | cut; R-1 promoted (§3.3) |
| `resolve.ts` rules | rebuilt for a roster; structure kept |
| Case files, clauses, commendations, licences, filings, clearance | cut or folded into mastery and the lattice |
| The bureaucratic frame and the 1983 terminal | re-skinned — the owner's call, and orthogonal to everything above |

Rough scale: **4–6k lines**, against the 12–14k the first draft proposed. The
difference is entirely because the previous draft was leaving the genre.

## 6. How we would know it is working

The existing measurement culture ports directly; the questions change.

- **Allocation spread.** With N recruits and M assignments, do simulated players
  who allocate differently end the week materially apart? Same test as the first
  draft's divergence check, aimed at the mechanic that replaces it. **If
  allocation converges to one best assignment, §3.1 has failed and the rest is
  decoration.**
- **Prestige timing spread.** Sweep retirement cadence the way the retreat
  slider was swept. A healthy curve has no dominant point and no dead region —
  the retreat slider had twenty dead positions out of seventy-five and that is
  the failure to avoid repeating.
- **Bottleneck rotation.** Which resource is binding, sampled over a career. If
  it is gold for 90% of the run, §3.2 has not landed.
- **Novelty, retargeted.** Keep `longrun`, but count *new verbs* — systems
  opened, chains unlocked, automation acquired — rather than unlocks bought.
  Today's answer is "the last new thing happens on day 39"; the target is a rung
  every session.

## 7. Risks

- **A lattice is a balance problem of a different order.** One pipe is easy to
  measure and impossible to make interesting; six interacting chains are the
  reverse. The harness exists, which is the only reason this is tractable.
- **Roster management can become a chore rather than a decision.** Darkest
  Dungeon's roster works because the estate is deep; ours must not become twenty
  identical recruits needing twenty identical clicks. The `staff.ts` principle —
  delegate *with instructions* — is the defence, and it should be designed in
  from the start rather than sold as an unlock.
- **Content is now systems, which is good, until it is not.** Tap Titans 2's
  answer to the same problem is other players — clans, raids, technologies —
  and `progression-depth.md` finding 4 independently concluded *"other players
  are the cheapest content"*. That is the fallback if the lattice runs dry, and
  it is a later milestone, not a launch feature.
- **The number bet (§4) is unresolved** and the design cannot be finished
  without an answer.

## 8. Build order

- **Stage 0 — prove the roster, headless.** Three recruits, two sites, one extra
  chain, no UI. Run the allocation-spread test. **If allocation converges, stop**
  — the thesis is wrong and it cost a week.
- **Stage 1 — the lattice.** Two or three interlocking chains with real
  bottlenecks, and storage caps that bind.
- **Stage 2 — prestige.** R-1 promoted to the loop, legacy choice at retirement,
  death decoupled from payout.
- **Stage 3 — verbs.** The unlock catalogue rebuilt as systems, wired to
  `staff.ts` and `assignments.ts`.
- **Stage 4 — mastery.** Per-site progression that survives the recruit.
- **Stage 5 — surface.** New frame, mobile, push. Keep Lifeline's lesson: the
  notification should carry a *decision* — "Fourth recruit idle, reassign?",
  "Grimwald is ready to retire" — answerable from the lock screen. It reported
  81% day-one retention on exactly that.

## 9. The rejected direction, recorded

The first draft proposed situations, doctrine and a casebook — an
async-correspondence game in the shape of Lifeline and Sunless Sea. It is not
being built, and the reason is a product decision rather than a design flaw:
that is the premium-narrative column, and the owner wants the incremental one.

Three of its findings survive the move and are folded in above: **legacy choice
at prestige** (§3.3), **knowledge as progression, in the genre's own idiom**
(§3.5), and **the notification carries the decision** (§8). The full argument and
the research behind it are in
[`../research/reference-class.md`](../research/reference-class.md), whose Part 3
frames the choice between the two columns; this document takes the incremental
side of it.

## 10. Open questions

1. **How big may the numbers get?** (§4) Blocks the lattice's scale.
2. **How many recruits, and how are they directed?** Doctrine-style standing
   instructions (the `staff.ts` model) or Majesty-style bounties where autonomous
   people take the work that pays? The second is more interesting and less
   proven.
3. **Does the bureaucratic frame stay?** Orthogonal to every system above. It was
   named as something you dislike, and `staff.ts` shows the fiction and the
   automation ladder can agree — "you start doing your own filing and end up
   running a department" is a genuinely good line for a roster game.
