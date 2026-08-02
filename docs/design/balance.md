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

## Death was a wipe after all

Everything above about the cost of death was measured against a simulation of a
game the server was not running.

`newRecruit` takes the previous recruit's grade and permit tier and hands the
successor most of both — that is the "death is a setback, not a wipe" fix from
the very first balance pass, and the harness has always called it correctly. The
server never passed the arguments. `claimInside` builds the successor from a
`DeathRecord`, which carries a name, a depth and an award and no case file at
all, so both defaults applied. A Grade 11 officer holding Permit D-6, dying on
Floor 8, was replaced by **Grade 1 with Permit D-1**.

So the death spiral the first pass diagnosed and claimed to have fixed was
still there in the shipped game, for every player, the entire time — and the
harness could never see it, because the harness constructs its own successors.

Fixed by fetching the deceased recruit (`getLatestCharacter`, since by then
they are not the *active* one) and passing the case file through. There is now
a test on both adapters asserting a successor comes back at grade rather than
off the street.

**The lesson worth keeping:** the harness and the server built successors
independently, so they could disagree silently and did. Anywhere the simulation
re-implements a rule instead of calling it, it is measuring a different game.

### Grade retained now scales with the floor reached

Since the successor path was being fixed anyway, the flat two-thirds became
`0.55 + 0.04 × depth`, capped at whole. Losing somebody on Floor 10 says
something about the case file that losing somebody in the entrance corridor
does not, and the Authority sends a better replacement. Dying deep is still
worse than not dying — the successor starts at Depth 0 either way and has to
walk back down.

This is what makes the retirement loop noticeably better: a daily retirer
separating on Floor 6 keeps 79% of their grade instead of 67%, which shows up
as 214 value/h against 208 and a median Grade 6 instead of 5.

## Working below your grade: measured and rejected

`GRADE_STRETCH` — floors the Authority will let a recruit work beyond their
grade — has always been 0, which means `authorisedDepth` clamps depth to grade,
which means `gradeMismatchMultiplier` **can never return anything but 1**. The
knob documented as "the knob that makes Target Depth a decision rather than a
slider you push to the right" has never once fired. Verified by exhaustive
sweep over every reachable (level, permit, target) triple.

Turning it on is the obvious way to let aggressive orders actually go deep, and
it is a disaster at every value:

| stretch | balanced deaths/wk | balanced value/h | greedy value/h |
| --- | --- | --- | --- |
| **0** | **1.7** | **270** | **144** |
| 1 | 17.1 | 153 | 122 |
| 2 | 40.7 | 120 | 119 |
| 3 | 41.7 | 121 | 119 |

A flat stretch applies to a Grade I recruit on their first morning exactly as
it applies to a veteran, so the whole population dies in the entrance corridor
and every profile collapses into the same death farm. Working below your grade
is the right *idea* for aggressive orders; it cannot be granted to everyone at
once. Left at 0, with the reason recorded in `tuning.ts` so the next person does
not have to re-run the sweep.

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

## "Greedy should pay better" was the wrong diagnosis

The standing complaint was that aggressive play trades gold for pension and
never reaches its target depth. True, but the reason had nothing to do with
depth. The greedy profile differs from balanced on *three* knobs at once —
Floor 9 instead of 6, retreat 20% instead of 30%, relics and hoard instead of
gear and resupply — so it was never clear which one was failing. Changing one
at a time:

| profile | changed | deaths/wk | value/h | pens/h | floor | lvl |
| --- | --- | --- | --- | --- | --- | --- |
| balanced | — | 1.7 | 271 | 11 | 6 | 13 |
| **deep** | depth 9 | 7.8 | 256 | **105** | **9** | 7 |
| **brave** | retreat 20% | **17.4** | 154 | 71 | 6 | 4 |
| relicist | relics + hoard | 2.5 | 261 | 24 | 6 | 12 |
| greedy | all three | 16.6 | 144 | 66 | 5 | 3 |

**Depth already pays, handsomely.** Ordering Floor 9 with an ordinary retreat
threshold gives up 6% of income and returns 105 pension an hour — better than
the daily retirer's 89, and ten times balanced play. Loot priority is close to
free. The entire failure is the retreat threshold, and greedy inherits it.

