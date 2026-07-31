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
- **These are simulations, not play.** They measure the resolver, not whether
  any of it is fun. That still needs a human.
