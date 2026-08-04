# What is actually in each rung

> Companion to [`redesign.md`](./redesign.md). That document argues the *shape*;
> this one fills rung one in properly and sketches the rest, because a ladder
> nobody has costed is a diagram rather than a design.
>
> **No number here is tuned.** Every figure is a placeholder with a shape — the
> harness (`simulate`, `longrun`) owns them, and this project has been burned
> before by numbers that were guesses wearing a confident face.
>
> **And nothing here is a fixed list.** The target is an *infinite* incremental
> (§3.6c), so every table below is the authored bottom of a generator rather than
> a catalogue. Six posts at rung one; post *n* is a formula. Three material grades
> here; grade *n* is a formula. A system stored as an array of hand-written entries
> terminates — which is precisely how the current game ends on day 39.

## The loop, before any upgrades

Four objects. This is the whole game at minute one, and every later rung is a
new way to bend one of them.

```
    ORB  ──cut──▶  SPOIL  ──haul──▶  DEPOT  ──process──▶  MATERIAL
     ▲                │
     └────reclaims────┘
```

- **The orb.** Centre screen. Recruits cut at its face. It is the same object at
  every scale of the ladder (§3.0).
- **Spoil.** Loosened material lying on the floor. It is *not yet yours*.
- **The orb reclaims.** Unprocessed spoil is absorbed back, at a rate rising
  with how much is lying there — exponentially. This is Gnorp's best mechanic
  and the reason the game is about **throughput rather than output**.
- **The depot.** Where spoil is counted, capped, and becomes material.

**The tension that makes rung one interesting:** cutting harder is easy and
mostly useless. A big pile is a pile the orb is eating. Almost every early
decision is really "can I move it before I lose it".

---

## Rung 0 — the Duty Roster

No reset, no currency. You assign recruits to posts. This is the allocation
layer and it never goes away; every rung above it makes this decision harder by
adding posts worth arguing about.

**Where recruits come from.** They are requisitioned. Intake is a form, arrivals
are a schedule, and where the Authority gets them is explicitly not the case
officer's concern. This is the deadpan answer to "why are there infinitely many
of these people", and it costs nothing to write.

### The tier-one posts

Six, and each is a *behaviour* rather than a stat line. Held to the rule from
[`../research/gnorp.md`](../research/gnorp.md): **change behaviour, stay
optional, synergise.**

| Post | What they actually do | Why they are not just "more output" |
| --- | --- | --- |
| **Faceman** | Stands at the face and cuts. Steady, small, constant. | The baseline. Scales by count, and the count is the multiplier (Gnorp's own rule — power scales with roster, not with purchases). |
| **Hauler** | Never touches the orb. Moves spoil to the depot. | Produces *nothing* and is frequently the correct buy. The first time a player learns the game is about throughput. |
| **Shotfirer** | Places charges. Nothing, nothing, nothing, then a large collapse. | Burst instead of trickle. Brings down more per hour than a faceman **and can be a net loss** without haulage to clear the spike before reclamation eats it. |
| **Borer** | Cuts *into* the orb rather than at its face. Opens chambers. | Zero immediate yield. Chambers are what unlock depth, and depth is where better material grades live. The first buy that is an investment rather than a rate. |
| **Rook** | Works the spoil heap itself — re-crushes and recovers what the orb is reclaiming. | **Useless until you are failing.** Only pays when the pile is large, which makes it the counter-play to over-cutting rather than an upgrade to it. |
| **Battery** | A static installation. Fires at the orb on a cycle. Occupies no roster slot once sited. | The first automation: output that does not consume the scarce resource, which is *attention and slots*. |

Read the interlock, because it is the point:

- Shotfirers make haulers necessary.
- Haulers make rooks unnecessary — until you over-cut, and then rooks are the
  cheapest recovery.
- Borers pay nothing now and gate everything later.
- Batteries buy back a roster slot, which is what makes them worth more than
  their raw numbers.

**None of the six is mandatory.** A player can run facemen-and-haulers to the
first Discharge and it works. That is the "optional" clause doing its job.

### Material grades — the lattice starts here

The depot does not produce one number. It produces three, and they are not
interchangeable:

| Grade | Where it comes from | What it feeds |
| --- | --- | --- |
| **Rubble** | any cutting, in bulk | construction: buildings, depot capacity, haulage |
| **Ore** | the face, at moderate depth | equipment: recruit kit, batteries, tools |
| **Vitric** | chambers only, deep | everything that matters later — the good grid rows, and rung two |

That is `redesign.md` §3.2 at its smallest honest size: three chains, three
caps, and a reason to care which one is binding. Vitric being **borer-only**
is what makes the post that produces nothing the one you cannot skip.

---

## Rung 1 — Discharge · a flat purchase grid

**Currency: Service.** Earned by a recruit's whole career, banked when you
discharge them deliberately.

A flat catalogue. One-off buys, nothing exclusive, always something affordable —
this rung must never be able to trap a new player. Roughly six rows, each with
several tiers:

| Row | Buys |
| --- | --- |
| **Intake** | unlock each post type; later tiers raise the grade recruits arrive at |
| **Establishment** | roster slots — the headline number, and the one power scales with |
| **Depot** | storage caps per grade. A Kittens-style wall: you cannot afford the thing because you cannot *hold* enough |
| **Haulage** | movement rate, and how much spoil the floor tolerates before reclamation bites |
| **Ordnance** | battery sites and cycle rate |
| **Registry** | the first `staff.ts` automation — a clerk who files under a standing instruction you set |

**Registry is the row that is a verb rather than a rate**, and by §3.4's test it
is the only one of the six that fully earns its place. The other five are honest
rates, which is correct *for the first rung* — the flat grid's job is to teach
spending without punishing it. The rungs above are where rates stop being
allowed.

---

## The rungs above, in one line each

Detail belongs in the stage that builds them; this is the shape.

| Rung | Currency | Mechanic | What it actually contains |
| --- | --- | --- | --- |
| **Reassignment** | Seniority | exclusive tree | Mutually exclusive branches — *Extraction* (cut faster, spoil more), *Throughput* (haul and process), *Prospect* (chambers, depth, vitric). You cannot take all three, so postings diverge. |
| **Commission** | Clauses | equippable rolls | The existing clause catalogue: 80 clauses, six dimensions, endorsements and riders. Roll them, hold a few, Form 12-C rerolls one. **Already built.** |
| **Statute** | Precedent | a compiler | Standing instructions you author: *if spoil > X, pull two facemen to haulage.* The `staff.ts` principle handed to the player. |
| **Enclosure** | Title | placement | Shells sited around a star, consuming the entire lattice below as feedstock. |

---

## What the orb worshippers are for

Not colour. They are the **restriction engine** — `assignments.ts` is Antimatter
Dimensions challenges, and challenges need a reason for the rule to change.

> *An objection has been received regarding the disassembly of the orb. Pending
> review, the following are suspended: ordnance, shotfiring, and work on the
> fourth quadrant.*

A challenge is now a diegetic event rather than a menu item, it pays
Commendations, and the joke writes itself: the Authority receives, logs, and
overrules theological objections **on a schedule**. Zero art cost, and it is the
same trick at every scale — by the Enclosure rung the objection is to fencing a
star, and the form has not changed.

---

## What to build first

Rung 0 and the four objects, headless, and nothing else. The question Stage 0
asks is whether **allocation across six posts against a reclaiming pile**
produces divergent play — because if the answer is "always buy haulers", the
lattice is decoration and the ladder above it is worthless.

That is one week and it can kill the design, which is the point of it.