### The retreat slider was mostly scenery

Sweeping it at Target Depth 6:

| retreat | 60 | 50 | 40 | 35 | 30 | 25 | 20 | 15 | 10 | 5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deaths/wk | 0.0 | 0.0 | 0.0 | 0.2 | 1.7 | 9.2 | 17.4 | 27.6 | 49.4 | 148.2 |
| value/h | 279 | 279 | 281 | 280 | 271 | 212 | 154 | 116 | 96 | 108 |
| pens/h | 0 | 0 | 0 | 0 | 11 | 86 | 71 | 57 | 50 | 67 |

Everything from 35 to 80 is one setting. A recruit who withdraws above
`MAX_HIT_FRACTION` cannot be killed by a normal blow, so only the 3% grievous
tail can reach them, and it effectively never does. At the other end, below 10
the recruit dies before descending, which is why the bottom of the table stops
being monotonic — r5 out-earns r10 because it never gets anywhere to lose
anything.

So the control ran 5–80 and meant something across about twenty of those
points. It is 10–45 now. Every position on it now changes an outcome: 45 never
dies, 30 loses somebody every few days, 25 is where pension income peaks, 10 is
a formality. The server clamps rather than rejects out-of-band values, so orders
filed under the old range still submit — 60 and 45 resolve identically anyway.

**25 is the interesting discovery.** It is the pension-maximising setting by a
distance (86/h against 11 at r30), it costs a fifth of income, and nothing below
it is worth choosing — 20 and 15 are worse on *both* currencies. The dominated
region is now mostly off the slider.

## The default orders are a dead end

Every number above describes a *profile* — a set of standing orders someone
chose. None of them described the orders a player actually starts with. The
developer time machine (`advance <hours>`, dev builds only) made that cheap to
check, and it is the most alarming result in this document.

A player who never opens Form SO-1, fast-forwarded 29 days:

| | +6h | +24h | +48h | +96h | +360h | +696h |
| --- | --- | --- | --- | --- | --- | --- |
| grade | 4 | 6 | 8 | 10 | 15 | 19 |
| floor | 3 | 2 | 2 | 2 | 2 | 2 |
| permit | D-2 | D-2 | D-2 | D-2 | D-2 | D-2 |
| pension | 0 | 0 | 0 | 0 | 0 | 0 |
| unlocks affordable | 0 | 0 | 0 | 0 | 0 | 0 |

**Nothing changes after hour six.** The recruit grades up forever and never
goes anywhere, and the entire prestige half of the game — nineteen unlocks
across seven ladders — is invisible for a month, because pension is zero and
stays zero.

