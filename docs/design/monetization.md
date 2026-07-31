# Monetization policy

**Decided:** pay for convenience, never pay to win.

That sentence is easy to say and easy to violate, because almost every
pay-to-win mechanic in the genre was shipped by someone who believed they were
selling convenience. This document exists to make the line testable.

## The test

Before anything goes on sale, both questions must pass.

> **1. Given equal time played, does the buyer end up ahead of the
> non-buyer?**
> If yes, it is power. Do not sell it.

> **2. Does it show up on a surface other players can see?**
> The death feed, leaderboards, guild contribution, and depth records are
> competitive surfaces. Nothing purchased may move a number on them.

The first test is the strict one. "Convenience" that compounds into progress is
just power with a nicer name — a second standing-order slot does not save you
clicks, it doubles your operation.

## The awkward case: time

In an idle game, time *is* the resource. Any time skip is therefore a power
sale wearing a convenience costume, and no amount of framing fixes that.

Our resolution:

- **Permit expediting exists, but is never purchasable for money.** It is
  available to every player through a rewarded video, with a hard daily cap.
  The price is thirty seconds of attention, which every player has equal access
  to. An advantage everyone can take for free is not an advantage that was
  sold.
- **Offline catch-up is never touched.** Not sold, not extended, not tiered.
  The nearest competitor puts extended offline progress behind a subscription
  and is criticised for it constantly: charging for the core promise of the
  genre. Absence is never punished — that is product goal #2 and it is not for
  sale.

## What we sell

| SKU | Why it passes |
| --- | --- |
| **Monitor swaps** (phosphor palettes, bezel variants) | Pure cosmetic. Already prototyped as a pension unlock. |
| **Additional filing cabinets** (item storage) | Storage is the genre's cleanest convenience sale. More room to keep things does not make the recruit stronger. |
| **Standing order templates** (saved presets, one-tap switching) | Saves taps for a decision the player already made. The orders themselves are unchanged. |
| **Extended journal retention** | History is a reading convenience, not an advantage. |
| **Union membership** (optional subscription bundling the above) | Acceptable only while it contains no power. Audit it at every renewal. |

## What we never sell

- Offline catch-up, in any form
- Standing-order slots — more concurrent policy is more operation, which is power
- Arbitration attempts, crafting rolls, or anything that improves gear odds
- Stat boosts, permit tiers, pension multipliers, XP or gold rates
- Anything that moves a number on the death feed, a leaderboard, or guild
  contribution
- Loot boxes of any description. Our crafting already has randomness in it;
  selling randomness on top is where regulators and app stores are looking.
- **Gold, or anything priced in gold.** Gold is a sink currency now (see
  [`requisitions.md`](requisitions.md)); selling it would convert every
  requisition into a purchase.

## The interface is requisitioned, not sold

Office equipment — bulk filing, cabinet sort, split view, pinned readouts — is
bought with **in-game gold**, and is not a real-money SKU. It is described in
full in [`requisitions.md`](requisitions.md).

It is listed here only to state the boundary: **real money never buys any of
it, and never buys a discount on it.** A gold sink that can be topped up with
a card is a gold sink with a price tag, and the whole catalogue would fail
test 1 the moment it became skippable.

Cosmetics are the one overlap. A phosphor palette is buyable with pension today
and may also be sold for money later, because a palette confers nothing. If a
requisition ever confers *anything* beyond taps saved, it leaves the money list
immediately.

## Guardrails

1. **Entitlements are server-owned.** The client never grants itself anything.
   Already true by construction.
2. **Everything purchasable must also be inspectable before purchase.** No
   surprise contents.
3. **Prices in whole units, described in plain language.** No premium currency
   with a deliberately confusing exchange rate. If we ever add a currency, its
   conversion must be exact and its remainder spendable.
4. **A purchase never expires quietly.** If the Union membership lapses, the
   cosmetics stay owned; only the ongoing conveniences stop.
5. **The audit question at every review:** if we published the full SKU list on
   the Bulletin board tomorrow, would the community read it as fair? A game
   with a public death feed cannot afford a monetization scandal.

## Why this is also the commercially better choice

The competitor evidence in [`../research/idle-hacking.md`](../research/idle-hacking.md)
is that a visible spending hierarchy poisons the community — one 451-hour
player left a negative review purely about "whale overlords." In a game whose
social layer is a shared tavern and a public death feed, the community *is*
the retention mechanism. Selling power buys revenue from a handful of players
by damaging the thing that keeps everyone else.
