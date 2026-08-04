import {
  CASE_FILE_BIAS,
  CASE_FILE_CHANCE_BASE,
  CASE_FILE_CHANCE_PER_DEPTH,
  CASE_FILE_SLOTS,
  CASE_FILE_VALUE_MULTIPLIER,
  ALL_CLAUSES,
  clauseSlots,
  rngChance,
  rngInt,
  seniorityGradeBonus,
  statsOf,
  type EquipmentPolicy,
  type CaseFile,
  type Clause,
  type LootPriority,
} from '@deepholdings/shared';

type Rng = () => number;

/**
 * Rolling a case file.
 *
 * Everything here draws from the *simulation* rng rather than the prose one.
 * A case file changes the recruit's stat block, so it is a simulation event
 * that happens to have a name — the same mistake as letting flavour text
 * consume the combat stream would be letting a stat roll come out of the
 * prose stream, and it would shift every subsequent encounter.
 */

/** Whether this acquisition is a case file rather than an ordinary stack. */
export function rollsCaseFile(depth: number, priority: LootPriority, rng: Rng): boolean {
  const bias = CASE_FILE_BIAS[priority];
  const chance = (CASE_FILE_CHANCE_BASE + depth * CASE_FILE_CHANCE_PER_DEPTH) * bias.find;
  return rngChance(rng, chance);
}

/**
 * Grade I to V, from depth and Loot Priority.
 *
 * Depth is the main driver, because depth is what the game is for. The bias
 * is a nudge that makes relics feel like relics without letting a Floor 1
 * gamble produce a Grade V.
 */
function rollGrade(depth: number, priority: LootPriority, level: number, rng: Rng): number {
  const bias = CASE_FILE_BIAS[priority];
  const base = 1 + depth / 4 + bias.grade + seniorityGradeBonus(level);
  // ±1 of the trend, so the same floor produces a spread rather than a value.
  const rolled = Math.round(base + (rng() * 2 - 1));
  return Math.max(1, Math.min(5, rolled));
}

/** Clauses this grade may carry: nothing above it, and never a duplicate. */
function eligible(grade: number, kind: Clause['kind']): Clause[] {
  return ALL_CLAUSES.filter((clause) => clause.kind === kind && clause.minGrade <= grade);
}

export function rollCaseFile(input: {
  id: string;
  name: string;
  priority: LootPriority;
  depth: number;
  /** The recruit's grade. Surplus above the depth cap becomes seniority. */
  level: number;
  baseValue: number;
  rng: Rng;
}): CaseFile {
  const { id, name, priority, depth, level, baseValue, rng } = input;
  const grade = rollGrade(depth, priority, level, rng);
  const bias = CASE_FILE_BIAS[priority];
  const slots = clauseSlots(grade);

  const clauseIds: string[] = [];
  for (let slot = 0; slot < slots; slot += 1) {
    // The first clause is always an endorsement, so no case file is pure
    // drawback — an item that is only a cost is one the player throws away,
    // and then the system may as well not have fired.
    const kind = slot === 0 ? 'endorsement' : rngChance(rng, bias.riders) ? 'rider' : 'endorsement';
    const pool = eligible(grade, kind).filter((clause) => !clauseIds.includes(clause.id));
    if (pool.length === 0) continue;
    clauseIds.push(pool[rngInt(rng, 0, pool.length - 1)].id);
  }

  return {
    id,
    name,
    category: priority,
    grade,
    unitValue: Math.round(baseValue * CASE_FILE_VALUE_MULTIPLIER),
    clauseIds,
  };
}

/**
 * What a case file is worth carrying, under the officer's stated policy.
 *
 * Pure function of the stat block with ties broken on id, because this runs
 * inside resolution and a replay has to be identical (design rule 5).
 *
 * `balanced` is the formula that shipped, kept verbatim so an officer who never
 * touches the new control sees exactly the behaviour they had before. The
 * single-axis policies weight their own stat and ignore the rest rather than
 * merely favouring it — a policy that still quietly traded away survival for
 * enough loot value would be the same complaint in a smaller font.
 */
export function caseFileWorth(f: CaseFile, policy: EquipmentPolicy): number {
  const stats = statsOf([f]);
  switch (policy) {
    case 'vigour':
      return stats.vigour;
    case 'survival':
      return stats.survival;
    case 'lootValue':
      return stats.lootValue;
    // Never used for a comparison — `file()` returns before this is reached —
    // but exhaustive so a new policy cannot be added without deciding.
    case 'officer':
    case 'balanced':
    default:
      return stats.vigour + stats.survival * 200 + stats.lootValue * 120;
  }
}

/**
 * Files the case file, dropping the weakest if the drawer is full.
 *
 * Full means full — a fourth find replaces the least valuable of the three
 * rather than being refused, because a system that silently stops giving you
 * things reads as broken. The displaced file is returned so the caller can say
 * what happened; nothing a player earned should vanish without a line.
 *
 * **Which one goes is now the officer's decision.** This used to weigh vigour,
 * survival and loot value on a fixed formula they could neither see nor change,
 * so an officer who wanted a survival build could not keep one. That was
 * tolerable while case files were only found, and stopped being tolerable the
 * moment they could be invested in — spending scarce Union Standing on a file
 * the game may bin without asking is not a system anyone uses twice.
 *
 * Two levers, both from `docs/design/crafting.md`: the standing order picks the
 * metric, and Direct Issue (Form 5-E) countersigns a file so it is never a
 * candidate for displacement at all.
 *
 * `passedOver` carries design rule 1's second half — when a countersignature
 * keeps a weaker file over a better arrival, the system reports it and does not
 * act on it. The caller writes the line.
 */
export function file(
  held: readonly CaseFile[],
  incoming: CaseFile,
  policy: EquipmentPolicy = 'balanced',
): { files: CaseFile[]; displaced: CaseFile | null; passedOver: CaseFile | null } {
  if (held.length < CASE_FILE_SLOTS) {
    return { files: [...held, incoming], displaced: null, passedOver: null };
  }

  // OFFICER ONLY: the quartermaster does not substitute. A full drawer refuses
  // arrivals until the officer releases something by hand.
  if (policy === 'officer') return { files: [...held], displaced: incoming, passedOver: null };

  const worth = (f: CaseFile) => caseFileWorth(f, policy);

  // Countersigned files are not candidates for displacement at all, so a drawer
  // of three countersigned files behaves exactly like OFFICER ONLY.
  const candidates = held.map((f, i) => ({ f, i })).filter((entry) => !entry.f.countersigned);
  if (candidates.length === 0) {
    return { files: [...held], displaced: incoming, passedOver: null };
  }

  let weakest = candidates[0];
  for (const entry of candidates.slice(1)) {
    const a = worth(entry.f);
    const b = worth(weakest.f);
    if (a < b || (a === b && entry.f.id < weakest.f.id)) weakest = entry;
  }

  if (worth(incoming) <= worth(weakest.f)) {
    return { files: [...held], displaced: incoming, passedOver: null };
  }

  /*
   * Rule 1's other half: say so, do not act.
   *
   * If a countersigned file scores below the arrival we just kept, the officer
   * has passed something up — deliberately, but they should hear about it once.
   * Reported rather than acted on, and the caller writes the line.
   */
  const passedOver =
    held.find((f) => f.countersigned && worth(f) < worth(incoming)) ?? null;

  const files = held.filter((_, i) => i !== weakest.i);
  return { files: [...files, incoming], displaced: weakest.f, passedOver };
}
