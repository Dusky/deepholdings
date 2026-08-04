# Research: the reference class, and why the old one was wrong

> Companion to [`../design/redesign.md`](../design/redesign.md). Covers the five
> games named by the owner (CIFI, ISEPS, Tap Titans 2, Kittens Game, Melvor
> Idle) plus the set the existing research never looked at. It ends with
> concrete amendments to the redesign, one of which reverses something in it,
> and one strategic question that is above my pay grade.

## Why this note exists

The four existing research notes sample eight games: NGU IDLE, Unnamed Space
Idle, Melvor Idle, Idle Hacking, CIFI, ISEPS, and glances at two more. Every one
of them is a **number-go-up incremental**. That was the correct reference class
for the game we had.

It is the wrong reference class for the game proposed in `redesign.md`, and
reading those notes back against the new design shows the seams immediately.
`genre-cues.md` finding 5 says *"prestige has to be legible before it is
reachable"* and answers it with *"death is our prestige — a new player must
understand that dying banks a pension."* The redesign deletes the pension. The
finding is still true; the answer it was given no longer exists.

So this note does two jobs: research the five named games, and go find the
games that are actually adjacent to what we are now building.

---

## Part 1 — the five named

### CIFI and ISEPS (already in the repo)

Both are covered in [`mobile-incrementals.md`](./mobile-incrementals.md) and I
have not re-researched them. The summary that matters here: both by Octocube
Games, both Play-native, CIFI holds the r/incremental_games Best Mobile
Incremental award for 2023, 2024 and 2025, and **both sell volume of numbers** —
"thousands of upgrades, multiple prestige systems, months or years of
progression."

That note's central warning is worth restating because the redesign makes it
sharper, not softer:

> Deep Holdings' product goal — *numbers stay human, never ship scientific
> notation* — is a deliberate rejection of the thing the category winner's store
> page leads with. It should be held as a bet, not a principle.

The redesign doubles that bet. See Part 3.

### Tap Titans 2 (Game Hive)

The odd one out on the list, and useful precisely because it is.

Its progression is conventional — prestige for Hero Souls, spend relics on
artifacts, keep skill points and artifacts through the reset. What is unusual is
**where its retention actually comes from**: clans, clan raids against boss
titans with their own combat system, clan technologies that buff members, and
tournaments. The single-player number climb is the substrate; the reason people
are still there after a year is other people.

The criticism is equally consistent: pay-to-win in the competitive layer,
tournament placement effectively purchasable, and free progression that
"requires playing like a full-time job." Reviewers converge on *"if you care
about relative power or tournament placement, avoid this game."*

**What to take.** One thing, and it is strategically important. TT2 is the
sample's only game whose primary content engine is **other players rather than
authored content**. Given that the redesign's largest stated risk is that it
becomes a writing game, TT2 is the named alternative: social and competitive
systems scale without a writer. `progression-depth.md` finding 4 reached the
same conclusion independently — *"other players are the cheapest content."*

**What to refuse.** All of the monetisation, and the tournament layer
specifically. A competitive ladder in a game about judgment on imperfect
information would immediately produce a metagame of optimal rulings, which is
the exact failure the redesign exists to escape.

### Kittens Game

The most relevant of the five by a distance, and the one whose lesson is
directly actionable.

Its structure: resources that feed each other, a calendar of seasons that change
production, kittens with assignable jobs, happiness, storage caps that
deliberately gate goals, challenges, and a two-layer reset (Paragon, then
Bloodline). The thoughtful write-ups converge on two observations:

1. **Pace.** It asks for a *meaningful decision roughly once an hour*, not
   constant clicking. One essay calls the whole game "a meditation on the nature
   of exponential growth," and credits the slow pace and "numerical austerity"
   with forcing players to actually understand the mechanics rather than watch
   them.
2. **Storage as a deliberate obstacle.** You repeatedly cannot afford a goal not
   because you lack income but because you cannot *hold* enough. That converts a
   waiting problem into a planning problem, which is a decision.

It is also famously opaque, needs no tutorial by one account and is impenetrable
by others, and that split is itself the finding: the depth and the churn come
from the same property.

