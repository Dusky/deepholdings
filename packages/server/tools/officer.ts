/**
 * What an officer does when they open the terminal.
 *
 * ## Why this exists
 *
 * Three harnesses model a visit — `cadence.ts`, `longrun.ts`, `simulate.ts` —
 * and until now each rebuilt it. That is how two systems shipped unmeasured.
 *
 * Case files went out with a drop rate twenty times too high because nothing
 * counted acquisitions per day. The Registry went out with a wage priced
 * against the income curve and nothing else, and when the harness was finally
 * taught about it, it turned out to cost 35% of lifetime pension. Both times
 * the shape of the mistake was identical: the thing was added *around*
 * `resolve()` rather than inside it, and every tool that could have caught it
 * had its own copy of the loop with no idea the new thing existed.
 *
 * So this is the one place that knows what a visit is. A new system is added
 * here once, and every harness picks it up or explicitly opts out through its
 * policy — which is a decision someone has to make in writing, rather than an
 * omission nobody notices.
 *
 * ## What it is not
 *
 * Not the server. `packages/server/src/service.ts` is what actually runs for a
 * player, and this deliberately does not import it: the service reaches for a
 * repository, a transaction and a world row, none of which a harness has or
 * wants. What it *does* share is `runStaff`, the real domain function, so the
 * department a harness measures is the department a player gets.
 *
 * The order below matches the server's. Staff work the span first, inside the
 * read; the officer's own visit is what happens next. A harness that sold
 * before the clerk ran would find them arriving at an empty cabinet and report
 * them doing nothing.
 */
import {
  COMMENDATION_CATALOGUE,
  REQUISITION_CATALOGUE,
  STAFF_CATALOGUE,
  UNLOCK_CATALOGUE,
  canTransfer,
  commendationAward,
  commendationTier,
  nextStaffRung,
  requisitionTier,
  unlockTier,
  type CaseFile,
  type Character,
  type Filing,
  type InventoryItem,
  type Pension,
  type Registry,
  type RequisitionId,
  type CommendationId,
  type StaffRung,
  type StaffRungId,
  type Transfer,
  type UnlockId,
} from '@deepholdings/shared';
import { runStaff } from '../src/domain/staff.js';

/** What kind of officer is being modelled. Every field is opt-in. */
export interface OfficerPolicy {
  /** Realise the filing cabinet at book value on each visit. */
  sells?: boolean;
  /**
   * Buy office equipment as soon as affordable, never dropping below `reserve`.
   *
   * The reserve matters: an officer who spends to zero starves the recruit's
   * resupply, which is a different experiment from the one usually intended.
   */
  requisitions?: { reserve: number };
  /** Redeem pension rungs as soon as affordable. */
  unlocks?: boolean;
  /**
   * Fill and promote every post as soon as affordable, keeping `reserve` back.
   *
   * One flag for both because they are one ladder: appointment is tier 1 and
   * the rest are promotions, and an officer who filled every post but never
   * promoted anybody would be modelling a department nobody would actually run.
   */
  hires?: { reserve: number };
  /** Let hired staff work the span. Independent of `hires`, so a harness can
   *  model a department that was inherited rather than built. */
  staff?: boolean;
  /**
   * File Form T-1 as soon as the pension ladder has nothing left to sell, and
   * spend the Commendations it pays.
   *
   * Gated on the *catalogue* rather than a pension figure because that is the
   * decision a player actually makes: you transfer when the thing you were
   * saving for has run out. An officer who transferred on a number would be
   * modelling an optimiser, and the award is linear precisely so that nobody
   * has to be one.
   */
  transfers?: boolean;
}

export interface VisitState {
  character: Character;
  inventory: InventoryItem[];
  caseFiles: CaseFile[];
  filings: Filing[];
  pension: Pension;
  registry: Registry;
  requisitions: RequisitionId[];
  transfer: Transfer;
}

export interface VisitResult extends VisitState {
  /** Gold the cabinet turned into this visit. */
  realised: number;
  boughtRequisitions: RequisitionId[];
  boughtUnlocks: UnlockId[];
  /** Rungs of the promotion ladder bought, appointments included. */
  hired: StaffRungId[];
  boughtCommendations: CommendationId[];
  /** True when Form T-1 was filed this visit. The caller has to issue the
   *  posting: `visit` does not know how to make a recruit. */
  transferred: boolean;
  /** Commendations the transfer paid, zero when none was filed. */
  awarded: number;
  /** Lines the department filed, verbatim, for harnesses that count events. */
  notes: string[];
}

