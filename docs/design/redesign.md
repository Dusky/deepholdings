# Redesign: the handler game

> **Status: proposal.** No code has been changed. This document argues that the
> game's problem is structural rather than tunable, proposes a replacement, and
> says concretely what survives and what is deleted. Two constraints were fixed
> before it was written: **progression continues while the player is away**, and
> **the player is the handler, not the adventurer.** Everything else — the 1983
> terminal, the Authority, forms, permits, grades, pensions — is available to
> cut, and most of it is cut here.
>
> **Revised after research.** [`../research/reference-class.md`](../research/reference-class.md)
> examined the games this design is actually adjacent to — Lifeline, Sunless
> Sea, Darkest Dungeon, Loop Hero, Majesty, Fallen London — none of which the
> earlier research had looked at. Five amendments are folded in below and marked
> **[R]**. One of them reverses a decision (death is now a choice), and one
> answers an objection this document had not anticipated (Loop Hero's, in §4.7).
> That note also raises a business-model question this document cannot settle.

## 1. The diagnosis

The engineering is not the problem. Lazy resolution against a tick watermark,
deterministic seeding on `(character, tick)`, storage behind a port with two
adapters, migrations that refuse to auto-run in production — that is a well-built
asynchronous game server, and almost all of it survives this document.

The problem is the shape of the game sitting on it, and it can be stated in one
line:

**The player sets a policy, the policy is applied to a stream of interchangeable
events, and the result is a scalar.**

A policy over homogeneous events has exactly one optimum. The player either
finds it or is playing wrong. There is no third state, and no amount of content
added on top changes that — which is precisely the history this repository
records.

### The evidence is already ours

`docs/design/balance.md` is an unusually honest measurement log, and read as a
whole it is a document about a design fighting its own shape:

- **The controls are mostly scenery.** Sweeping the retreat threshold found that
  "everything from 35 to 80 is one setting", and below 10 the ordering stops
  being monotonic because the recruit dies before reaching anything to lose. A
  control that ran 5–80 meant something across about twenty of those points, and
  the fix was to shrink the slider until the dead zone was off it.
- **Depth was already solved and nobody could tell.** "Greedy should pay better"
  turned out to be false — depth paid handsomely all along; one of the three
  knobs bundled into that profile was wrong. Three knobs moving together, and
  the player had no way to attribute an outcome to any of them.
- **Every reward lands on the same two numbers.** The roadmap says so in its own
  words: three separate attempts at a build decision — the 80-clause pool, Tier
  III licences, the Commendation repair — "each improved pacing while failing to
  produce a build decision worth more than single digits, because every reward
  in this game lands on the same few numbers and those are bounded by depth,
  grade and the caps."
- **The game ended itself and nothing noticed for months.** `maxHpForLevel`
  scaled with grade while damage scaled with depth, so past Grade ~26 nothing
  could kill the recruit; death was the only pension source; progression stopped
  on day 14. Deaths per fortnight read 8, then 0, then 0.
- **Three separate times, a surprising number turned out to be about the
  instrument rather than the world.** That is the signature of a system whose
  behaviour no human can hold in their head, being probed by proxy.

None of those are bugs in the ordinary sense. They are what happens when the
only thing a player can do is bias a distribution, and the only feedback is a
mean.

### The costume became the content

There are 528 lines of glossary and 897 lines of tuning explaining a game whose
only verb is *wait*. The bureaucratic frame — forms, filings, permits,
clearances, commendations, requisitions, licences — was funny once, and it has
become the mechanism by which more systems get added without any of them
changing what the player does. Each new form is a new multiplier with a joke
attached.

The writing itself is good, and `flavor.ts` knows exactly why it is good: *"the
form is funny because the corridor is real."* That instinct is correct and it is
kept. What is cut is the machinery, not the voice.

### Three laws the replacement has to obey

Derived directly from the failures above. Any proposal that breaks one of these
rebuilds the same game.

1. **Rewards must not all be commensurable.** If everything converts to gold,
   a best answer always exists. The game needs at least two goods that cannot
   be exchanged for each other.
2. **The right answer must change.** A standing setting is scenery — our own
   sweep proved it. Decisions must attach to specific situations with specific
   stakes.
3. **The player must be able to be wrong in an interesting way.** Today you can
   only be suboptimal. There is no ruling that seemed right, went badly, and
   taught you something you can say out loud.

---

## 2. The replacement, in one idea

> **The adventurer is consumable. The dungeon is permanent. What you learn about
> it is the progression, and it lives in the player rather than in a save file.**

You are not tuning an output. You are running an expedition into a specific
place, through a specific person, on imperfect information, and the thing that
accumulates across a hundred hours is *your own understanding of what is down
there*.

That single move satisfies all three laws:

- Knowledge cannot be bought with money and money cannot be bought with
  knowledge — two goods, no exchange rate (law 1).
- Knowledge unlocks **options**, not rates. Knowing the drowned choir trades for
  silver makes "offer silver" a thing you can say; it does not make anything
  15% better. What you should do changes because what you *can* do changed
  (law 2).
- A ruling made on a frightened person's inaccurate report can be sincerely
  wrong, and afterwards you can name the mistake (law 3).

It also keeps both sacred constraints, and strengthens the second: the handler
premise stops being a framing device and becomes the mechanic. A handler's job
is judgment on partial information, which is exactly what the current game does
not contain.

---

## 3. The loop

**While you are away:** your adventurer descends. Ticks resolve exactly as they
do now — same architecture, same determinism, same catch-up clamp. Offline
progression is untouched.

**What accumulates is not numbers but situations.** A situation is a specific
thing that happened, with courses of action attached and consequences that do
not all land in the same currency.

Two kinds, and the split is what protects offline play:

- **Live situations** resolve immediately, without you, according to your
  standing doctrine and the adventurer's own judgment. These are the bulk. They
  are what makes the game play itself competently in your absence.
- **Standing situations** are rarer and heavier — a sealed door, a bargain
  offered, whether to go on with one lamp. The adventurer *waits* for your
  ruling. Not forever: after a while they decide on their own, and which way
  they go depends on who they are and how much they trust you.

**When you check in:** you read the dispatch — an account of the shift, in their
voice — and you make one to three real rulings. Then you send it back down.

The game is never worse for your absence. It is less *yours*.

### Why the delay is the premise, not a concession

The frame is **correspondence**. You are above; they are a mile below; a message
takes hours to reach them. Every complaint an incremental game normally answers
with an energy meter — *why can't I just play faster* — is answered here by the
fiction. You cannot micromanage someone you can only write to.

This is the one place the async architecture and the story want the same thing,
and the current design gets no credit for it because a permit queue is not a
reason, it is a delay with a form number.

---

## 4. The systems

### 4.1 Doctrine — replaces standing orders

Not sliders. A small set of standing instructions in plain language, of which
you may hold only a few at once:

> *Never split from the light.*
> *Buy information at any price.*
> *If it speaks, don't kill it.*
> *Bring the bodies back.*
> *Nothing sealed gets opened.*

Doctrine is what the adventurer falls back on in live situations. Three
properties the four dials never had:

- **It is a commitment, not a bias.** It closes outcomes as well as opening
  them. "If it speaks, don't kill it" will cost you a fight you would have won.
- **Doctrines conflict**, and which one wins tells you something about your
  adventurer.
- **It is interpreted by an imperfect person.** You do not get compliance, you
  get their reading of it. This is the mechanic the four dials could never
  contain, because a number cannot be misunderstood.

Doctrines are also *learned*: "nothing sealed gets opened" is a meaningless rule
until you find out what is behind a seal.

### 4.2 The adventurer is a person

Small, legible state — four things, all of which the player can hold in their
head, which is the opposite of the current stat block:

- **Nerve.** Depletes with fear and injury, restores with rest and with rulings
  that turn out well. Low nerve makes them retreat early, refuse instructions,
  and — importantly — *shade their reports*.
- **Trust in you.** Rises when your rulings work, falls when they don't, falls
  hardest when you leave them standing at a door waiting for an answer. Low
  trust means loose interpretation of doctrine and more unattended decisions
  going their own way.
- **Traits**, a couple per recruit, drawn at intake — greedy, superstitious,
  kind, proud. They change how doctrine is read and what gets chosen without
  you.
- **Skills that grow by use**, named rather than numbered: *knows the flooded
  galleries*, *can read the old script*, *the choir will speak to her*.

The consequence worth stating on its own: **dispatches are not necessarily
true.** A frightened or resentful adventurer files a report that is wrong in
characteristic ways. Learning to read the person is a second skill on top of
learning the dungeon, and it is content that costs nothing to generate because
it is already implied by the state above.

### 4.3 The dungeon is a place, not a difficulty axis

Floors 1–12 with `depth^1.5` on the reward and `depth^1.4` on the damage is not
a location, it is a slope with a number on it.

Replace it with **named regions that are true about themselves** — hazards,
inhabitants, and facts that hold. The flooded gallery drowns anyone who goes in
armoured. The thing on the fourth level trades rather than fights. These are not
modifiers; they are propositions the player can learn, be wrong about, and act
on.

Generated from an authored vocabulary rather than hand-placed everywhere —
`flavor.ts` already does grammar-driven generation well and already knows the
rule that keeps it from reading as filler (generate the encounter, write the
loot). Same discipline, applied one level up.

**And the dungeon persists across adventurers.** A door your last recruit opened
stays open. A bridge they cut stays cut. A faction they wronged remembers who
sent them. The dungeon is the campaign; the people you send into it are not.

### 4.4 The casebook — where progression actually lives

Everything you learn is recorded, and it is the only thing that never resets.

It is not a stat sheet. It is a list of facts, and each fact turns into an
**option** somewhere:

| You learn | What changes |
| --- | --- |
| The choir trades for silver | "Offer silver" appears where only "fight" and "withdraw" existed |
| The seal-script | "Read it" appears at sealed doors |
| The gallery drowns the armoured | Your standing instruction about the gallery can finally be right |

No rates. No multipliers. No tier. This is what replaces nineteen unlocks and
seven requisitions, and it is strictly better on the axis the roadmap was
worried about: facts are cheap to write, combine with each other, and a player
who has read them all has *actually learned something*, which is the one form of
progression a competitor cannot grant with a bigger number.

### 4.5 Death is a choice — **[R]**

Harsh again, and finally meaningful.

Death costs you the **relationship and the skills** — the nerve, the trust, the
traits you had learned to work with, the fact that she could talk to the choir.

The first draft of this document then had the casebook survive automatically,
because it is *yours* rather than theirs. Research says that is the weaker
design. Sunless Sea shipped this exact mechanic a decade ago and made it a
**decision**: when a captain dies you choose what relationship the next one had
to them, and therefore what they inherit — the Correspondent legacy hands over
"the entirety of their discovered chart", which is precisely our casebook.

So: at a death you choose who the next adventurer is to the last one.

| Legacy | They inherit |
| --- | --- |
| **Correspondent** | the casebook — everything you had written down |
| **Pupil** | their skills and something of their temperament, but not the book |
| **Creditor** | the money, and the debts |
| **Rival** | the grudge, and one thing the dead one had been hiding from you |

Giving up the casebook has to be genuinely tempting, or this is a menu with one
real item. That is a tuning problem, and it is a much better one to have than an
automatic transfer that turns death into something that merely happens to you.

A new adventurer then arrives knowing whatever you chose to give them while you
know everything, and the opening of a career is you teaching them the rest. It
is fast, because you can hand them the book. It is different, because they are a
different person and your doctrines land differently on them.

**Delete the pension entirely.** Delete the unlock tree. The prestige currency
existed to move value across the death line; the casebook already crosses it,
for free, and without the design's worst recurring bug — the one where death
became profitable and had to be nerfed from 571/h to 70/h.

### 4.6 Money is a constraint, not a score

Thin and deliberately unexciting. You fund expeditions: supplies, lamps,
equipment, someone's fee. Money buys **attempts**, not power. Running dry means
you cannot send anyone down until what came back is sold.

That gives failure a texture — a bad month is a real setback you can feel —
without a currency treadmill, and it keeps law 1 intact: no amount of money
buys a fact or buys trust.

### 4.7 Why caution does not win — **[R]**

The strongest objection to this whole design comes from Loop Hero, which shares
its premise — you shape a run you do not directly control — and drew this
critique:

> Because you have no direct control over your character, you always want to
> play it safe, which reduces both the number of viable ways to play and which
> cards you take.

That is the failure mode. If a player cannot rescue a situation once it turns,
the rational response is to never let it turn, and a game about judgment
collapses into a game about caution. **We have already lived this**: the retreat
slider swept as one setting from 35 to 80 because safety was free.

Two mechanisms, and the design is not finished without both.

- **The casebook only fills in where you do not already know.** Safe work in
  charted ground earns money, and money is a constraint rather than a score.
  A cautious officer therefore stops progressing on the only axis that
  compounds — and can watch it not happening, which is the part that makes it a
  decision rather than a punishment.
- **One intervention per shift.** A recall, or a message that reaches them out
  of band, at real cost. Its purpose is not rescue; it is *permission*. A player
  who holds a rescue is a player who will risk something, and choosing when to
  spend it is itself the decision the retreat slider never was.

### 4.8 The check-in, concretely — **[R]**

Two independent sources land on the same cadence. Kittens Game asks for a
meaningful decision roughly **once an hour** and is credited with depth for it
rather than slowness. Lifeline wrote its waits to match how long the activity
would plausibly take — an hour early on to set expectations, shorter later to
signal urgency.

So: the tick stays a minute internally, situations accumulate into **shifts of
about an hour**, and two or three check-ins a day is a complete experience
rather than a compromise. Waits are written to fit what is being done, which
makes the pacing diegetic instead of a schedule.

**And the ruling must be answerable from the notification itself.** Not a
notification that opens the app — the decision, in the banner, answered from the
lock screen. Lifeline built its entire game on that and reported 81% day-one
retention. It is the highest-leverage retention feature available to us and it
constrains the content format — two or three options, short enough to read in a
banner — so it belongs here rather than in a mobile milestone.

### 4.9 Situations are data, not code — **[R]**

Fallen London's Quality-Based Narrative is the proven architecture for exactly
this shape: the world is a bag of **storylets**, each gated on requirements over
player **qualities**, and the game offers what you currently qualify for.

Casebook facts are qualities. Traits are qualities. Doctrines are qualities.
Region state is qualities.

The consequence worth stating: **content ships without a deploy**, and a
situation's requirements are inspectable, which is what makes the divergence
test in §6 measurable rather than anecdotal. Build the engine — StoryNexus, the
platform Failbetter opened for this, shut down in January 2026.

---

## 5. What survives the change

The infrastructure is genuinely good and nearly all of it stays.

**Kept, unchanged:**

- Lazy resolution against `last_resolved_tick`, the catch-up clamp, and the
  transaction discipline that stops double resolution. Situations are generated
  per tick exactly where encounters are generated now.
- Deterministic seeding on `(character, tick)`. This becomes *more* important,
  not less: a dispatch a player argues with has to be replayable.
- The storage port and both adapters, migrations and the runner, auth, rate
  limiting, idempotency, the error port, heartbeat and health.
- The client application, build, and Capacitor wrapper.
- The simulation harness (`simulate.ts`, `longrun`, `forecast`) — retargeted at
  new questions in §6. **This is the most valuable thing in the repository after
  the resolver architecture**, and the measurement culture around it is why this
  document could be written from evidence rather than opinion.
- The register rule in `flavor.ts`. The voice was never the problem.

**Cut,** with rough sizes so the scale is not a surprise:

| Area | Goes | Lines |
| --- | --- | --- |
| `shared` | `tuning.ts`, `glossary.ts`, `staff.ts`, `assignments.ts`, `transfer.ts`, `forms.ts`, `guild.ts`, `forecast.ts`, most of `items.ts` | ~3,000 of 4,000 |
| `server/domain` | `filings`, `caseFiles`, `clearance`, `staff`, `guidance`, `world`/guild, and the *rules* inside `resolve.ts` (its structure stays) | ~1,500 |
| Concepts | permits, grades, pensions, 19 unlocks, 7 requisitions, licences, commendations, case files, sites, the five standing-order dials | — |
| `server/test` | whatever tested the above | a large share of 6,600 |
| Client | the six screens, the CRT shell, the bureaucratic vocabulary throughout | most of 5,400 |

Honestly stated: **roughly 12–14k of ~22k lines is deleted.** This is a rewrite
of the game with the server architecture kept, not a refactor. It should be
described that way to anyone who asks.

---

## 6. How we would know it is working

This project's habit of measuring instead of arguing is its best one, and the
new design needs new instruments — the old ones measure gold per hour, which
this game does not care about.

- **Divergence (the decisive test).** Two simulated players, same dungeon seed,
  different rulings, one week. Their casebooks and their dungeon states must end
  materially different. *If they converge, we have rebuilt the same game and
  should stop.* This is cheap, headless, and worth building before anything else.
- **Decision weight, per situation.** For every situation, the spread of outcomes
  across its options. A situation whose options land within noise is scenery —
  the exact test that condemned the retreat slider, now applied to content
  before it ships rather than a year after.
- **Answer rate.** What share of standing situations get a real ruling versus
  timing out. Too high and the game is nagging; too low and the rulings are not
  actually the game.
- **Novelty, retargeted.** Keep the `longrun` cadence harness, but count *facts
  learned* rather than unlocks bought. "Last new thing on day 39" becomes a
  question about the casebook, which is a content budget rather than a system
  fault.

---

## 7. Risks, stated plainly

- **This is now a writing game.** Content cost per hour of play goes up
  substantially. The mitigation is combinatorial — facts × situations × traits ×
  a person who misreports — but the mitigation is a multiplier on a number that
  still has to be written. This is the largest risk in the document, and it is
  the same risk the roadmap already named as the *content treadmill*, now moved
  to the centre of the design instead of the edge.
- **Judgment games balance badly in simulation.** The harness can prove
  divergence and decision weight; it cannot tell us whether a ruling *feels*
  like a real dilemma. This design needs a human playtest much earlier than the
  current one ever got.
- **Situations can degenerate into a quiz.** If an option is knowably best, we
  have rebuilt a dial with prose on it. The defences are non-commensurable
  outcomes and imperfect information, and both need enforcing per situation,
  which is what decision weight measures.
- **A different retention hook** — *partly retired by research.* **[R]** The
  pull becomes narrative curiosity rather than number-go-up, and this document
  originally called that unproven on mobile. It is not: Lifeline is this exact
  loop — decisions delivered and answered as push notifications, real waiting in
  between — and it briefly displaced Minecraft as the #1 *paid* game on iOS with
  a reported 81% day-one retention and 7M series installs. The hook works. What
  remains unproven is that it works **in the store category and business model
  we were planning for**, which is the next risk and a bigger one.
- **We may be changing product category, not just design.** **[R]** The
  incremental sample (CIFI, ISEPS, Tap Titans 2, Melvor) is F2P, ad-and-IAP
  funded, and sells volume of numbers. The narrative sample (Lifeline, Bury Me
  My Love, Sunless Sea) is premium or narrative-DLC and sells a story you are
  inside of. Both contain real successes at our scale; we cannot be in both.
  The roadmap's settled monetisation decision — *convenience and cosmetics, time
  skips capped and free* — was written for the first column, and in the second
  a time skip sells the player a way to skip the product. **Owner decision, not
  a research finding.** See `research/reference-class.md` §3.
- **The single adventurer may be too fragile.** **[R]** Darkest Dungeon's
  guidance is a roster of 20+ so no death cripples the campaign, and Sunless Sea
  had to *add* the Legacy system because single-captain death read as too
  punishing. This design's shock absorber is the casebook alone. That is a
  thinner cushion than either precedent, and it should be tested in Stage 0
  rather than assumed.

---

## 8. Build order

Staged so the thesis is falsifiable before it is expensive.

- **Stage 0 — prove it, headless.** One region, six situations, three doctrines,
  one adventurer with traits. No UI, no persistence beyond the harness. Run the
  divergence test. **If two different players converge, stop here** — the idea is
  wrong and we have spent a week rather than a quarter.
  Two questions ride along, both cheap once the harness exists: does a cautious
  player actually fall behind (§4.7), and is one adventurer enough of a shock
  absorber or do we need a roster.
- **Stage 1 — the spine.** Dispatch, rulings, doctrine, live vs standing
  situations, on the existing resolution architecture. One region. No economy,
  no death.
- **Stage 2 — the person.** Nerve, trust, traits, unattended decisions, and
  reports that can be wrong.
- **Stage 3 — memory.** The casebook, and a dungeon that persists across
  adventurers. Death turns back on here, because only now does it cost the right
  thing.
- **Stage 4 — money.** Funding, supplies, the sale of what came back.
- **Stage 5 — surface.** The new frame, mobile, and push, which is finally worth
  building because it finally has something to say.

## 9. Open questions for the owner

1. ~~**How long is a shift?**~~ **Answered by research** — about an hour, with
   waits written to match what is being done. See §4.8.
2. **One adventurer or several?** The roadmap's "concurrent postings" idea was
   the right instinct — allocation across several people is a decision shape
   that cannot be collapsed into a multiplier. It is also a large addition. This
   document assumes **one** through Stage 4 — but research now argues against
   that assumption from two directions (Darkest Dungeon's roster, Sunless Sea's
   legacy), so Stage 0 should answer it rather than Stage 5. **[R]**
3. **Which column are we in?** Premium narrative or F2P incremental. It
   determines the monetisation model, the store category, and how much writing
   we are signing up for. Research can only say both are winnable and we cannot
   be both. **[R]**
4. **Is doctrine the right verb, or is it bounties?** Majesty controls
   autonomous heroes with *incentives* rather than instructions — flags with
   money attached, which heroes take or ignore according to their own
   personalities. Doctrine is instructions. A bounty layer ("what this is worth
   to me") may be the better fit for someone who does not have to obey, and it
   is a small enough addition to prototype in Stage 2. **[R]**
5. **What replaces the 1983 desk?** Not specified here on purpose — art
   direction should not be settled in a systems document. The requirement it has
   to meet: reading must be the primary pleasure, and the screen should look
   like documents from a place. The desk itself was the good part of the old
   conceit and is worth keeping in some form.