**What to take.** The cadence. One meaningful decision an hour is almost exactly
the rhythm the redesign wants, and it is evidence that a slow game is not
automatically a thin one. This resolves open question 1 in the redesign — see
amendments.

**What to refuse.** The opacity. Kittens Game can afford to be unexplained
because it is free, browser-based, and its audience self-selects hard. A Play
listing does not have that luxury, and `idle-hacking.md` already measured where
competitors lose players: the first thirty minutes, to the interface.

### Melvor Idle

29 skills — 9 combat, 20 non-combat — with a Mastery layer per skill: every
action grants Mastery XP toward that specific item or action, plus a Mastery
Pool that accelerates the rest of the skill. The Mastery system was *completely
rebuilt* after launch because, in the developers' own framing, the original's
sense of progression was sub-par. Median ~384h to completion, ~1,500h to 100%.

Its depth is **breadth**: mining feeds smithing feeds combat. No single number
goes to 100. `progression-depth.md` already drew the right conclusion from this
— longevity comes from adding systems, never from lengthening the primary scale.

The criticism that matters for us is the one `genre-cues.md` already recorded:
Melvor is *"just timers"* with *"NO presentation"* and no narrative.

**What to take.** Very little, and that is the finding. Melvor is the **inverse
of the redesign**: maximum system breadth, zero narrative. It succeeds anyway,
which proves the axis is real — but it is a demonstration of the road we are
choosing not to take. Its one transferable lesson is that a rebuilt progression
system shipping post-launch is survivable and sometimes necessary.

---

## Part 2 — the games the research never looked at

This is the part that changes the design. None of these are incrementals. All of
them are much closer to what `redesign.md` proposes than anything in the
existing sample.

### Lifeline (3 Minute Games, 2015) — the single most important find

A text-based game where you advise Taylor, a stranded astronaut, entirely
through **push notifications answered from the lock screen**. You wait in real
time. Taylor goes off to do something and messages you back in an hour. You
cannot rush it.

- Briefly displaced Minecraft as the **#1 paid game on iOS**, first week of May
  2015, and was the #1 title on the just-released Apple Watch.
- ~7 million installs across the series by 2019, seven sequels.
- **81% day-one retention.**

The design postmortem says two things almost verbatim from the redesign:

> "What makes notifications compelling enough to draw a player back into the
> game is when they're tied to making interesting decisions." — designer Mars
> Jokela

And on pacing: waits were written to match *how long the activity would
plausibly take*. An hour-long gap early on sets the player's expectation;
shorter gaps later signal escalating urgency; long gaps before critical
decisions build tension. Player absence was designed as a feature — you can
disengage without punishment and return when a notification arrives.

**This is the redesign's correspondence loop, shipped, on mobile, at #1.** It is
the strongest evidence in this document that the shape works, and it retires the
worry in `redesign.md` §7 that the retention hook is unproven — it is proven; it
is just proven in a different store category. See Part 3.

### Bury Me, My Love (The Pixel Hunt, 2017)

The same form: you are Majd, who stayed behind; you text your wife Nour through
a refugee journey. Real-time delays, sometimes hours. Multiple endings.

The reception detail worth having: reviewers of the **Switch port** noted it
loses its impact because conversations run at normal pace, while the mobile
version's real-time delays are what create the dread of waiting for a reply.

**The delay is not a compromise. It is the mechanic.** Removing it removed the
game. That is the strongest available argument for the redesign's claim that the
async architecture and the fiction can want the same thing.

### Sunless Sea (Failbetter, 2015) — this improves the redesign

When a captain dies or retires, you choose a **Legacy** — which relationship the
next captain has to the last, and therefore what they inherit:

| Legacy | Inherits |
| --- | --- |
| Rival | half their Iron, one weapon |
| Pupil | half their Mirrors, half their Echoes |
| Salvager | half their Veils, half their Echoes |
| Shipmate | half their Hearts, one of their Officers |
| **Correspondent** | half their Pages, **the entirety of their discovered chart** |

Failbetter built this because the feedback on death was that it was *too
punishing* — captains lost their minds and a large chunk of progress with them.

Two things fall out of this, and the second one reverses a decision in the
redesign:

