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
  statsOf,
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
function rollGrade(depth: number, priority: LootPriority, rng: Rng): number {
  const bias = CASE_FILE_BIAS[priority];
  const base = 1 + depth / 4 + bias.grade;
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
  baseValue: number;
  rng: Rng;
}): CaseFile {
  const { id, name, priority, depth, baseValue, rng } = input;
  const grade = rollGrade(depth, priority, rng);
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
 * Files the case file, dropping the weakest if the drawer is full.
 *
 * Full means full — a seventh find replaces the least valuable of the six
 * rather than being refused, because a system that silently stops giving you
 * things reads as broken. The displaced file is returned so the caller can
 * say what happened; nothing a player earned should vanish without a line.
 */
export function file(
  held: readonly CaseFile[],
  incoming: CaseFile,
): { files: CaseFile[]; displaced: CaseFile | null } {
  if (held.length < CASE_FILE_SLOTS) return { files: [...held, incoming], displaced: null };

  const worth = (f: CaseFile) => {
    const stats = statsOf([f]);
    // The same metric the quartermaster would use: what it is worth carrying,
    // not what it would fetch. Ties break on id so a replay is identical.
    return stats.vigour + stats.survival * 200 + stats.lootValue * 120;
  };

  let weakest = 0;
  for (let i = 1; i < held.length; i += 1) {
    const a = worth(held[i]);
    const b = worth(held[weakest]);
    if (a < b || (a === b && held[i].id < held[weakest].id)) weakest = i;
  }

  if (worth(incoming) <= worth(held[weakest])) return { files: [...held], displaced: incoming };
  const files = held.filter((_, i) => i !== weakest);
  return { files: [...files, incoming], displaced: held[weakest] };
}
