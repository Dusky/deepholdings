# Genre cues: what the successful idle games actually do

Research note, July 2026. Companion to [`idle-hacking.md`](./idle-hacking.md),
which is a deep read of our closest analogue. This one looks for patterns
across the games that have already won, and treats agreement between them as
signal.

## The sample

| Game | Reviews | Score | Model | Platforms | Known for |
| --- | --- | --- | --- | --- | --- |
| [NGU IDLE](https://store.steampowered.com/app/1147690/NGU_IDLE/) | 10,796 | 96% Overwhelmingly Positive | Free | Steam, browser | Humour, enormous layered content |
| [Unnamed Space Idle](https://store.steampowered.com/app/2471100/Unnamed_Space_Idle/) | 2,878 | 92% Very Positive | Paid | Steam | Best-in-genre QoL and pacing |
| [Melvor Idle](https://store.steampowered.com/app/1267910/) | ~30k | Very Positive | Paid + expansions | Steam, **mobile**, browser, cloud sync | Breadth, genuine mobile client |
| [Idle Hacking](https://store.steampowered.com/app/4453290/Idle_Hacking_An_Inaction_RPG/) | 223 | 82% Very Positive | F2P + ~$5/mo | Steam, browser | Text-based idle MMO — our analogue |

Playtimes in the Steam review API are **minutes**; everything below is
converted.

---

## Where all four agree

These are the load-bearing findings. When a 10,000-review game and a
200-review game fail or succeed for the same reason, that is a design law.

### 1. Offline generosity is table stakes, and never a product

Unnamed Space Idle is praised in almost these words: *"There is no unnecessary
offline cap."* You get a full day free, four days if you spend in-game points
on the quality-of-life unlock — **bought with game currency, not money.**

Idle Hacking sells extended offline progression on a ~$5/month subscription
and takes steady flak for it: the perception that "true idling requires
payment."

> **Rule for us:** catch-up is never sold. It is the promise of the genre, and
> charging for it is charging players to undo a punishment we invented. This
> is already product goal #3; the market confirms it.

### 2. Reveal the machine slowly

This is the single strongest pattern in the corpus, and it cuts both ways.

USI's most-praised quality: *"systems are constantly expanding through the
entire experience… relatively contained in an understandable UI that isn't
throwing too much at you at once."* NGU does the same over hundreds of hours.

Idle Hacking's hundred-hour churn is the exact inverse: *"you kind of have
access to everything from the jump… just grinding for grinding's sake."* And
its half-hour churn is the same disease at the other end — *"overwhelming
interface from the start with no clear direction."*

**Everything unlocked at once is simultaneously the onboarding problem and the
endgame problem.**

> **Rule for us:** the five tabs should not all be there on day one. Start on
> the Terminal. Earn the Ledger, the Tavern, the Bulletin. We have the perfect
> in-fiction mechanism for this already — clearance. A case officer is not
> issued the market ledger on their first day; they are issued a permit and a
> recruit, and the rest arrives as their file thickens.

This one idea fixes the two biggest churn causes in the genre at once, costs
almost nothing to build, and is funnier than what we have now.

### 3. Many small rungs, never a wall

USI, approvingly: *"progress milestones are smaller, but less spaced out.
Basically, there's less 'ruts'."* Its main complaint is the opposite —
midgame stretches *"requiring weeks of incremental gains"*, and late content
*"locked behind months of grind."* NGU's complaints are the same shape
("sadistic difficulty is a rushed, huge mistake").

> **Rule for us:** something visible should move every session. Our permit
> ladder is the right structure; the tuning needs to keep the next rung close.
> A multi-week wall is a churn event with a countdown on it.

### 4. Tone is a moat

NGU Idle's top-cited quality after progression is the writing — *"so many
funny texts, messages, memes"*. Idle Hacking's reviewers praise its text
presentation as *"a distinct personality"* despite minimal visuals.

Nobody says this about Melvor, whose complaint is *"just timers"* with *"NO
presentation"* and no narrative.

> **Rule for us:** the deadpan clerical voice is not decoration, it is the
> differentiator, and it is the one thing a better-funded competitor cannot
> copy convincingly. Budget writing time in every milestone.

### 5. Prestige has to be legible before it is reachable

USI's complaint list includes *"not immediately obvious when/why to prestige
early on."* This is a recurring genre failure: the reset loop is the engine,
and players fear it because nobody explained that losing is how you progress.

> **Rule for us:** death is our prestige. A new player must understand, before
> their first recruit dies, that dying banks a pension and pensions are
> permanent. The Bulletin's death feed is doing that work already — make it
> explicit in the first session.

### 6. Numbers must stay human

A real USI complaint: scientific notation *"alienates casual players."*

> **Rule for us:** we are a bureaucracy, not an exponent farm. Gold in the
> hundreds and thousands, permits in tiers, pensions in round numbers. Never
> ship `1.4e12`. This is an accidental advantage of the theme — protect it.

### 7. Mobile and sync are undersupplied

Melvor's mobile app plus cloud sync draws unprompted praise: *"Great that this
has a version on steam, a phone app, and browser with cloud syncing."* Idle
Hacking's mobile web is dismissed: *"playing on the mobile is a no go."*

Melvor also carries the genre's classic wound — *"randomly lose progress"*,
save corruption. Our state is server-side by construction, so the save can't
rot on the device.

> **Rule for us:** Android-native and server-authoritative is a genuine market
> position, not just an implementation detail. It belongs in the store listing:
> *the idle game that is actually good on a phone, and can't eat your save.*

### 8. Automation is the reward, not the chore

USI sells automation *to the player, for game currency* — it is the shape of
progression itself. Idle Hacking's daily contract cadence is the opposite:
*"queue for an event every 3 hours"*, which reviewers experience as an
obligation.

> **Rule for us:** standing orders are already an automation system. Deeper
> automation (conditional orders, more slots) is the natural upgrade ladder.
> An extra standing-order slot is convenience *and* power. Selling it edges
> toward pay-to-win; earning it does not. **Settled: earned only.**

---

## What not to copy

- **Daily login obligations.** "2–3 daily logins for optimal progression"
  converts a relaxing game into a chore with a schedule.
- **Everything visible on day one.** See above; it is the genre's most common
  fatal mistake.
- **Paywalled idling.**
- **Unmoderated global chat with a visible wealth hierarchy.** Idle Hacking has
  negative reviews from a 451-hour player purely about "whale overlords."
- **Opaque tooltips.** Every complaint list includes them. If a stat exists, it
  explains itself.
- **Scientific notation.**

## Roadmap changes applied

From this note and `idle-hacking.md`:

- **M2** — first-session onboarding, and progressive disclosure of the five
  screens.
- **M3** — legible permit ladder; milestone cadence with no multi-week walls;
  prestige legibility ("death is progress") before the first death.
- **M4** — moderation non-negotiable; no public wealth display in the tavern.
- **M5** — catch-up never sold; automation earned by default.
- **Cross-cutting** — numbers stay human; never ship scientific notation.

Both questions this note left open have since been decided, and are recorded in
`ROADMAP.md`'s Settled table rather than here:

- **Gear/affix crafting** — build it, as Requisition & Arbitration. Shipped:
  items, clauses and Forms 12-C, 19 and 4-E.
- **Standing-order slots** — earned only, never purchasable. More concurrent
  policy is power, not convenience.

## Caveats

- Steam reviews skew toward the engaged and are not a revenue signal. None of
  these games publish earnings.
- The Idle Hacking sample is small (223 reviews) and young (launched March
  2026).
- Review-API payloads are samples, not the full corpus; I read ~100 recent
  reviews per game plus the top-rated pages.
- Melvor's review count is approximate.

## Sources

- [NGU IDLE on Steam](https://store.steampowered.com/app/1147690/NGU_IDLE/)
- [Unnamed Space Idle on Steam](https://store.steampowered.com/app/2471100/Unnamed_Space_Idle/)
- [Melvor Idle on Steam](https://store.steampowered.com/app/1267910/)
- [Idle Hacking: An Inaction RPG on Steam](https://store.steampowered.com/app/4453290/Idle_Hacking_An_Inaction_RPG/)
- Steam review API (`store.steampowered.com/appreviews/<appid>`), July 2026
