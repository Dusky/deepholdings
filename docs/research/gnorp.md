# Competitive read: (the) Gnorp Apologue

> Added because the owner proposed making the thing you mine a single **orb** at
> the centre of the screen. Gnorp is the shipped proof that this works, and its
> developer interview contains the clearest statement anywhere of the exact
> problem `redesign.md` diagnoses.

## What it is

You have a rock. Little creatures called gnorps hit it. Shards fly off, land in
a pile, get collected. That is the whole premise, and the game is widely loved
for it — the Game Developer piece is titled *"You have to hit the rock."*

Roughly **8–10 hours to complete**, "much more incremental than idle", and
individually simulated: 2,000 gnorps and 20,000 shards are all drawn on screen
at once.

## The finding that matters most

Creator Myco, on why units are simulated individually rather than held as a
number:

> "With individually simulated units, it allows you to create interesting
> upgrades **beyond a simple percentage increase to their output**."

That is our diagnosis in one sentence, from someone who shipped the fix. When a
unit is a number, the only thing an upgrade can do to it is scale it — which is
precisely why nineteen unlocks in this codebase are all rates and capacities,
and why three attempts at a build decision each moved single digits.

And the unit types are genuinely different machines rather than stat variants:
**Bombers** fly above the rock and slam into it; **Mountaineers** wait until the
shard pile is high enough, climb it, and stomp shards toward the stash;
**Riflegnorps** shoot the rock from a building. Different behaviours, different
buildings, different upgrade surfaces.

## Steal 1 — their test for a meaningful upgrade

Myco's stated blueprint. Every upgrade must:

1. **change unit behaviour fundamentally**
2. **remain optional rather than mandatory**
3. **work synergistically with the talent system**

This is a better-stated version of §3.4's rule and it should replace it.
"Optional rather than mandatory" is the part we did not have — an upgrade that
every player must buy is a tax with a purchase button, which describes most of
our nineteen.

## Steal 2 — the rock reclaims

From the second tier onward, **the rock absorbs shards back into itself**, at a
rate proportional to the highest point of your pile, scaling exponentially.

This is the best single mechanic in the game for our purposes. It is a
**bottleneck that moves and punishes hoarding**: output you have not processed
is output you are losing, faster the more of it there is. Deep Holdings has one
bottleneck (gold) for an entire career; this is a second one that arrives on its
own schedule and cannot be solved by accumulating.

## Steal 3 — monochrome, and colour is the progression

> "a mostly monochromatic colour scheme so that players would feel they were
> bringing colour into the world as they progressed"

A progression signal that costs **nothing** and requires no artist, which is the
binding constraint on this project. It also sits perfectly on a two-ink palette:
the orb starts dead and gains colour as it is worked.

## Steal 4 — let the player's inference do the art

They tried animating gnorp legs, and:

> "it looked horrific and I quickly deleted the code"

Instead they let players imagine the locomotion. For a project with no artist
this is the whole methodology: draw the minimum that reads, and let inference
finish it. *"Simple visuals that become more than the sum of their parts thanks
to the ridiculous number of things being drawn on screen at once."*

## Steal 5 — scale power with the thing that *is* the game

Their multiplier grows with **gnorp quantity**, not with upgrades purchased —
chosen deliberately because scaling with purchases "encouraged completionist
burnout". Simple, predictable, and it makes the core object the core number.

For us that means power should scale with **roster size**, not with how many
catalogue entries you have bought.

## The warning

The consistent criticism is the **endgame**: it "transitions from active
management to long-term idling" and "gets tedious near the end due to how slow
progression gets". Eight to ten hours, finished inside a week.

So a compelling central object is not by itself a long game. Gnorp has one rock
and one ladder; it is excellent and it is short. **That is exactly the gap
§3.6's ladder exists to fill**, and it is evidence for building the ladder
rather than assuming a good centrepiece carries a hundred hours.

## The caveat we must not gloss

Gnorp is a **local, single-player, real-time** game. Deep Holdings is
**server-authoritative with lazy resolution** — nothing runs per player between
requests, and the server replays missed ticks in a transaction. We cannot
simulate two thousand recruits per account on the server.

The split that keeps both: **the server stays aggregate and deterministic; the
client renders a crowd from the aggregate numbers.** Two thousand particles
drawn from one resolved figure is a rendering problem, not a simulation one, and
it is entirely compatible with `tickSeed` — the same span produces the same
picture. What we must not promise is per-unit server simulation.

## Sources

- [You have to hit the rock: How (the) Gnorp Apologue uses minimal design to maximum effect — Game Developer](https://www.gamedeveloper.com/design/interview-the-gnorp-apologue)
- [Gnorp Apologue Wiki — Mechanics](https://gnorp.wiki.gg/wiki/Mechanics), [Gnorp types](https://gnorp.wiki.gg/wiki/Gnorp)
- [Higher Plain Games review](https://higherplaingames.com/pc/the-gnorp-apologue-review/), [The Refined Geek](https://therefinedgeek.com.au/index.php/2024/02/08/the-gnorp-apologue/), [Backloggd reviews](https://backloggd.com/reviews/everyone/eternity/recent:asc/the-gnorp-apologue)
- [incrementaldb entry](https://www.incrementaldb.com/game/the-gnorp-apologue)