1. The Correspondent legacy **is the casebook**, shipped a decade ago, and it
   works.
2. But it is a **choice**, and mine was automatic. Making the map inherit for
   free is strictly worse design: it turns death into an event that happens to
   you rather than a decision you make. Amendment below.

### Darkest Dungeon (Red Hook, 2016)

Expendable heroes, permanent estate. Heroes accumulate **Stress** from combat,
darkness and horror; at 100 they take an Affliction — selfish, paranoid,
masochistic, abusive — and start sabotaging the party from inside. At 200 they
can die of a heart attack. They pick up **Quirks**, good and bad, which can be
locked in permanently or cured at cost, and treating a hero takes them out of
the roster while they recover.

This validates the redesign's §4.2 almost line for line — Nerve is Stress, traits
are Quirks — and adds one correction. Darkest Dungeon's guidance is to keep a
**roster of 20+ heroes so no single death cripples the campaign**, and the
stagecoach supplies replacements free. A one-adventurer design has no such
shock absorber; the redesign's answer has to be that the casebook is the
absorber, and that answer needs testing rather than assuming.

The deeper lesson: DD's afflicted heroes *act against you*, visibly, in ways you
can narrate afterwards. That is redesign law 3 — being wrong in an interesting
way — implemented as a stress meter.

### Loop Hero (Four Quarters, 2021) — the counter-evidence

The one that argues against the redesign, which is why it is here.

You do not control the hero. Combat resolves automatically. Your input is
placing cards that shape the loop — what spawns, how often, what terrain exists.
It was widely praised for the novelty of that agency.

But the critical read is specific and it lands on us:

> Because you have no direct control over your character, you always want to
> play it safe when it comes to card placement — which reduces both the number
> of viable ways to play and which cards you take.

**This is the failure mode of the whole redesign.** If the player cannot rescue a
situation once it goes wrong, the rational response is to never let it go wrong,
and a game of judgment collapses into a game of caution. Deep Holdings has
already lived this once — `balance.md` measured a retreat slider where
everything from 35 to 80 was one setting, because safety was free.

The redesign needs an explicit answer. Mine is in the amendments.

### Majesty (Cyberlore, 2000) — indirect control done deliberately

The purest form of the handler premise. You cannot order heroes; you place
**flags with bounties** on them — attack this, defend that, explore there — and
heroes decide for themselves whether the money is worth it. Heroes have
personalities you do not control: some are lazy and only take nearby work, some
spend their pay in taverns rather than working.

Two takeaways. First, **the interface for indirect control is incentives, not
instructions** — and the redesign's doctrine system is instructions. A bounty
mechanic is worth considering as a second verb: not *what to do* but *what it is
worth to me*. Second, Majesty's heroes are charming specifically because they
disobey, which is the argument for the redesign's "doctrine is interpreted, not
obeyed."

### Fallen London / StoryNexus (Failbetter) — the implementation model

Quality-Based Narrative. The world is a bag of **storylets**; each has
requirements expressed over **qualities** (numeric or boolean player state); the
game offers you the storylets you currently qualify for. Knowledge, items,
reputation and progress are all just qualities, and they gate which options
appear.

This is exactly the machinery `redesign.md` §4.4 describes as a casebook of
facts that unlock options — and it means the situation system should be
**authored data with requirements, not hand-coded encounters**. That is an
architecture decision, and it is the one that determines whether writers can add
content without a deploy.

Note for planning: storynexus.com, the authoring platform, shut down in January
2026. Fallen London itself continues on the same model. We would be building the
engine, not licensing one.

---

## Part 3 — the strategic question this raises

The existing research and the new research disagree about who the customer is,
and the disagreement is not resolvable by more research.

| | The incremental sample | The narrative sample |
| --- | --- | --- |
| Games | CIFI, ISEPS, TT2, Melvor, NGU, USI | Lifeline, Bury Me My Love, Sunless Sea, Fallen London |
| Sells | volume of numbers, months of climb | a story you are inside of |
| Model | F2P, ads + IAP | **premium**, or narrative-DLC |
| Evidence | CIFI: 500k+ installs, 3× category award | Lifeline: **#1 paid iOS**, 81% D1, 7M series installs |
| Content cost | low — systems generate it | high — someone writes it |

