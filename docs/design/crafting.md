# Design: Requisition & Arbitration (gear and affixes)

**Status:** partly shipped, following the staging plan at the foot of this
document — *items and clauses first, the form catalogue second*.

**Shipped:** case files with grades, twenty clauses across endorsements and
riders, a three-slot drawer that evicts its weakest entry, drop rates biased by
Loot Priority, hard ceilings on the carried stat block, the **ARMOURY** screen,
**Union Standing** as a real currency, and **Form 12-C — Arbitration**, with
the filing rails underneath it: a form is queued with a resolution tick,
resolves inside the tick loop like everything else, and is seeded on the filing
so replaying the span cannot change the ruling.

**Not shipped:** forms 7-A, 3-B, 19, N-1 and 44; provenance; equipment policy
and the countersignature rules.

12-C went first because it is the one that needs nothing new. 7-A needs hidden
clauses, 44 needs provenance, and 3-B needs vacant slots — which today's rolls
almost never leave, so shipping it means changing what drops, and changing what
drops means re-measuring the game. Adding the rest is authoring on rails that
now exist.

Gear crafting is the most-praised system in our closest competitor and the
biggest structural gap in our design. This is the version of it that is
actually ours — where the crafting system *is* the bureaucracy, rather than an
ARPG bolted onto a filing cabinet.

## The premise

Your recruit finds things. The things have contested ownership. You are a case
officer: you do not swing the sword, and you do not forge it either.

**You file paperwork about it.**

Every crafting action is a form. Forms take time to process. That is not a
gimmick — it is why this system fits an async game, and why it beats the
click-to-reroll version. Filing is a decision; processing is the wait; opening
the terminal to find your arbitration resolved is exactly the check-in habit
we want to build.

## Items

An item is a **case file**:

```
SWORD, ADEQUATE (+2)                          Case #4417-C
Grade II · Provenance: Disputed
  Endorsement: Municipally Certified          +3 vigour
  Rider:       of Contested Ownership         +8% loot value, −1 Union Standing
  [ vacant clause ]
```

- **Base type** — from the existing loot tables (Sword, Adequate; Shield,
  Dented; Amulet, Provenance Unknown). Base type sets the stat the item
  contributes to resolution.
- **Grade** — I to V. Grade sets how many clause slots the item has (1–4) and
  which affix tiers can roll on it.
- **Clauses** — the affixes. **Endorsements** are prefixes, **Riders** are
  suffixes. Riders are where the drawbacks live, which is how an item gets a
  personality: the good sword that costs you standing every time you use it.
- **Provenance** — Clear, Disputed, or Unknown. Disputed items are stronger and
  can be seized during an audit if you never resolve the dispute. A wonderful
  source of low-grade dread.

## The forms

| Form | Does | Cost | Processing |
| --- | --- | --- | --- |
| **7-A — Appraisal** | Reveals hidden clauses on an item | Small gold fee | Minutes |
| **3-B — Amendment** | Adds a clause to a vacant slot | Gold + Union Standing | ~1 hour |
| **12-C — Arbitration** ✅ | Rerolls one contested clause | Gold + Union Standing | ~2 hours |
| **19 — Requisition** | Merges two items; the survivor inherits one clause, the other is *filed* | Gold, both items | ~4 hours |
| **N-1 — Notarisation** | Locks a clause so future arbitration cannot alter it | Expensive | ~1 hour |
| **44 — Provenance Settlement** | Resolves Disputed → Clear, protecting it from audit, at the cost of one clause | Gold | ~6 hours |

Arbitration can fail: **"Case dismissed. Fee retained."** The fee is spent, the
clause is unchanged. This is the risk that makes a good roll feel earned, and
it is funnier than a progress bar that always succeeds.

**As shipped**, 12-C is priced at 90 gold per grade of the target file plus 3
Union Standing, sits for two hours, and is dismissed 30% of the time. It draws
its replacement from clauses of the *same kind* at or below the file's grade —
a rider that could come back as an endorsement would make every drawback a
formality. The pricing was measured rather than guessed; see
[`balance.md`](./balance.md), which records why the standing rate had to
double.

Three rules the implementation holds to, each of which had an obvious wrong
version:

1. **A ruling is seeded on the filing**, not on `(character, tick)` like every
   other roll. Two forms due in the same minute would otherwise share a seed
   and the second would be the first's shadow.
2. **Arbitration draws from its own stream**, like prose. If it drew from the
   simulation stream, doing paperwork would silently change what is waiting on
   Floor 9.
3. **A form whose clause has moved does not rule on whatever is at that index
   now.** It says so and retains the fee. Quietly rerolling a different clause
   than the one contested is the worst behaviour available here.

## Currencies

Nothing new is invented. Crafting consumes what the game already produces:

- **Gold** — already ticking through the resolver.
- **Union Standing** — already in the log copy (*"Union Standing +1 for prompt
  filing"*) and doing nothing. This is its job: earned by filing correctly,
  spent on filing more. It gives the clerical voice a mechanical spine.
- **Supplies** — unchanged; still consumed by delving.

## How it hooks into what exists

This is the part that makes it worth building rather than bolting on.

- **Loot Priority stops being cosmetic.** The existing standing order decides
  which base types and clause pools the recruit brings back — GEAR yields
  bases, RELICS yields high-tier clauses on Disputed provenance, KNOWLEDGE
  yields appraisals and arbitration discounts. One of M3's goals is "make the
  four knobs matter"; this does most of that work on its own.
- **The Inherited Gear Slot unlock finally means something.** It already exists
  in the pension catalogue. One item survives death — and now items are worth
  surviving for.
- **Death gets a second stake.** Currently death costs you a recruit and pays a
  pension. With gear, it costs you the case files you had built, which is what
  makes the prestige loop bite.
- **The market becomes a real market.** Players selling arbitrated items to
  each other is the natural M4 economy, and it is the only place where an item
  with a bad Rider still has value to someone.

## Where it lives

A sixth screen — **ARMOURY** — gated behind clearance, per the progressive
disclosure rule. Not handed to a new officer; issued once they have a case file
worth arguing about.

**Shipped, with one change forced by the clearance rules.** "Once they have a
case file" is not a condition clearance can use: every grant must be monotone
across death, and case files die with the recruit, so a drawer-based gate would
take the screen away at the first funeral. Measured instead — across forty
default careers the first case file lands at a median of day 0.55, by permit
tier D-2 twice, D-3 thirteen times, D-4 seven and a tail beyond. The gate is
therefore **permit D-3 or a second recruit**, which puts the drawer on the desk
before the first thing goes in it in 31 careers of 33.

Filing status shows in the Terminal log like everything else:

```
14:22  Form 12-C filed against Case #4417-C. Estimated processing: 2 hours.
16:19  Arbitration concluded. Clause amended: "of Contested Ownership" →
       "of Reluctant Compliance". Union Standing −2.
```

## Server design

Consistent with everything else:

- New `items` table; items belong to a character, except the one inherited slot
  which belongs to the account.
- New `filings` table: form type, target item, clause index, filed tick,
  resolves tick. Resolution happens in the tick loop, in the same transaction
  as everything else.
- **Affix rolls are seeded on `(item id, filing id)`**, so a filing resolves to
  the same result no matter when it is replayed. Same determinism rule as the
  rest of the resolver.
- Gear modifies the combat maths in `resolve.ts` through a computed stat block,
  not by touching the resolver's structure.

## Equipment policy

**Decided:** automatic by default, with a sticky manual override. An item the
officer issues by hand is never swapped out by the system unless the officer
releases it.

In voice, the two halves are:

- **Quartermaster's Discretion** — the default. New loot is equipped
  automatically if it beats what the recruit is carrying, by whichever metric
  the officer's standing order selects.
- **Direct Issue (Form 5-E)** — the officer equips a specific item into a
  specific slot. That slot is now **countersigned**: the quartermaster may not
  substitute it. Releasing the countersignature returns the slot to discretion.

This is the fifth standing order, and it belongs on Form SO-1 with the others:

```
5. EQUIPMENT POLICY
   [ VIGOUR ] [ SURVIVAL ] [ LOOT VALUE ] [ BALANCED ] [ OFFICER ONLY ]
```

`OFFICER ONLY` disables the quartermaster entirely — nothing is equipped
without a Form 5-E. For the player who wants to run every slot by hand.

### Rules

1. A countersigned slot is never touched by automatic equipping, even by a
   strictly better item. The system may *suggest* in the log; it may not act.
2. Releasing the countersignature returns the slot to discretion immediately,
   and the next resolution equips by policy.
3. Countersignatures survive death **for the inherited item only** — the
   officer's standing instruction outlives the recruit, which is the joke and
   also the behaviour a player would expect.
4. If a countersigned item leaves the file — seized in an audit, consumed by a
   Form 19 requisition — the countersignature clears and the slot returns to
   discretion, with a log line saying so. No silent empty slots.
5. Automatic equipping happens **inside resolution**, so it must be
   deterministic: the comparison metric is a pure function of the stat block,
   and ties break on item id. Same rule as every other roll.

### The edge case worth watching

A countersigned item that the *next* recruit cannot use — wrong grade, revoked
certification — must not be silently swapped, because that breaks rule 1 and
therefore the promise. The design leaves it equipped and inert, with a loud
line on the Terminal:

```
09:04  Case #4417-C remains countersigned but is not certified for Grade I.
       Recruit is proceeding without a sidearm. This has been noted.
```

That is correct but potentially punishing: a player who does not read the log
could run a recruit half-equipped for hours. If playtesting shows people
getting stuck, the fix is a sixth policy option — `SUBSTITUTE IN EMERGENCY` —
rather than weakening rule 1. Never quietly override an explicit instruction.

## Guardrails

- **Numbers stay human.** Clauses give small integers and modest percentages.
  A Grade V item is meaningfully better than a Grade I; it is not four orders
  of magnitude better. No scientific notation, ever.
- **Nothing here is purchasable.** Not arbitration attempts, not clause rerolls,
  not luck. Storage — additional filing cabinets — is the only adjacent thing
  we sell. See [`monetization.md`](./monetization.md).
- **Start at ~40 clauses, not 100.** Our competitor has 100+ affixes after
  years. Depth can grow; a shallow pool shipped is worth more than a deep pool
  planned.

## Open questions

1. **Should Disputed items be seizable?** Audits are funny and create urgency,
   but losing a good item to a timer is the kind of thing that generates
   negative reviews. Probably yes, but heavily telegraphed and always
   preventable via Form 44.
2. **How much of this survives death?** Currently one slot. If the answer is
   "almost nothing", players may not invest in crafting at all.