/** Book value of everything in the cabinet. Demand is centred on par, so this
 *  is what a seller gets on average and the right figure for a harness. */
export function cabinetValue(inventory: readonly InventoryItem[]): number {
  return inventory.reduce((total, item) => total + item.unitValue * item.quantity, 0);
}

/** The cheapest rung the ladder allows next. Shared so three tools stop
 *  disagreeing about what "next" means. */
export function nextRequisition(owned: readonly RequisitionId[]) {
  return REQUISITION_CATALOGUE.filter(
    (entry) => !owned.includes(entry.id) && requisitionTier(owned, entry.track) === entry.tier - 1,
  ).reduce<(typeof REQUISITION_CATALOGUE)[number] | null>(
    (best, entry) => (best === null || entry.cost < best.cost ? entry : best),
    null,
  );
}

export function nextUnlock(owned: readonly UnlockId[]) {
  return UNLOCK_CATALOGUE.filter(
    (entry) => !owned.includes(entry.id) && unlockTier(owned, entry.track) === entry.tier - 1,
  ).reduce<(typeof UNLOCK_CATALOGUE)[number] | null>(
    (best, entry) => (best === null || entry.cost < best.cost ? entry : best),
    null,
  );
}

export function visit(
  state: VisitState,
  policy: OfficerPolicy,
  ticksResolved: number,
  newId: () => string = () => `f${Math.random().toString(36).slice(2)}`,
): VisitResult {
  /**
   * Everything the caller might hold a reference to is copied on the way in.
   *
   * Not defensive habit — a real bug. When no unlock is bought, `pension` was
   * returned by reference, so `result.pension.unlocks` *was* the caller's own
   * array; a harness doing the obvious `unlocks.length = 0; unlocks.push(
   * ...result.pension.unlocks)` emptied the array it was about to copy from and
   * silently wiped every unlock on every visit. It cost 19 of 19 rungs and did
   * not fail anything — it just quietly reported a different game.
   *
   * A caller should not have to know which fields survive untouched, so none of
   * them are shared.
   */
  let character = { ...state.character };
  let inventory = state.inventory.map((item) => ({ ...item }));
  let caseFiles = state.caseFiles.map((file) => ({ ...file }));
  let filings = state.filings.map((filing) => ({ ...filing }));
  let pension: Pension = { ...state.pension, unlocks: [...state.pension.unlocks] };
  let registry: Registry = {
    ...state.registry,
    staff: state.registry.staff.map((member) => ({ ...member })),
  };
  const requisitions = [...state.requisitions];
  let transfer: Transfer = { ...state.transfer, unlocks: [...state.transfer.unlocks] };
  const boughtRequisitions: RequisitionId[] = [];
  const boughtCommendations: CommendationId[] = [];
  const hired: StaffRungId[] = [];
  let transferred = false;
  let awarded = 0;
  const notes: string[] = [];
  let realised = 0;
  /**
   * Rungs are counted by diffing the whole visit rather than by appending at
   * the point of purchase, because the officer is not the only buyer: a Junior
   * Officer redeems inside `runStaff`, before step 4 runs at all. A harness that
   * only saw step 4 would report the department's purchases as never happening,
   * which is exactly the blindness this file exists to remove.
   */
  const unlocksBefore = new Set(state.pension.unlocks);

  // 1. The department works the span, before the officer touches anything.
  if (policy.staff && registry.staff.length > 0) {
    const worked = runStaff({
      character, inventory, caseFiles, filings, pension, registry, ticksResolved, newId,
      commendations: transfer.unlocks,
    });
    character = worked.character;
    inventory = worked.inventory;
    caseFiles = worked.caseFiles;
    filings = worked.filings;
    pension = worked.pension;
    registry = worked.registry;
    notes.push(...worked.notes);
  }

  // 2. Realise the cabinet.
  if (policy.sells) {
    realised = cabinetValue(inventory);
    if (realised > 0) {
      character = { ...character, gold: character.gold + realised };
      inventory = [];
    }
  }

  /**
   * 3. Hiring, ahead of the equipment ladder.
   *
   * The order is load-bearing rather than arbitrary. Posts cost 800/2400/4800
   * against requisition rungs an order of magnitude cheaper, so an officer who
   * bought equipment first would never clear the hiring bar early and the
   * department would arrive weeks late — which turns a measurement of "what
   * does staff do" into a measurement of "what does staff do if you buy it
   * last". Hire-first is also what an officer who wants the chore gone would
   * actually do.
   */
  if (policy.hires) {
    // Cheapest rung first across all three posts, so an officer who can afford
    // a second Filing Clerk tier but not a first Archivist takes the clerk —
    // which is the order a player buying on price would use, and the least
    // favourable case for a ladder that has to justify its upper tiers.
    for (;;) {
      const rung = STAFF_CATALOGUE.map((spec) => nextStaffRung(registry, spec.role))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .reduce<StaffRung | null>(
          (best, entry) => (best === null || entry.cost < best.cost ? entry : best),
          null,
        );
      if (!rung || character.gold - rung.cost < policy.hires.reserve) break;
      character = { ...character, gold: character.gold - rung.cost };
      const spec = STAFF_CATALOGUE.find((entry) => entry.role === rung.track)!;
      registry = {
        ...registry,
        staff:
          rung.tier === 1
            ? [...registry.staff, { role: rung.track, policy: spec.policyDefault, tier: 1 }]
            : registry.staff.map((member) =>
                member.role === rung.track ? { ...member, tier: rung.tier } : member,
              ),
        spent: registry.spent + rung.cost,
      };
      hired.push(rung.id);
    }
  }

  // 4. Office equipment.
  if (policy.requisitions) {
    for (;;) {
      const rung = nextRequisition(requisitions);
      if (!rung || character.gold - rung.cost < policy.requisitions.reserve) break;
      character = { ...character, gold: character.gold - rung.cost };
      requisitions.push(rung.id);
      boughtRequisitions.push(rung.id);
    }
  }

  // 5. Pension rungs. Note this runs *after* the Junior Officer has had a go,
  //    so a harness with both models the officer mopping up what the post's
  //    reserve policy left behind — which is what actually happens.
  if (policy.unlocks) {
    for (;;) {
      const rung = nextUnlock(pension.unlocks);
      if (!rung || pension.total < rung.cost) break;
      pension = {
        ...pension,
        total: pension.total - rung.cost,
        spent: pension.spent + rung.cost,
        unlocks: [...pension.unlocks, rung.id],
      };
    }
  }

  const boughtUnlocks = pension.unlocks.filter((id) => !unlocksBefore.has(id));

  /**
   * 6. Form T-1, once the pension catalogue has nothing left to sell.
   *
   * Last in the visit on purpose. Transferring first would surrender a pension
   * the officer could still have spent, which no player would do and which
   * would make the harness report the prestige layer as a loss.
   */
  if (policy.transfers && nextUnlock(pension.unlocks) === null && canTransfer(pension.total + pension.spent)) {
    awarded = commendationAward(pension.total + pension.spent);
    transfer = {
      total: transfer.total + awarded,
      spent: transfer.spent,
      unlocks: [...transfer.unlocks],
      careers: transfer.careers + 1,
    };
    pension = { total: 0, spent: 0, unlocks: [] };
    transferred = true;
  }

  // 7. And spend them, cheapest rung first, the same way every other ladder in
  //    this file is climbed.
  if (policy.transfers) {
    for (;;) {
      const rung = COMMENDATION_CATALOGUE.filter(
        (entry) =>
          !transfer.unlocks.includes(entry.id) &&
          commendationTier(transfer.unlocks, entry.track) === entry.tier - 1 &&
          entry.cost <= transfer.total,
      ).reduce<(typeof COMMENDATION_CATALOGUE)[number] | null>(
        (best, entry) => (best === null || entry.cost < best.cost ? entry : best),
        null,
      );
      if (!rung) break;
      transfer = {
        ...transfer,
        total: transfer.total - rung.cost,
        spent: transfer.spent + rung.cost,
        unlocks: [...transfer.unlocks, rung.id],
      };
      boughtCommendations.push(rung.id);
    }
  }

  return {
    character, inventory, caseFiles, filings, pension, registry, requisitions, transfer,
    realised, boughtRequisitions, boughtUnlocks, boughtCommendations, hired, notes,
    transferred, awarded,
  };
}