`redesign.md` moves us from the first column to the second. That is not a tuning
change; it changes the Play category we list in, the business model, and what a
good week looks like. The settled decision recorded in the roadmap —
*"convenience and cosmetics only, time skips capped and free"* — was written for
the first column. In the second column, a time skip sells the player a way to
skip the product.

**This is an owner decision, not a research finding.** What research can say:
both columns contain real successes at our scale, the second column's flagship
was a paid app, and we cannot be in both.

---

## Part 4 — amendments to `redesign.md`

Five, in order of how much they change the document.

1. **Death becomes a choice, not an event.** *(Sunless Sea)* Replace automatic
   casebook inheritance with a legacy choice at death: the next adventurer is
   your late one's **pupil** (inherits skills, not knowledge), **correspondent**
   (inherits the casebook), **creditor** (inherits the money), or **rival**
   (inherits the grudge, and something the dead one hid). The casebook still
   crosses the line — but you choose what crosses with it, and giving it up has
   to be tempting.

2. **Answer the Loop Hero problem explicitly.** Indirect control makes caution
   free unless something punishes it. Two mechanisms, both cheap:
   - **The casebook only fills in places you do not know.** Safe play earns
     money; money is a constraint, not a score. A cautious officer stops
     progressing on the only axis that matters, and can see it happening.
   - **Allow one costly intervention per shift** — a recall, an emergency
     message that reaches them out of band. It gives the player a rescue and
     therefore permission to take a risk, and its scarcity is the decision.

3. **Set the shift at roughly an hour.** *(Kittens Game, Lifeline)* Both
   independently land near "a meaningful decision about once an hour." This
   answers redesign open question 1: the tick stays a minute internally, but
   situations accumulate into shifts of ~1h, with 2–3 check-ins a day being a
   full experience. Lifeline's rule is better than a fixed interval — wait times
   should match *how long the thing would plausibly take*, which also makes them
   diegetic.

4. **Rulings must be answerable from the notification.** *(Lifeline)* Not "a
   notification that brings you to the app" — the ruling itself, answered from
   the lock screen. This is a hard requirement on the standing-situation format:
   two or three options, short enough to read in a banner. It is also the single
   highest-leverage retention feature available to us, and it constrains the
   content format, so it belongs in the design rather than in a mobile
   milestone.

5. **Build situations as data with requirements, not as code.** *(Fallen
   London)* Storylets gated on qualities. Facts in the casebook are qualities.
   Traits are qualities. This is what lets content ship without a deploy and
   what makes the divergence test in redesign §6 measurable, since a situation's
   requirements are inspectable.

One thing research did **not** support and I am flagging rather than quietly
keeping: the redesign assumes a single adventurer through Stage 4. Darkest
Dungeon needed a 20-hero roster so that no death was fatal to the campaign, and
Sunless Sea had to add Legacy after players found single-captain death too
punishing. Both suggest one adventurer plus permanent knowledge may not be
enough of a shock absorber. It is testable in Stage 0 and should be an explicit
question there.

---

## Caveats

- Tap Titans 2 and Melvor findings lean on secondary sources — guides, review
  aggregates, forum threads — rather than play. Both are directionally
  consistent across sources but neither is measured the way `balance.md`
  measures our own game.
- Lifeline's 81% D1 retention is quoted from the developers via a 2015
  interview. It is a self-reported figure for a **paid** app in 2015, and paid
  installs retain far better than free ones. Do not plan against it.
- Kittens Game analysis is drawn from two essays and the wiki; the wiki's
  mechanics page did not render for extraction.
- I did not research: A Dark Room, Universal Paperclips, Cultist Simulator,
  80 Days, Fallout Shelter, Increlution, or EVE's skill queue. Each is plausibly
  relevant; the first three for reveal-pacing and knowledge-as-progression, the
  last for offline progression as a premise.

## Sources

