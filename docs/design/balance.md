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

## Known imperfections

- **Greedy is still not clearly worth it.** It trades gold for pension, but the
  deaths cost enough grade that it never reaches its target depth. It is a
  different strategy rather than a dominated one, but "push deep and accept
  losses" should probably pay better than it does.
- **Loot Priority is thin** until crafting lands. `LOOT_EFFECT` makes it a real
  choice, but the interesting version is clause pools (see `crafting.md`).
- **Spend Policy's `hoard` is close to strictly worse** — it saves gold and
  risks unsupplied descent, which mostly just kills you.
- **These are simulations, not play.** They measure the resolver, not whether
  any of it is fun. That still needs a human.
