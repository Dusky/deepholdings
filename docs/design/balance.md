# Balance: what the numbers do, and how we know

Every tuning number in this game started as a guess by someone who had never
played it. This document records what the simulation measured, what was wrong,
and what the numbers mean now.

Run it yourself:

```bash
npm run simulate --workspace @deepholdings/server -- --days 7 --runs 150
```

The harness (`packages/server/tools/simulate.ts`) drives the **real resolver**,
not a model of it, over six standing-order profiles for a simulated week.

## Where it started

The first run said something unambiguous: **depth was a trap.**

| profile | deaths/wk | gold/h | floor | lvl |
| --- | --- | --- | --- | --- |
| timid (F2, retreat 60%) | 0.0 | 98 | 2 | 12 |
| balanced (F6, retreat 30%) | 0.2 | 193 | 6 | 14 |
| greedy (F9, retreat 20%) | 34.1 | 23 | 9 | 1 |
| reckless (F12, retreat 5%) | 30.1 | 18 | 12 | 1 |

Aggressive play earned a quarter of what timid play earned and died thirty
times a week. Nobody would ever go deep. Four causes, all structural:

1. **Death was a wipe.** A new recruit started at Grade I with Permit D-1 and
   had to re-climb everything, so a single death cost hours. Frequent deaths
   compounded into a spiral: die, come back weaker, die faster.
2. **Rewards were linear in depth, danger was too.** There was no reason to
   accept more risk.
3. **Target Depth was read as an instruction to walk to Floor 12 immediately**,
   which killed fresh recruits on arrival.
4. **Waiting on a permit was dead time** — the recruit stood still for an hour.

## What changed

- **Target Depth is an aspiration, not an order.** `authorisedDepth()` clamps
  the recruit to the shallower of their permit, their grade, and the officer's
  wish. You set 12 and they work up to it.
- **Reward scales superlinearly with depth** (`depth^1.5`), damage a little
  under it (`depth^1.4`), and deep floors are busier. Depth is now where the
  money is.
- **Death is a setback, not a wipe.** A successor inherits two-thirds of the
  grade and all but one permit tier — "permits are issued against the case
  file, not the recruit".
- **A hit is capped** at 35% of maximum, so a healthy recruit is never
  one-shot, with a rare **grievous** hit (3%, up to 60%) so that death remains
  possible at any retreat threshold. Without that tail, any threshold above the
  cap made a recruit arithmetically immortal and hid the prestige loop from
  anyone who never moved the slider.
- **Waiting on a permit still delves** at the cleared floor.
- **Pensions accrue with service, not with dying.** See below.
- **Loot Priority does something** (`LOOT_EFFECT`): gold is the safe yield,
  knowledge trades coin for grade, relics are a gamble (rarer, worth double),
  gear splits the difference.

### The pension bug worth remembering

Paying the pension out on final state (`gold × 1.4 + depth × 60`) made **dying
profitable**. A reckless officer farming short deaths banked 571 pension/hour;
a careful one banked nothing. The meta-currency rewarded the thing it was meant
to make costly.

Pensions now accrue with **service** — `serviceTicks × 0.06 × (1 + depth ×
0.3) + gold × 0.4`. A recruit who lived forty minutes is worth almost nothing;
a long career on deep floors is worth a great deal. Death-farming collapsed
from 571/h to 70/h, below what a living recruit earns in gold.

## Where it landed

| profile | deaths/wk | gold/h | pension/h | floor | lvl |
| --- | --- | --- | --- | --- | --- |
| timid (F2, retreat 60%) | 0.0 | 106 | 0 | 2 | 10 |
| cautious (F4, retreat 45%) | 0.0 | 198 | 0 | 4 | 13 |
| **balanced (F6, retreat 30%)** | **2.5** | **265** | **23** | **6** | **13** |
| greedy (F9, retreat 20%) | 16.6 | 145 | 66 | 5 | 3 |
| reckless (F12, retreat 5%) | 139.8 | 120 | 70 | 2 | 2 |
| insured (F6, retreat 30%, insure) | 2.4 | 223 | 19 | 6 | 13 |

What that says:

- **Depth pays.** 106 → 198 → 265 gold/hour as target depth rises.
- **Balanced loses a recruit about every three days**, which is the prestige
  cadence the design wants: often enough to matter, rare enough to hurt.
- **Retreat threshold is the death dial.** 60% never dies; 30% occasionally;
  20% often; 5% constantly. One slider, legible consequence.
- **Insure is a real trade** — less gold to premiums, more pension per death.
- **Reckless is properly bad.** A standing order that says "never retreat"
  should be a bad standing order.

## Permit processing: why it is measured in hours

Permits originally cleared in 30 ticks. That reads fine on paper and is
invisible in practice: a player who checks in twice a day never *sees* a permit
being processed, because any catch-up longer than half an hour resolves past
the whole wait. The stall happened, silently, somewhere in the middle of a log
they skim.

