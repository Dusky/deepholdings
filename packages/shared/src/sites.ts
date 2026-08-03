/**
 * Where the recruit is sent.
 *
 * ## Why a second site rather than deeper floors
 *
 * The obvious way to add late-game depth is to raise `MAX_DEPTH`, and it is the
 * one thing this codebase cannot cheaply do. That constant is load-bearing in
 * three places at once: `authorisedDepth` clamps to it, the damage curve is
 * shaped around it, and `maxHpForLevel` caps grade at it — the last of which
 * exists because a ninety-day run found the game *self-terminating*. Grade used
 * to buy survivability without limit, the worst possible blow at Floor 12 is
 * about 97 damage, and a Grade 30 recruit's retreat threshold sits above that,
 * so recruits simply stopped dying and progression halted permanently on day
 * fourteen. Raising the ceiling re-opens all of it.
 *
 * A parallel site costs writing instead of re-verification. Both sites cap at
 * twelve, so every number measured so far still describes the site it was
 * measured on, and the second one differs in the things that are cheap to
 * change and interesting to play against: what it pays, what it costs you, how
 * busy it is, and how grudgingly the permit office reads a floor number.
 *
 * ## What makes it a decision rather than an upgrade
 *
 * The Annexe pays about seventy per cent more and hits about a third harder,
 * on a permit ladder that opens more slowly. For a well-equipped officer with a
 * deep permit that is plainly better; for a fresh recruit it is a way to lose
 * them faster. So it is a *posting*, not a tier — and it gives Loot Priority
 * somewhere new to matter, since the two sites bias their pools differently.
 *
 * It is gated behind a Commendation, which is what makes the transfer layer
 * worth filing for.
 */
import type { CommendationId } from './transfer.js';

export type SiteId = 'holdings' | 'annexe';

export interface SiteSpec {
  id: SiteId;
  /** How the Authority writes it on a form. */
  name: string;
  detail: string;
  /** The deepest floor that exists here. Twelve everywhere, for now. */
  maxDepth: number;
  /** Permit D-{tier} authorises this depth *at this site*. */
  permitLimits: Record<number, number>;
  /** Multiplier on what an encounter takes off the recruit. */
  danger: number;
  /** Multiplier on what a floor yields. */
  yield: number;
  /** Multiplier on how often anything happens at all. */
  traffic: number;
  /**
   * Multiplier on experience earned.
   *
   * The reason this field exists is a measurement. The Annexe first shipped at
   * 1.35 danger and 1.7 yield and came out **strictly worse than the free
   * site** — less gold, less pension, half again the deaths. The mechanism is
   * the oldest one in this codebase: danger causes deaths, deaths reset grade,
   * `authorisedDepth` clamps depth to grade, and both gold and pension scale
   * superlinearly with depth. A harder site spirals its own recruits into the
   * shallows and then pays them shallow-floor rates.
   *
   * Training faster is the counterweight. A recruit who survives the Annexe is
   * worth more than one who survives Holdings, which is both what the fiction
   * would say and what stops the spiral closing.
   */
  xp: number;
  /** The Commendation that authorises orders here. Null for the home site. */
  requires: CommendationId | null;
}

export const SITE_CATALOGUE: readonly SiteSpec[] = [
  {
    id: 'holdings',
    name: 'Deep Holdings',
    detail: 'The original site. Everything the Authority knows about depth, it learned here.',
    maxDepth: 12,
    // Unchanged from the global ladder it replaces, deliberately: every balance
    // number in `docs/design/balance.md` was measured against exactly this.
    permitLimits: { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7, 6: 8, 7: 10, 8: 12 },
    danger: 1,
    yield: 1,
    traffic: 1,
    xp: 1,
    requires: null,
  },
  {
    id: 'annexe',
    name: 'Deep Holdings (Annexe)',
    detail:
      'Colder, older, and administratively separate. Pays better, kills faster, ' +
      'and the permit office reads every floor number twice.',
    maxDepth: 12,
    // The same eight tiers, opening more slowly. A second permit *ladder* would
    // mean a second watermark on the character and a second thing to migrate;
    // re-reading the one ladder gets the same "you are not cleared for this yet"
    // beat with none of that, and it means an officer's clearance still means
    // one thing everywhere.
    permitLimits: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 8, 7: 10, 8: 12 },
    danger: 1.2,
    yield: 1.7,
    traffic: 1.15,
    xp: 1.5,
    requires: 'secondment1',
  },
];

export function siteSpec(id: SiteId): SiteSpec {
  return SITE_CATALOGUE.find((entry) => entry.id === id) ?? SITE_CATALOGUE[0];
}

/** Whether the officer may file orders for this site. */
export function siteAuthorised(id: SiteId, commendations: readonly CommendationId[]): boolean {
  const required = siteSpec(id).requires;
  return required === null || commendations.includes(required);
}

/**
 * The site an officer is actually allowed to work.
 *
 * Falls back to the home site rather than throwing, because the one way this is
 * reached in practice is an officer who has not bought the Commendation yet —
 * and a stored order that quietly stops being valid should send the recruit
 * somewhere safe, not 500 the read that discovers it.
 */
export function authorisedSite(
  id: SiteId,
  commendations: readonly CommendationId[],
): SiteId {
  return siteAuthorised(id, commendations) ? id : 'holdings';
}
