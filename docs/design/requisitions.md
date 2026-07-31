# Requisitions — buying the interface with gold

**Status:** designed, not built. Targeted at M4 (it fixes an M4 balance
finding) with the screen landing alongside the upgrades UI.

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
prefer typing — it is a power-user path, not the penalty path, and M2 now
carries the work to make it genuinely good (history, autocomplete, more verbs
than navigation). If the command line is ever the worse option for everybody,
it has stopped being a feature and started being leverage.

## The catalogue

Costs are placeholders until the sim says otherwise. The shape that matters:
tier one of anything is roughly one good career, and the list is long enough
that no single career clears it.

| Requisition | Effect | Notes |
| --- | --- | --- |
| **Bulk Filing Authorisation** | Sell all stacks below a threshold, or a whole category, in one filing | The single biggest tap-saver once the cabinet is large |
| **Cabinet Index** | Sort and filter the cabinet by value, category, demand | Reading convenience; changes nothing about contents |
| **Form SO-1 Carbon Copies** | Saved standing-order presets, one-tap switching | One set of orders still in force at a time — presets are not slots |
| **Keyboard Requisition** | Command history, autocomplete, aliases | Deliberately makes the *free* path better |
| **Second Monitor** | Landscape split view: Terminal beside Orders | Screen real estate, not privileged information |
| **Pinned Readouts** | Persistent gold/supplies/permit strip | Same numbers, fewer taps |
| **Departmental Stationery** | Boot sequences, bezel finishes, palettes | Pure cosmetic |
| **Extended Journal Retention** | Keep more than the last 60 lines | Pairs with journal pagination |

Every one is a tap-saver, a reading aid, or a cosmetic. None changes what the
recruit does underground, which is the test: if a requisition would show up in
the simulation harness as a different number, it is not a requisition.

## Open questions

- **Where does it live?** The Ledger already has a PENSION column that is
  permanent and pension-priced. A REQUISITIONS column beside it — permanent and
  gold-priced — is the obvious answer, and makes the two currencies legible by
  sitting them next to each other. Risks crowding a screen that already has
  four columns on a phone.
- **Tiers or singles?** Prestige uses three-tier ladders. Some of these tier
  naturally (cabinet index → index with saved views) and some do not (a second
  monitor is a second monitor).
- **Does it break the retirement finding?** It should *narrow* the gap by giving
  income a purpose, but it could overshoot and make never-retiring correct
  instead. Re-run the harness with a requisition-buying profile before
  committing to costs.
- **Does gold need to survive death at all now?** Currently 40% of the estate
  converts to pension. If requisitions are the intended sink, that rate may be
  too generous — it competes with the sink it is supposed to feed.