Processing now takes 180 ticks (three hours), and the simulation says it costs
almost nothing: balanced play went from 265 to 264 gold/hour, because a stalled
recruit keeps working the floor they are already cleared for. What it buys is a
real *come back later* beat — something the Terminal can show you the ETA of,
and the only kind of event a local notification can announce without a push
server.

The general rule this suggests: **a wait shorter than a check-in gap is not a
wait, it is a rounding error.**

## Loot as inventory: an agency layer, not a nerf

Value used to arrive as coin. It now arrives as items, in a filing cabinet
capped at twelve stacks, and the officer decides when to sell.

The first simulation after that change showed gold/hour collapsing from 265 to
4, which looked catastrophic and was two separate faults. The supply loop was
unfunded — a recruit could starve to death beside a cabinet worth three hundred
gold — and the metric only counted coins, so a full cabinet read as poverty.
Fixed by having the quartermaster buy the cheapest stack to cover resupply, and
by measuring portfolio value rather than purse. Balanced play came back at 253,
then 255 once stacks re-appraise on the weighted average instead of freezing at
the first unit's price. Against 265 pre-inventory, that is a rounding error: the
cabinet adds a decision without moving the income curve.

Nothing a player earned is ever destroyed. At capacity the item is liquidated at
depot rates instead of being dropped, because "your loot was deleted while you
were at work" is the kind of thing an idle player quits over.

## The market is a demand index, not a price list

MARKET used to quote absolute prices for four fixed goods — "Sword, Adequate
(+2), 340g" — while the cabinet appraised the same sword at 23g. Two numbers for
one item on one screen, and the honest reading of that is that the game is
cheating you.

It now publishes a multiplier per loot category, drifting each world heartbeat
inside a band of 0.8x–1.2x, and that multiplier is what the depot pays. The
band is centred on par deliberately: an officer who never looks at the market
averages exactly book value. Timing a sale is an option worth up to ~40% on a
cabinet, and never a tax on someone who doesn't want to play that game.

This is also the first real argument for `hoard`. Holding inventory to sell into
a spike is a reason to hold inventory.

## Form R-1: retiring on purpose

Until now the only way to bank a pension was to write standing orders you knew
would kill somebody. That is a miserable thing to make the intended progression
path, and it is the genre complaint that "it is never obvious when or why to
prestige" in its purest form.

Form R-1 retires the current recruit and pays exactly what death would — same
service accrual, same depth factor, same estate. It is not a bonus. The
difference is *who chose the moment*.

The obvious worry was that retiring at the legal minimum would become the only
correct play. It does not:

| profile | value/h | pens/h | floor | lvl | stalled% |
| --- | --- | --- | --- | --- | --- |
| balanced (never retires) | 255 | 19 | 6 | 13 | 4 |
| churner (retires at the 2h minimum) | 86 | 49 | 2 | 1 | 49 |
| retirer (retires every 24h) | 206 | 87 | 6 | 5 | 7 |

Churning is a trap, and legibly so: a recruit reset every two hours never gets
deep, never grades up, and spends half their working life re-applying for
permits they keep surrendering. Both income *and* pension rate are worse than
retiring on a daily cycle.

The daily retirer is the interesting one — it trades about 20% of income for
four and a half times the pension rate. That is a genuine strategic axis rather
than a dominant line, and it is the first thing in the game that rewards an
officer for paying attention to *when* rather than *how deep*.

## Requisitions: what happens when gold finally buys something

The retirement finding above ended with an instruction — *re-run this with a
requisition-buying profile before tuning anything, the fix may be a sink rather
than a nerf.* Requisitions are built now, so here is that run.

Two profiles were added. Both play the balanced orders; `equipper` never
retires, `retirer+eq` retires daily. Both **sell the cabinet on every visit and
spend what it realises**, because gold is realised at the Ledger and an officer
who never clears the cabinet has no coin to requisition with.

That last detail was the first result, and it was not the one being looked for.
The initial run had the equipper buying **one** rung in a week and the retiring
equipper buying **none** — not because the prices were wrong, but because the
harness modelled an officer who never sells. Value accrues as items; the purse
stays near empty; a sink priced in coin is invisible to someone holding stock.
The harness was wrong, not the catalogue.

With selling modelled:

| profile | value/h | pens/h | equip | floor | lvl |
| --- | --- | --- | --- | --- | --- |
| balanced (never retires, never sells) | 253 | 21 | 0 | 6 | 13 |
| retirer (retires daily) | 206 | 87 | 0 | 6 | 5 |
| **equipper (never retires, buys)** | **264** | **11** | **7/7** | **6** | **13** |
| **retirer+eq (retires daily, buys)** | **206** | **76** | **4/7** | **6** | **5** |

The sink bites, and it bites the thing it was supposed to: a daily retirer's
pension rate falls from 87 to 76 once gold has somewhere else to go, and a
never-retirer's falls from 21 to 11. More usefully, **the two strategies now
buy different things.** Not retiring buys the complete office. Retiring buys
pension and about half an office. That is a trade an officer can have an
opinion about, which is more than "retire daily or fall behind" ever was.

