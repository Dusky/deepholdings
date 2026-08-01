# Requisitions — buying the interface with gold

**Status:** built, in four tracks of seven rungs. The remaining catalogue
entries below are designed and unbuilt.

## The problem it solves

Gold currently buys supplies and nothing else. That is a real hole, and the
balance simulation found it from the other direction: retiring on a daily cycle
pays 87 pension/hour against balanced play's 19, and the reason nobody would
choose otherwise is that the income you give up **buys nothing**. A currency
with no sink is not a resource, it is a score.

Worse, gold *dies with the recruit*. Every coin on a recruit at the moment they
die or retire is converted to pension at a fixed rate and the rest of the
relationship between the two currencies is nothing.

## The idea

The terminal is a physical object in the fiction. You are a case officer at an
Authority that requisitions equipment through forms. So: **gold buys permanent
office equipment**, filed for on a screen that reads like a supply catalogue.

The equipment is permanent — it survives death, because a desk is not buried
with the recruit who paid for it. That single property does the design work:

> Gold is temporary and dies with the recruit. Equipment is permanent. A
> requisition is the only way to move value across that line by choice.

Which gives Form R-1 the tension it currently lacks. Retire now and bank the
pension, or keep this career running because you are four hundred short of the
filing trolley. The two currencies stop being separate systems that never
speak.

## The rule

> **A requisition may add a faster path to a function. It may never be the only
> path to one.**

This is the line between an office supply catalogue and a toll booth. A bulk
"sell everything under 20 gold" button turns twelve taps into one, and the
twelve taps keep working — that is equipment. Removing navigation so it can be
sold back is not.

### Tabs are out, and this is why

The obvious first instinct is to sell screen tabs, with the command line as the
free path. It does not survive contact with the platform: on Android the free
path is *expand the command bar, wait for the software keyboard, type `ledger`,
submit, dismiss the keyboard*. No player would choose that, and every player
would notice they were being charged to avoid it. On desktop it would be a fine
idea; we are not shipping desktop first.

There is a second, duller reason. Clearance already gates tabs, and it is
monotone across death by deliberate design. Adding a gold gate on the same
control produces "I earned Ledger clearance and there is still no tab", which
reads as a bug rather than a purchase opportunity.

**Clearance keeps granting tabs.** The command line stays because some players
prefer typing — it is a power-user path, not the penalty path. That work is
done: thirteen verbs, persisted history, completion by Tab or by tapping a
chip, and an answer every time. If the command line is ever the worse option
for everybody, it has stopped being a feature and started being leverage.

## The catalogue

Every one is a tap-saver, a reading aid, or a cosmetic. None changes what the
recruit does underground, which is the test: if a requisition would show up in
the simulation harness as a different number, it is not a requisition.

### Built

| Requisition | Cost | Effect |
| --- | --- | --- |
| **Bulk Filing Authorisation I** | 900 | Sell an entire loot category on one form |
| **Bulk Filing Authorisation II** | 9000 | Also clear every stack under a unit value you set |
| **Cabinet Index I** | 700 | Sort the cabinet by value, category or demand |
| **Cabinet Index II** | 7000 | Filter to a single category, remembered between visits |
| **Extended Journal Retention I** | 600 | The Terminal opens with 150 lines instead of 60 |
| **Extended Journal Retention II** | 6000 | The Terminal opens with 400 lines |
| **Pinned Readouts** | 2500 | Depth and the permit clock follow you off the Terminal |

Costs were set by simulation, not by feel — see
[`balance.md`](balance.md#requisitions-what-happens-when-gold-finally-buys-something).
The first draft was a third of this and got cleared inside a week by two
different profiles.

Two decisions the implementation forced:

- **"Sell everything" is not expressible.** A bulk filing must name a category
  or a value threshold. A one-tap unbounded liquidation of the whole cabinet is
  a button players press by accident exactly once, and the fiction agrees:
  forms name what they are for.
- **A bulk filing confirms, and the confirmation renders under the control that
  raised it.** Built at the foot of the screen first, where it landed three
  columns below the tap that opened it.
- **Extended Journal Retention buys the opening page, not the archive.**
  Nothing in the journal is ever deleted, so capping how far back an officer
  may page would make the requisition the *only* path to older lines — exactly
  what the rule forbids. Paging is unlimited for everyone; the requisition
  saves the taps. The original copy ("keeps 150 lines") implied a deletion that
  does not happen and has been corrected.

### Designed, unbuilt

| Requisition | Effect | Notes |
| --- | --- | --- |
| **Form SO-1 Carbon Copies** | Saved standing-order presets, one-tap switching | One set of orders still in force at a time — presets are not slots |
| **Keyboard Requisition** | User-defined aliases and saved command chains | Rewritten — see below |
| **Second Monitor** | Landscape split view: Terminal beside Orders | Screen real estate, not privileged information |
| **Departmental Stationery** | Boot sequences, bezel finishes, palettes | Pure cosmetic; overlaps the phosphor prestige track, so needs a story about which currency owns cosmetics |

These four are what make the catalogue longer, which is what the balance run
says it needs — the alternative is pricing seven conveniences absurdly.

**Keyboard Requisition needed rewriting.** It was specified as selling command
history and autocomplete. Those are now free, and had to be: M2's goal is a
command line that some players *prefer*, and a version of it without history or
completion is not one anybody would prefer — it would be the penalty path,
which is the thing this document exists to forbid. What is left for it to sell
is **user-defined aliases**: naming your own shortcut for a command you type
often. The full command keeps working, so the free path stays complete and the
requisition saves keystrokes on top of it. Same resolution as Extended Journal
Retention, for the same reason.

## Questions the build answered

- **Where does it live?** A REQUISITIONS column beside PENSION, so the two
  permanent currencies sit next to each other and the distinction needs no
  explaining. On a phone the columns stack, so the feared crowding did not
  happen — what did was the tab strip, where Pinned Readouts squeezed the
  scrolling tabs. Fixed by rendering the permit chip only while a permit is
  actually processing.
- **Tiers or singles?** Tiers, on the same machinery as prestige. `offers()`
  generalised to `ladderOffers()` over any catalogue, so both currencies show
  one rung per track. Tracks are allowed to be one rung long, which is what
  Pinned Readouts is.
- **Does it break the retirement finding?** It narrows it without inverting it:
  87 → 76 pension/h for a daily retirer, and the two strategies now buy
  visibly different things. See `balance.md`.

## Still open

- ~~**Does gold need to survive death at all now?**~~ **Answered: leave the
  rate alone.** Measured over fourteen days — an officer who never spends
  pension ends with 50 gold and cannot afford a single requisition; one who
  spends it as it arrives ends with 7,926 and can afford all four tracks. The
  bridge is the prestige ladder itself: `stipend1` pays gold every tick and
  `estate1` hands a successor 120 gold of effects, so gold surviving death is
  something you *buy*. That is a better answer than a tuning constant, and it
  gives the two currencies a reason to be spent in order. See
  [`balance.md`](balance.md).
- **Is a complete office worth what it costs in pension?** The harness cannot
  answer this — it turns on how much the conveniences are worth to a person
  using them. It is the first requisitions question that needs a playtester
  rather than a run.
