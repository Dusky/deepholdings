/**
 * The regional effort: the one number in this game that other people move.
 *
 * ## What was wrong with it
 *
 * `guildProgress` advanced by `rngInt(rng, 0, 9)` on every world heartbeat, and
 * that was the whole system. It climbed at the same rate whether the office had
 * one officer or a thousand, whether they descended or sat still, and when it
 * reached the target it stopped and stayed there. A progress bar wired to a
 * clock is the same defect the Grade readout had before `seniority` — a number
 * that visibly moves while meaning nothing is worse than no number, because the
 * player does the work of noticing it.
 *
 * ## What it is now
 *
 * Objectives are counted out of what recruits actually do underground, drawn
 * from the resolver's own counters. When one completes, the cycle advances and
 * everyone who contributed to it is paid — lazily, on their next read, in the
 * same "nothing runs per-player on a schedule" style as everything else here.
 *
 * ## Why the reward is gold
 *
 * Pension was the obvious choice and is the wrong one. `pensionAward` was just
 * separated into a clean statement — pension is *time and depth*, gold is the
 * economy — and a third source paying pension for something that is neither
 * would put the ambiguity straight back. Gold also has somewhere to go now: the
 * Registry's promotion ladder costs 324,000, which is the first sink in the
 * game large enough for a windfall to matter.
 */
import type { SiteId } from './sites.js';

export type GuildMetric = 'floors' | 'files' | 'encounters' | 'permits';

export interface GuildObjective {
  metric: GuildMetric;
  /** What the Bulletin prints. */
  text: string;
  target: number;
  /** Gold split between contributors when it completes. */
  purse: number;
}

/**
 * The rotation.
 *
 * Four, and every one of them counts something a recruit does without the
 * officer changing anything — an objective that requires a particular standing
 * order would be an instruction rather than a bulletin, and the officer would
 * be right to resent it.
 *
 * Targets are sized against a measured career. One engaged officer descends
 * roughly 200 floors and opens roughly 25 case files a day, so a target of
 * 4,000 floors is a fortnight of one officer or an evening of thirty — which is
 * the point. It should be visibly faster when the region is busy.
 */
export const GUILD_OBJECTIVES: readonly GuildObjective[] = [
  {
    metric: 'floors',
    text: 'Survey 4,000 floors across the region.',
    target: 4000,
    purse: 90_000,
  },
  {
    metric: 'files',
    text: 'Open 600 case files for regional assessment.',
    target: 600,
    purse: 90_000,
  },
  {
    metric: 'encounters',
    text: 'Log 9,000 encounters for the hazard register.',
    target: 9000,
    purse: 90_000,
  },
  {
    metric: 'permits',
    text: 'Clear 300 permit applications through the regional office.',
    target: 300,
    purse: 90_000,
  },
];

export function objectiveForCycle(cycle: number): GuildObjective {
  return GUILD_OBJECTIVES[Math.abs(cycle) % GUILD_OBJECTIVES.length];
}

/** What one resolved span contributed, given the objective in force. */
export function contributionOf(
  metric: GuildMetric,
  counters: { floorsDescended: number; caseFilesFound: number; encounters: number; permitsApproved: number },
  site: SiteId,
): number {
  const raw =
    metric === 'floors' ? counters.floorsDescended
    : metric === 'files' ? counters.caseFilesFound
    : metric === 'encounters' ? counters.encounters
    : counters.permitsApproved;
  // The Annexe counts for more, because the Authority is short of people
  // willing to go there. It is also the only way the regional effort ever
  // acknowledges which site an officer chose.
  return site === 'annexe' ? Math.round(raw * 1.5) : raw;
}

/**
 * One contributor's share of a completed purse.
 *
 * A floor under it, and the floor is the design. Share-proportional alone means
 * a casual officer who contributed eleven floors out of four thousand collects
 * two hundred and forty gold and correctly concludes the whole system is not
 * for them. Everyone who turned up at all gets something worth reading; the
 * rest scales with what they did.
 *
 * ## The purse is a rate, not a pot
 *
 * Shares are not capped to sum to `purse`, and that is deliberate rather than
 * an oversight. A fixed pot divided among contributors means **another
 * officer's work reduces your payout**, which turns a shared bar into a
 * competitive one and gives every player a reason to resent a busy region. This
 * game's whole posture is the opposite of that: no leaderboards, no
 * pay-to-win, nothing that rewards being early at someone else's expense.
 *
 * So a solo officer who does all four thousand floors collects the full purse,
 * and thirty officers who each do a fifteenth collect a fifteenth each plus the
 * floor. The Authority is paying for the survey, not dividing a sack of coins.
 */
export const GUILD_MINIMUM_SHARE = 1_500;

export function guildShare(contribution: number, target: number, purse: number): number {
  if (contribution <= 0) return 0;
  const proportional = Math.round((contribution / Math.max(1, target)) * purse);
  return Math.max(GUILD_MINIMUM_SHARE, proportional);
}