`value/h` goes *up* slightly for the equipper — 253 to 264 — because an officer
who clears the cabinet never hits capacity, and a cabinet at capacity liquidates
at depot rates. Selling on a schedule is worth about 4%.

### The first prices were a third of what shipped

The catalogue started at 11,000 gold total and **both** buying profiles cleared
all seven rungs inside a week. A sink that empties is a purchase, not a
decision. Upper rungs roughly tripled — the catalogue is 26,700 now, with first
rungs untouched at 600–900 so the system still teaches itself in the first
evening.

The honest limit: the equipper still clears all seven in a week. Seven rungs is
a short catalogue, and inflating seven items until a week cannot clear them
would price conveniences absurdly. The four designed-but-unbuilt entries in
[`requisitions.md`](requisitions.md) are what extend it, not bigger numbers.

## Flavour must not spend the simulation's entropy

The content pass — generated encounter names, more journal copy — moved the
balance table by a third. Balanced play went from 2.6 deaths a week to 1.9
without a single tuning number changing.

The cause is worth writing down because it is invisible and it will happen
again. Every tick seeds one rng, and the resolver drew from it in order:
encounter check, creature name, grievous check, damage. Generating a name
instead of picking one consumed three or four values instead of one, so the
grievous check and the damage roll read *different positions in the stream*.
Combat outcomes moved because a writer added a form number to a sentence.

Prose now draws from its own stream — `tickSeed(id, tick, 'prose')` — so text
generation cannot reach the simulation. This restores the promise the flavour
file has always made in its header, that writers can work there without
touching the rules, which was not true for as long as the file has existed.

**The general rule: anything that only produces words gets its own rng.** If a
change to copy can move a number, the number was never measuring what you
thought.

## Where it landed after the content pass

Separating the streams re-seeded the mechanical draws, so these numbers are not
directly comparable to the table above — but the difference that survives at
600 runs is real and has a cause:

| profile | deaths/wk | h/death | value/h | pens/h | floor | lvl |
| --- | --- | --- | --- | --- | --- | --- |
| timid | 0.0 | never | 109 | 0 | 2 | 10 |
| cautious | 0.0 | never | 193 | 0 | 4 | 13 |
| **balanced** | **2.0** | **85.6** | **269** | **12** | **6** | **13** |
| greedy | 16.6 | 10.1 | 144 | 66 | 5 | 3 |
| reckless | 140.0 | 1.2 | 122 | 71 | 2 | 2 |
| insured | 2.2 | 77.8 | 251 | 20 | 6 | 13 |
| retirer | 4.3 | 39.0 | 208 | 87 | 6 | 5 |
| equipper | 2.0 | 85.6 | 270 | 6 | 6 | 13 |
| retirer+eq | 4.3 | 39.0 | 207 | 75 | 6 | 5 |

Balanced play gained about 6% income and lost about a fifth of its deaths, and
the reason is the loot catalogue rather than the rng. Six loot names per depth
band instead of three means the twelve-slot cabinet holds a wider spread before
it fills, so less is liquidated at depot rates and the quartermaster has more
stock to sell against starvation.

That is a mild buff delivered by writing prose, which sounds like exactly the
mistake described above — but it is not the same fault. It is a real mechanical
consequence of a real mechanical quantity (how many distinct stacks exist), and
the curve it produces is better than the old one: capacity pressure now arrives
when an officer works two bands at once, around Floor 7, instead of pressing
constantly from Floor 1.

**Estimator noise:** `deaths/wk` is a rare-event count and moves ±0.2 between
150-run and 600-run batches. Do not read a tenth of a death as a signal. The
income columns are stable to within a point or two at 150 runs.

## Known imperfections

- **Greedy is still not clearly worth it.** It trades gold for pension, but the
  deaths cost enough grade that it never reaches its target depth. It is a
  different strategy rather than a dominated one, but "push deep and accept
  losses" should probably pay better than it does.
- **Loot Priority is thin** until crafting lands. `LOOT_EFFECT` makes it a real
  choice, but the interesting version is clause pools (see `crafting.md`).
- **Spend Policy's `hoard` is better but still unproven.** The sale bonus and
  market timing give it a case; no simulation yet measures an officer who
  actually *times* sales, because the harness sells on a fixed schedule.
- **Retiring is still the better pension rate**, 76/h against 11/h, though it
  is no longer the only thing gold is for. Whether "a complete office" is worth
  what it costs in pension is not a question the harness can answer — it turns
  on how much the conveniences are worth to a person using them, which needs a
  human. Do not tune this number again without one.
- **The 40% estate-to-pension rate now competes with the sink it feeds.** Every
  coin spent on equipment is a coin that would have become 0.4 pension on Form
  R-1. That is the intended tension, but the rate was set when gold had nowhere
  else to go and has not been revisited since.
- **Crafting is still an unbuilt sink** ([`crafting.md`](crafting.md)), and it
  is the one that would give `hoard` and Loot Priority something to do.
- **These are simulations, not play.** They measure the resolver, not whether
  any of it is fun. That still needs a human.