- [Tap Titans 2 — Google Play](https://play.google.com/store/apps/details?id=com.gamehivecorp.taptitans2), [Game Hive help centre on prestige](https://gamehive.helpshift.com/hc/en/3-tap-titans-2/faq/75-should-i-prestige-when/), [Level Winner prestige guide](https://www.levelwinner.com/tap-titans-2-strategy-guide-how-to-prestige/), [player.one beginner's guide](https://www.player.one/tap-titans-2-beginners-guide-artifact-tiers-pets-clans-when-prestige-and-more-575174), [Alternate Image review](https://alternateimage.net/gaming/2020/08/09/tap-titans-2-a-review/), [AppGrooves negative reviews](https://appgrooves.com/app/tap-titans-by-game-hive-corporation/negative)
- [Kittens Game Wiki — Game Mechanics](https://wiki.kittensgame.com/en/general-information/game-mechanics), [Paragon](https://wiki.kittensgame.com/en/general-information/resources/paragon), [malvasia bianca essay](https://malvasiabianca.org/archives/2018/08/kittens-game/), [Cain S. Latrani](https://cainslatrani.wordpress.com/2017/04/04/game-time-kittens-game/), [TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/KittensGame)
- [Melvor Idle Wiki — Mastery](https://wiki.melvoridle.com/w/Mastery), [V0.17 mastery rework](https://wiki.melvoridle.com/w/V0.17), [Steam discussions](https://steamcommunity.com/app/1267910/discussions/)
- [Building a narrative out of push notifications in *Lifeline*](https://www.gamedeveloper.com/design/building-a-narrative-out-of-push-notifications-in-i-lifeline-i-), [GameAnalytics interview with 3 Minute Games](https://www.gameanalytics.com/blog/lifeline-3-minute-games-interview), [50 Years of Text Games: 2015 — Lifeline](https://if50.substack.com/p/2015-lifeline), [Wikipedia](https://en.wikipedia.org/wiki/Lifeline_(2015_video_game)), [PR Newswire — #1 paid iOS](https://www.prnewswire.com/news-releases/1-top-paid-ios-game-lifeline-comes-to-android-300097554.html)
- [Bury Me, My Love — Games for Change](https://www.gamesforchange.org/games/bury-me-my-love/), [148Apps review](https://www.148apps.com/another-lost-phone/bury-me-my-love-review/), [Nintendo World Report review](http://www.nintendoworldreport.com/review/49326/bury-me-my-love-switch-review), [GamesBeat review](https://gamesbeat.com/bury-me-my-love-review/)
- [Sunless Sea Wiki — Legacy](https://sunlesssea.miraheze.org/wiki/Legacy), [Failbetter: Sunless Sea vs Sunless Skies — death, legacies and repetition](https://www.failbettergames.com/news/sunless-sea-vs-sunless-skies-death-legacies-and-repetition)
- [Darkest Dungeon Wiki — Quirks](https://darkestdungeon.wiki.gg/wiki/Quirks_(Darkest_Dungeon)), [A Mechanical Critique of Darkest Dungeon — The Gemsbok](https://thegemsbok.com/art-reviews-and-articles/darkest-dungeon-red-hook-critique-mechanics-design/), [Darkest Dungeon Is A Perfect Human Resource Management Simulator](https://medium.com/zeroindent/darkest-dungeon-is-a-perfect-human-resource-management-simulator-e7c79c2ef539)
- [Loop Hero — OpenCritic](https://opencritic.com/game/11017/loop-hero/reviews), [Game Design Breakdown: Loop Hero](https://medium.com/@sacitsivri/game-design-breakdown-loop-hero-4a86d55142b8), [Game Wisdom analysis](https://game-wisdom.com/analysis/loop-hero)
- [Majesty 2 Wiki — Indirect Control](https://majesty2.fandom.com/wiki/Indirect_Control), [Giant Bomb](https://giantbomb.com/wiki/Games/Majesty_2_The_Fantasy_Kingdom_Sim)
- [Failbetter — StoryNexus is Live](https://www.failbettergames.com/news/storynexus-is-live), [Emily Short on quality-based narrative](https://emshort.blog/category/quality-based-narrative/), [StoryNexus — IFWiki](https://www.ifwiki.org/StoryNexus), [Fallen London — Wikipedia](https://en.wikipedia.org/wiki/Fallen_London)