That table came from the fast-forward endpoint, which was
[a treadmill](#the-fast-forward-was-a-treadmill) at the time, so it is here as
the observation that started the investigation rather than as evidence. It has
been re-run on the clean harness — the old defaults, 20 careers × 14 days:

| deaths | pension | grade | permit | empty 12h windows | longest silence |
| --- | --- | --- | --- | --- | --- |
| 0.0 (0 in 20 of 20 careers) | 0 (0 in 20 of 20) | 15 | D-2 | 60.7% | 2.5 days |

The clean run makes it worse, not better. Not one career in twenty ever lost a
recruit, not one ever banked a coin, every single one finished on Permit D-2,
and three check-ins in five had nothing to show. The diagnosis below was right
for the right reasons; only the sample size was wrong.

Two mechanisms, both defaults:

- **Target Depth defaults to 3, which is exactly what Permit D-2 authorises.**
  A permit application is only filed when the recruit is *stalled*, and stalled
  means `depth >= limit && targetDepth > limit`. When the target equals the
  limit there is no stall, so no application, so no permit, forever. The ladder
  the Terminal was built to display never starts climbing.
- **Retreat defaults to 28% at Floor 2, which never kills anybody.** No death
  means no pension, and pension is the only currency the prestige ladders take.
  Form R-1 exists, but nothing prompts it and it is on a screen the player has
  no reason to visit when the Ledger shows an empty PENSION column.

An officer who files orders on day one (Floor 9, retreat 30) has the opposite
problem: five deaths in 29 days, ~10,000 pension, seven unlocks affordable —
but grade and permit ratchet *downward* across successors, from Grade 7 / D-6
at 48 hours to Grade 4 / D-4 at 696. Deaths cost a permit tier each and are
arriving faster than the ladder can be re-climbed.

Neither of these is a content problem, which is what makes it worth writing
down: no amount of new fauna or new loot fixes a player who is never asked to
descend.

### What the defaults are now

Target Depth defaults to **12** and Retreat to **35%**.

**This value has been measured three times and the first two were wrong.** The
number did not move on the third pass; the reasons did, entirely. Both wrong
passes and the working one are below, because the failure modes are the useful
part.

*First pass.* `advanceTime` stops at the first death, and the probe driving it
added the *requested* hours to its running total rather than the hours actually
advanced. Profiles that died were credited with far more elapsed time than they
had lived; profiles that never died were credited correctly. That made safe
settings look barren, "depth 12, retreat 35" appeared to earn zero pension
forever, and 28 was chosen to avoid it.

*Second pass.* Elapsed ticks were counted correctly, and the numbers were still
wrong, because the endpoint underneath was. `/v1/dev/advance` wound the
character's watermark backwards against a fixed `Date.now()` — which replays
the same absolute tick window, and every tick is seeded from
`tickSeed(characterId, tick)`. Six one-hour advances simulated the same hour six
times. A fortnight-long fast-forwarded career was one hour on a loop, and it
died only if that particular hour was lethal. See
[the clock](#the-fast-forward-was-a-treadmill).

*Third pass, below.* The clock moves now, and the sweep is run on
`tools/cadence.ts`, which drives `resolve()` and never touches an endpoint —
a harness that touches no endpoint cannot inherit an endpoint's bugs.

Target Depth 12, **20 careers × 14 days per row** (280 career-days each),
successors created and inherited the way the server creates them:

| retreat | deaths / 14d | pension (median) | grade | permit | empty 12h windows | banked nothing |
| --- | --- | --- | --- | --- | --- | --- |
| 28 | 20.0 | 34,800 | 6 | D-5 | 0.0% | 0/20 |
| 32 | 16.1 | 42,800 | 7 | D-6 | 0.5% | 0/20 |
| **35** | **12.3** | **49,200** | **12** | **D-8** | **6.1%** | **0/20** |
| 38 | 6.8 | 49,200 | 17 | D-8 | 21.1% | 0/20 |
| 42 | 1.7 | 21,600 | 20 | D-8 | 36.3% | 4/20 |
| 45 | 1.1 | 7,100 | 20 | D-8 | 37.5% | 8/20 |

Monotone in every column, which is the first thing worth saying: the
bimodality reported last time was the treadmill, not the game. So was the
claim that death above `MAX_HIT_FRACTION` collapses to the 3% grievous tail.
At retreat 35 a recruit dies about twelve times a fortnight. That is ordinary.

35 and 38 tie on pension, and 38 buys four more grades. **35 wins on
cadence**: 6.1% of check-in windows contain nothing against 38's 21.1%. A
player checking in twice a day sees an empty screen about once a fortnight at
35 and about three times a week at 38.

Below 35 the recruit is treading water in a different way — 20 deaths a
fortnight at retreat 28, still Grade 6 on Permit D-5, because deaths knock
grade back faster than it climbs. Above 42 the game goes quiet and, for the
first time in the sweep, some careers bank nothing at all: 4 in 20 at retreat
42 and 8 in 20 at 45. That is the real dead-end risk, and it lives at the
*cautious* end of the slider, which is the opposite of where the first two
passes put it.

Target Depth is the maximum for a structural reason rather than a measured one:
a permit is applied for only when the recruit *stalls*, which needs the target
to exceed the current limit, so any lower value stops the ladder the moment it
catches up. Depth 6 confirms it — fourteen days, zero deaths, Permit D-4, and
pension still zero. Defaulting to the maximum is not reckless, because
`authorisedDepth` clamps it to grade and permit: it means "as deep as I am
allowed", which is what the aspiration was always documented to mean.

The defaults also lived in **three** places — both adapters and the sign-up
path — which is the same shape as the successor bug. They are one exported
constant now.

### The gold sink is reachable, and the estate rate is not the problem

`requisitions.md` asked whether the 40% estate-to-pension rate starves the sink
it was meant to feed. Measured three ways over fourteen days:

| behaviour | gold at day 14 | requisitions affordable |
| --- | --- | --- |
| never sells, never spends pension | 50 | 0 of 4 |
| sells the cabinet, never spends pension | 89 | 0 of 4 |
| **sells, and spends pension as it arrives** | **7,926** | **4 of 4** |

The bridge is the prestige ladder itself: `stipend1` pays gold every tick and
`estate1` hands a successor 120 gold of effects, so an officer who spends
pension stops losing their purse to every funeral. Gold surviving death is
something you *buy*, which is a better answer than a tuning constant. The open
question can be closed: leave the rate alone.

## The fast-forward was a treadmill

The most expensive bug in this document was not in the game. It was in the
instrument.

`/v1/dev/advance` advanced time by winding the character's `lastResolvedTick`
(and `bornTick`) *backwards* by the requested span and letting the ordinary
lazy resolver replay forward to `Date.now()`. The reasoning was that moving the
recruit back relative to a fixed now is the same as moving now forward, and
that it guarantees a fast-forwarded career is bit-for-bit a career a real
absence produces. The second half is the point of the endpoint. The first half
is false.

Resolution is seeded per tick from `tickSeed(characterId, tick)` — deliberately,
so a career is reproducible. Winding backwards to the *same absolute window*
therefore replays the *same seeds*. Each advance simulated the identical hour
again:

```
six one-hour advances requested
158 journal entries, 109 distinct ticks, spanning 59 minutes
```

Every fast-forward was one hour on a loop. Careers barely died, because they
died only if that one hour happened to be lethal — and if it was, they died on
the first advance. Measured against a clock that moves, the same span kills
about sixteen times as often.

### How it hid

Nothing threw. The state was internally consistent at every step: ticks
advanced, grade climbed, permits cleared, the journal grew. `ticksAdvanced` was
truthful about what the endpoint had been asked to do. Four tests covered the
endpoint and all four passed, because each asserted a property the treadmill
satisfies — that time advanced, that service was credited, that chunking
avoided the recess clamp, that a career happened.

What none of them asserted is that the *time was different time*. The tell is
one line: the span of the journal has to match the span advanced. That is the
regression test now.

### What it invalidated

Everything measured through the endpoint, which was the default-orders
investigation and the retreat sweep. Both have been re-run on
`tools/cadence.ts`, which drives `resolve()` directly. The conclusions held —
the old defaults really are a dead end, and retreat 35 really is the right
default — but two published claims did not, and both had been reasoned about at
length:

- *"Death above `MAX_HIT_FRACTION` collapses to the 3% grievous tail — a rare
  event, wildly uneven over a fortnight."* No. 12.3 deaths per fortnight at the
  shipped default.
- *"Retreat 38 is bimodal; a third of players get the dead end by luck."* No.
  The sweep is monotone in every column. Bimodality is what one replayed hour
  looks like when you sample it three times.

Both were written to explain a shape in the data. The shape was the
instrument's.

The general lesson is the one this document keeps re-learning: **a measurement
that surprises you is a claim about your instrument before it is a claim about
the world.** The tell was available and I explained it away — a test that
failed one run in eight got a comment about rare-event processes instead of an
investigation. The comment was well-argued and wrong. A flaky test is a
measurement, and the right response to a measurement you do not like is to find
out why.

## Milestone cadence

M4 asks that something visible move every session, where a session is a
check-in and the design assumes two a day. Measured on the shipped defaults,
20 careers × 14 days, cutting each journal into 12-hour windows and counting
only lines where state actually changed — a promotion, a permit filed or
approved, a death, a successor, a new deepest floor:

| | shipped defaults | old defaults |
| --- | --- | --- |
| genuine events per career-day | 7.2 | 1.4 |
| 12h windows with nothing in them | 6.1% | 60.7% |
| longest silent stretch | 1 day | 2.5 days |

Repeating lines are excluded on purpose. "Descent limited pending grade review"
fires every three hours for as long as the recruit is stuck, so counting it
would fill almost every window with a report that the game is *not* moving.
The twice-daily service review is excluded for the same reason in the other
direction: it is guaranteed, so it proves nothing. Counting it, no window is
ever empty, which is a fact about the reminder and not about the game.

6.1% is roughly one empty check-in a fortnight. That is defensible against the
criterion. What the criterion does not cover, and what still needs a human, is
whether the 93.9% *read* as something happening — an event density measured in
journal lines is not the same as a player feeling their career moved.

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

## Case files: what gear did to the simulation, twice

`crafting.md` asks for a staging plan — "ship items and clauses first and the
full form catalogue second" — and this is that first slice. Its whole job was
to close M4's last open item, *Loot Priority and Spend Policy are still thin*.

**The first version broke the game, and the harness said so in one run.**
Six carried files of up to four clauses each, with nothing but a survival
clamp:

| | shipped defaults, before | first version of case files |
| --- | --- | --- |
| deaths per fortnight | 12.3 | **0.00 — none in 30 careers of 30** |
| pension banked | 49,151 | **0 — none in 30 of 30** |
| empty 12h windows | 6.1% | 32.0% |
| carried stat block | — | +254 vigour, survival pinned, +160% loot |

That is precisely the failure the *old default orders* had, rebuilt by a new
system: no death, no pension, and the entire prestige half of the game
invisible. Two causes, and the second is the interesting one.

**Cause one: no ceiling.** Twenty-four stacked clauses had nothing to stop
them. The caps in `items.ts` are the design now rather than a safety net —
vigour is capped as a *share* of the recruit's own maximum, so a file is worth
the same proportion at Grade 2 and Grade 20.

**Cause two: the drop rate was twenty times too high, and it read as rare.**
`0.07` was chosen as "about one find in fourteen". But a recruit on Floor 8
has an encounter about a third of all ticks and finds something on roughly
half of those — on the order of two hundred acquisitions a day. One in
fourteen is forty case files a day. *A rate is not rare because the
denominator sounds big.* It is rare when the measured count is small, and
nobody measured the count. At 0.004 it is two or three a day.

### Where it landed

30 careers × 14 days on the shipped defaults:

| | before | with case files |
| --- | --- | --- |
| deaths per fortnight | 12.3 | 9.07 |
| pension banked (median) | 49,151 | 51,786 |
| banked nothing | 0 of 20 | 1 of 30 |
| empty 12h windows | 6.1% | 6.8% |
| final grade (median) | 12 | 15 |

Gear cuts mortality by about a quarter, pays slightly better, and leaves the
check-in cadence alone. That is what gear should do.

### Loot Priority is no longer thin

The open M4 item, closed. 25 careers × 14 days each:

| priority | deaths | pension | gold | grade | files carried |
| --- | --- | --- | --- | --- | --- |
| gold | 10.2 | 55,700 | 20,000 | 12 | 0 |
| gear | 8.5 | 51,800 | 17,700 | 15 | 2 |
| relics | 8.6 | 56,300 | 16,200 | 13 | 2 |
| knowledge | 6.8 | 35,400 | 12,500 | 20 | 3 |

Four legible strategies: gold is raw yield and the highest body count, gear
buys survivability, relics trade coin for pension, knowledge buys grade and
protection at a real cost in income.

**Relics needed fixing and the reason is worth recording.** `CASE_FILE_BIAS`
multiplies `LOOT_EFFECT.findChance`, and relics only finds anything 55% as
often — so a 1.3 bias made the *relic hunter* carry fewer and worse case files
than the gear hunter, exactly inverting the design. Two multiplicative knobs
in different files, and the product was nobody's intent.

### The measurement bug in the measurement

The cadence probe did not count "Case #… opened" as a genuine event, so its
first report of this system was partly its own blind spot. Worth stating
plainly because it is the third time this session that an instrument, not the
game, produced the surprising number.

## The exhaustion curve: the game is thirteen days long

Every measurement above ran fourteen days, because fourteen days is what the
design talks about. `research/mobile-incrementals.md` made that a problem —
the Play-native incrementals we will sit beside sell "months or years" — so
`npm run longrun` plays ninety days and records the tick at which each *new*
thing happens for the first time. The last entry on that timeline is the
moment the game runs out.

Eight careers, an officer who spends as soon as they can (the fastest
exhaustion, deliberately — a casual player takes longer to reach the same
place):

> **The last new thing happens on day 13.4.** Earliest 8.5, latest 19.2.
> **Seventy-six of the ninety days contain nothing the player has not already
> seen.**

That is the headline, and it is bad. Three specific findings underneath it are
worse, because each is a structural fault rather than a shortage of content.

### Everything structural is gone in four days

| | done by |
| --- | --- |
| all 8 permit tiers | day 3.2 |
| all 12 floors | day 4.3 |
| all 7 requisitions | day 4.1 |

The permit ladder is the thing the Terminal is *built to display* — the
pending-permit line, the ETA, the "legible ladder" M4 item. It is finished
before the end of day three. After day 4.3 there is no floor a player has not
seen and no permit left to wait for.

### Prestige arrives in clumps, not a curve

The unlock timeline from one career:

```
day  1.7   2 unlocks
day  4.4   2 unlocks
day  4.9   1 unlock
day 10.4   8 unlocks        <-- five and a half days of nothing, then eight
day 19.2   6 unlocks        <-- eight days of nothing, then six
```

Pension accumulates while nothing is affordable; a death pays out; every
affordable rung is bought in the same minute. So the player gets nothing for
most of a week and then eight things at once — which is both a worse reward
schedule than a flat drip and the direct cause of the gap between day 4.9 and
day 10.4, the longest empty stretch in the game.

This is not a content problem. Nineteen unlocks *is* the content; it is being
delivered in three payments.

### Grade stops meaning anything on day four

At day 90 the median recruit is **Grade 46**. `authorisedDepth` is

```ts
Math.min(targetDepth, permitDepthLimit(permitTier), level + GRADE_STRETCH, MAX_DEPTH)
```

with `MAX_DEPTH = 12`, so past level 12 the `level` term can never bind. Grade
is the most prominent number on the Terminal's stat line, it climbs forever,
and from roughly day four it does nothing at all. A number that visibly
increases while changing nothing is worse than no number — it is a progress
bar wired to a disconnected motor.

### What this does and does not say

It does not say the game is bad; a fortnight of real progression is more than
many games in this genre offer before their first wall. It says the game is
**thirteen days long and does not know it**, and that the last nine of those
days are three lump-sum payments.

The tempting fix is more content, and
[`research/mobile-incrementals.md`](../research/mobile-incrementals.md)
records why that alone is wrong: the genre's most common complaint is
late-game grind, so padding the ceiling trades our problem for the one players
write reviews about. The three faults above are all *structural* — a ladder
that finishes too early, a reward schedule that clumps, and a stat that stops
mattering — and none of them is fixed by adding more rungs.

## The game was ending itself, and the exhaustion curve had hidden it

Fixing the three faults above, in order, turned up a fourth that none of them
described — and that was doing more damage than all three together.

### The grade fix, which went as expected

`seniority(level)` in `tuning.ts` is grade earned past `MAX_DEPTH`, the point
where `authorisedDepth` stops reading the `level` term. It feeds case-file
grade at `seniority / 14`, capped at +1.5 grades. Deliberately *not* more
survivability: the measured problem is a shortage of new things, and making a
late recruit harder to kill suppresses the death loop that produces most of
the remaining events. Case-file quality is already hard-capped in `items.ts`,
so however long a career runs it cannot inflate past a known ceiling.

### The clumping fix, which did almost nothing — and why that was the tell

Tier 2 and 3 unlock costs were raised and spread within each tier: `permits3`
11,000 → 41,000, `service3` 21,000 → 88,000, and so on down the catalogue.
The intent was that one payout buys roughly one rung instead of crossing six
flat bands at once.

The median "last new thing" moved from day 13.4 to day 13.9. Half a day, for a
four-fold price rise. That is not a re-pricing failing to bite; that is income
that has *stopped*, so no price can be reached.

### Per-fortnight instrumentation, and the actual fault

`longrun.ts` grew a deaths-and-pension-per-fortnight readout. It answered
immediately:

```
days  0-14   deaths 8   pension 67,344
days 14-28   deaths 0   pension      0
days 28-42   deaths 0   pension      0
```

The recruit stopped dying. Death is the only source of pension and pension is
the only currency the prestige ladders take, so progression halted around day
fourteen and never resumed for the remaining seventy-six days. The game was
not out of content. It had locked the player out of the content it had.

The arithmetic is the same shape as the retreat-threshold bug recorded above.
Damage scales with **depth**, which stops at `MAX_DEPTH = 12`. `maxHpForLevel`
scaled with **grade**, which stopped at nothing:

```ts
STARTING_HP + (level - 1) * 11
```

The worst single blow in the game is a grievous hit at Floor 12, about 97
damage. A recruit retreats at `retreatPct` of maximum; at Grade 30 that
threshold is 126. From there nothing in the game can kill them — and at a
median day-90 grade of 46 they were far past it. Every career converged on an
immortal recruit farming a floor that could not hurt them.

The fix is one `Math.min`:

```ts
export function maxHpForLevel(level: number): number {
  return STARTING_HP + (Math.min(level, MAX_DEPTH) - 1) * 11;
}
```

Grade stops buying survivability at the grade that matches the deepest floor
the Authority will ever authorise. Past that it buys seniority. A Grade 40
recruit is *better* than a Grade 12 one; they are not *safer*.

### Where the ninety days landed

|  | before | after |
| --- | --- | --- |
| last new thing | day 13.4 | **day 39.2** (earliest 37.5, latest 40.2) |
| unlocks bought | 13 of 19 | **19 of 19** |
| requisitions | 7 of 7 | 7 of 7 |
| deaths in 90 days | 8 | 94 |
| final grade | 46 | 14 |

Deaths per fortnight now hold flat across the whole run — 15, 16, 13, 15, 16,
16 — and pension per fortnight climbs rather than stopping: 79k, 166k, 246k,
327k, 337k, 301k. Income is a curve again.

The unlock timeline is the clearest evidence, because it is what the clumping
fix was actually for:

```
day  1.7   2 unlocks
day  4.4   2
day  4.9   1
day  8.3   4
day  9.6   1
day 10.8   1
day 14.1   2
day 17.4   1      <-- from here, one rung every 3 to 6 days
day 23.2   1
day 26.3   1
day 29.8   1
day 35.8   1
day 40.2   1
```

Against the old shape — two, then nothing for five days, then **eight in the
same minute**, then eight empty days, then six at once. Same nineteen rungs,
paid as a drip instead of three instalments.

The fortnight probe improved on every axis at the same time: genuine-empty
check-in windows 6.8% → **4.0%**, the best measured; 7.52 events per career
day; deaths 11.72 per career with none in 0 of 40; pension banked in 40 of 40.
The longest silent stretch is one window, half a day.

### What is still true

Fifty of the ninety days still have nothing new in them. Thirty-nine days is
roughly three times the previous length and it is past the fortnight the M4
exit criterion cares about, but it is not "months or years", and
[`research/mobile-incrementals.md`](../research/mobile-incrementals.md) is
clear that the games we will sit beside sell exactly that. The difference is
that the remaining gap is now a content question — there is nothing after day
39 because nothing has been written for it — rather than a system quietly
refusing to pay out.

The third time in this document that a surprising number turned out to be
about the instrument and not the world. The 90-day run only found this because
it was asked for a *per-fortnight* breakdown; the median it had been reporting
all along averaged an immortal recruit's silence together with the first two
weeks, and produced a number that looked merely disappointing.
