# Design: Requisition & Arbitration (gear and affixes)

**Status:** designed, not scheduled. Target M3.

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
| **12-C — Arbitration** | Rerolls one contested clause | Gold + Union Standing | ~2 hours |
| **19 — Requisition** | Merges two items; the survivor inherits one clause, the other is *filed* | Gold, both items | ~4 hours |
| **N-1 — Notarisation** | Locks a clause so future arbitration cannot alter it | Expensive | ~1 hour |
| **44 — Provenance Settlement** | Resolves Disputed → Clear, protecting it from audit, at the cost of one clause | Gold | ~6 hours |

Arbitration can fail: **"Case dismissed. Fee retained."** The fee is spent, the
clause is unchanged. This is the risk that makes a good roll feel earned, and
it is funnier than a progress bar that always succeeds.

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
worth arguing about. Filing status shows in the Terminal log like everything
else:

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

1. **Does the recruit equip automatically, or does the officer decide?** Auto is
   more in voice (you file policy, not micromanagement) and less busywork.
   Manual gives the player a real decision. Leaning: auto-equip by a policy the
   player sets — a fifth standing order — with manual override.
2. **Should Disputed items be seizable?** Audits are funny and create urgency,
   but losing a good item to a timer is the kind of thing that generates
   negative reviews. Probably yes, but heavily telegraphed and always
   preventable via Form 44.
3. **How much of this survives death?** Currently one slot. If the answer is
   "almost nothing", players may not invest in crafting at all.
