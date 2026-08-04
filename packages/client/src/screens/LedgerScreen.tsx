import { useCallback, useState } from 'react';
import {
  HEARTBEAT_SECONDS,
  PENSION_PER_COMMENDATION,
  STAFF_CATALOGUE,
  isHired,
  nextStaffRung,
  payrollPerTick,
  policyOf,
  staffRung,
  staffTier,
  type CommendationId,
  type LedgerResponse,
  type Registry,
  type RequisitionId,
  type StaffRole,
  type UnlockId,
} from '@deepholdings/shared';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useServerClock } from '../hooks/useServerClock';
import { secondsUntil } from '../lib/activity';
import { formatCountdown } from '../lib/format';
import { useServer } from '../state/serverContext';
import { Slider } from '../components/ui/Slider';
import { CabinetColumn, type BulkSelector } from './CabinetColumn';
import columns from './columns.module.css';
import styles from './LedgerScreen.module.css';

/**
 * When the market rerolls.
 *
 * Its own component so the second hand re-renders eleven characters rather than
 * the whole Ledger. This countdown used to sit in the bezel, where it ticked
 * the entire application once a second for information nobody on that screen
 * could act on — here it answers one question, and the question is live: sell
 * into this demand, or wait for the next draw.
 */
function MarketClock() {
  const { state, receivedAt } = useServer();
  const serverNow = useServerClock(state?.now, receivedAt, 1000);
  if (!state) return null;
  const seconds = secondsUntil(state.world.nextBeatAt, serverNow);
  return (
    <>
      Revised every {Math.round(HEARTBEAT_SECONDS / 60)} minutes; next draw{' '}
      {/* "00:00" reads as a stopped clock rather than an imminent one. The beat
          is due and lands on the heartbeat's next pass, so say that — same rule
          as the permit ETA's "imminent". */}
      <span className="text-body">{seconds <= 0 ? 'due now' : `in ${formatCountdown(seconds)}`}</span>
      .
    </>
  );
}

/**
 * The Registry: hire, and tell them what to do.
 *
 * On the Ledger rather than a seventh tab. Staff are a gold sink like the
 * requisitions two columns over, and the tab strip already wraps to two rows on
 * a phone — a screen this closely related is not worth a third.
 *
 * Every post shows its wage before you hire it and its standing instruction
 * after, because the wage is the decision and the instruction is the game. A
 * hire that were only a switch would be automation that removes the choice;
 * these move the choice up a level instead.
 */
function RegistryColumn({
  registry,
  gold,
  onChanged,
}: {
  registry: Registry;
  gold: number;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<StaffRole | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Held locally while dragging so the slider does not fight the server round
  // trip; the filed value is whatever it lands on.
  const [draft, setDraft] = useState<Partial<Record<StaffRole, number>>>({});

  const hire = async (role: StaffRole) => {
    setBusy(role);
    setNotice(null);
    try {
      await api.hireStaff(role);
      await onChanged();
    } catch {
      setNotice('The appointment was not approved. Nothing was charged.');
    } finally {
      setBusy(null);
    }
  };

  const file = async (role: StaffRole, policy: number) => {
    setDraft((current) => ({ ...current, [role]: policy }));
    try {
      await api.setStaffPolicy(role, policy);
      await onChanged();
    } catch {
      setNotice('The amendment was returned unstamped.');
    }
  };

  const payroll = payrollPerTick(registry);

  return (
    <div className={columns.column}>
      <div className={`text-head ${columns.head}`}>
        REGISTRY{payroll > 0 ? ` — ${payroll}g/min` : ''}
      </div>
      <div className={`text-dim ${styles.hint}`}>
        Staff take work off your desk and a wage off your purse, every minute,
        for as long as they are on the books.
      </div>
      {registry.unpaid && (
        <div className={`text-dim ${styles.hint}`} data-kind="alert">
          <span className="text-bright">The registry has stopped work.</span> The
          payroll could not be met; it resumes when there is gold to meet it.
        </div>
      )}
      {STAFF_CATALOGUE.map((spec) => {
        const hired = isHired(registry, spec.role);
        const tier = staffTier(registry, spec.role);
        const held = tier > 0 ? staffRung(spec.role, tier) : null;
        // The promotion on offer, or nothing when the post is at the top. It is
        // the same button either way: filling a post and promoting the person
        // in it are one decision made repeatedly, and two controls would make
        // the officer notice a distinction the ladder does not have.
        const next = nextStaffRung(registry, spec.role);
        const policy = draft[spec.role] ?? policyOf(registry, spec.role) ?? spec.policyDefault;
        return (
          <div key={spec.role} className={styles.post}>
            {held && (
              <div className={styles.held}>
                <span className="text-bright">{held.label}</span>
                <span className="text-dim">
                  Tier {tier}/3 — {held.upkeep}g/min
                </span>
              </div>
            )}
            {next ? (
              <button
                type="button"
                className={styles.unlock}
                data-state={gold >= next.cost ? 'affordable' : 'locked'}
                disabled={gold < next.cost || busy !== null}
                onClick={() => void hire(spec.role)}
              >
                <span className={styles.unlockHead}>
                  <span className="text-body">{hired ? `Promote to ${next.label}` : next.label}</span>
                  <span className="text-dim">
                    {busy === spec.role ? '...' : `${next.cost}g`}
                  </span>
                </span>
                <span className={`text-dim ${styles.unlockDetail}`}>
                  {next.detail} {next.upkeep}g per minute
                  {held ? `, up from ${held.upkeep}` : ''}.
                </span>
              </button>
            ) : (
              <div className={`text-dim ${styles.unlockDetail}`}>
                Nothing further to offer this post.
              </div>
            )}
            {hired && (
              <div className={styles.policy}>
                <label className="text-dim" htmlFor={`policy-${spec.role}`}>
                  {spec.policyLabel}{' '}
                  <span className="text-bright">
                    {policy}
                    {spec.policyUnit ? ` ${spec.policyUnit}` : ''}
                  </span>
                </label>
                <Slider
                  id={`policy-${spec.role}`}
                  min={spec.policyMin}
                  max={spec.policyMax}
                  step={spec.policyStep}
                  value={policy}
                  valueText={`${spec.policyLabel} ${policy}`}
                  onChange={(value) => void file(spec.role, value)}
                />
              </div>
            )}
          </div>
        );
      })}
      {notice && <div className={`text-dim ${styles.hint}`}>{notice}</div>}
    </div>
  );
}

/**
 * Commendations, beside the pension they outlive.
 *
 * A third column of the same shape rather than a seventh tab. The tab row is
 * already the tightest thing on a 390px phone — it took a layout fix and a
 * viewport harness to fit six — and one ladder does not earn a seventh. If this
 * column ever grows past the Ledger's scroll, `npm run viewports` is what says
 * so, not a hunch.
 */
function CommendationColumn({
  data,
  award,
  onChanged,
}: {
  data: LedgerResponse;
  award: number;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<CommendationId | 'transfer' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const buy = async (id: CommendationId) => {
    setBusy(id);
    setNotice(null);
    try {
      await api.purchaseCommendation(id);
      await onChanged();
    } catch {
      setNotice('The commendation was not entered. Nothing was spent.');
    } finally {
      setBusy(null);
    }
  };

  const transfer = async () => {
    setBusy('transfer');
    setNotice(null);
    try {
      const out = await api.fileTransfer();
      await onChanged();
      setNotice(
        `Form T-1 approved. ${out.awarded} entered on your record. New posting opened.`,
      );
    } catch {
      setNotice('Form T-1 returned. Your posting is unchanged.');
    } finally {
      setBusy(null);
    }
  };

  const { transfer: held } = data;

  return (
    <div className={columns.column}>
      <div className={`text-head ${columns.head}`}>
        COMMENDATIONS — {held.total}
        {held.careers > 0 ? ` — POSTING ${held.careers + 1}` : ''}
      </div>
      <div className={`text-dim ${styles.hint}`}>
        Earned by transferring. Nothing here is ever surrendered — not by a
        death, and not by a transfer.
      </div>
      {data.commendations.map((offer) => {
        const state = offer.owned ? 'owned' : offer.affordable ? 'affordable' : 'locked';
        return (
          <button
            key={offer.track}
            type="button"
            className={styles.unlock}
            data-state={state}
            disabled={!offer.affordable || busy !== null}
            onClick={() => void buy(offer.id)}
          >
            <span className={styles.unlockHead}>
              <span className={offer.owned ? 'text-bright' : 'text-body'}>{offer.label}</span>
              <span className={offer.owned ? 'text-bright' : 'text-dim'}>
                {offer.owned ? 'COMPLETE' : busy === offer.id ? '...' : offer.cost}
              </span>
            </span>
            <span className={`text-dim ${styles.unlockDetail}`}>
              {offer.maxTier > 1 && `Tier ${offer.tier}/${offer.maxTier} — `}
              {offer.detail}
            </span>
          </button>
        );
      })}

      <button
        type="button"
        className={styles.retire}
        disabled={award < 1 || busy !== null}
        onClick={() => void transfer()}
      >
        {busy === 'transfer'
          ? 'FILING FORM T-1...'
          : `FILE FORM T-1 — TRANSFER FOR ${award}`}
        <span className={`text-dim ${styles.retireNote}`}>
          {award >= 1
            ? 'Surrenders the pension and every rung bought with it. Your department, your equipment and your commendations come with you.'
            : `A transfer is assessed on pension banked this posting. ${PENSION_PER_COMMENDATION} earns one commendation.`}
        </span>
      </button>
      {notice && <div className="text-dim">{notice}</div>}
    </div>
  );
}

/**
 * What the Ledger is showing. One currency each, deliberately.
 *
 * `sell` turns loot into gold; `office` spends gold; `pension` spends pension;
 * `career` spends commendations. The old screen did all four at once, in six
 * columns, which is what "the shop menus are confusing" was about.
 */
type LedgerSection = 'sell' | 'office' | 'pension' | 'career';

/** Selling, and the three things value can be turned into. */
export function LedgerScreen() {
  const { refresh, state } = useServer();
  const load = useCallback(() => api.getLedger(), []);
  const { data, error, loading, reload } = useResource(load, 60_000);
  const [pending, setPending] = useState<UnlockId | RequisitionId | null>(null);
  const [section, setSection] = useState<LedgerSection>('sell');
  const [notice, setNotice] = useState<string | null>(null);
  const [selling, setSelling] = useState<string | null>(null);
  const [saleNotice, setSaleNotice] = useState<string | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [retireNotice, setRetireNotice] = useState<string | null>(null);
  const retirement = state?.retirement ?? null;

  const retire = async () => {
    setRetiring(true);
    setRetireNotice(null);
    try {
      await api.retireRecruit();
      // A successor, an emptied cabinet and a larger pension: reload both.
      await Promise.all([reload(), refresh()]);
      setRetireNotice('Separation processed. A successor has been assigned.');
    } catch {
      setRetireNotice('Form R-1 rejected. The recruit remains on the payroll.');
    } finally {
      setRetiring(false);
    }
  };

  const sell = async (name: string) => {
    setSelling(name);
    setSaleNotice(null);
    try {
      const result = await api.sellItem(name);
      setSaleNotice(`Sold ${result.sold}. ${result.goldReceived} gold received, in triplicate.`);
      // The sale changes both the cabinet and the purse.
      await Promise.all([reload(), refresh()]);
    } catch {
      setSaleNotice('Sale refused. The depot disputes the appraisal.');
    } finally {
      setSelling(null);
    }
  };

  const bulkSell = async (selector: BulkSelector) => {
    setSelling('bulk');
    setSaleNotice(null);
    try {
      const result = await api.bulkSell(selector);
      setSaleNotice(
        result.stacks === 0
          ? 'Nothing on file under that heading. No form was raised.'
          : `Bulk disposal filed: ${result.stacks} stacks, ${result.sold} items, ${result.goldReceived} gold.`,
      );
      await Promise.all([reload(), refresh()]);
    } catch {
      setSaleNotice('Bulk filing refused. The depot requests you queue like everyone else.');
    } finally {
      setSelling(null);
    }
  };

  const buy = async (id: UnlockId) => {
    setPending(id);
    setNotice(null);
    try {
      await api.purchaseUnlock(id);
      // Refresh both: the ledger for the new balance, the snapshot because a
      // cosmetic unlock repaints the whole machine.
      await Promise.all([reload(), refresh()]);
    } catch {
      setNotice('Redemption refused. The pension office has been notified.');
    } finally {
      setPending(null);
    }
  };

  const requisition = async (id: RequisitionId) => {
    setPending(id);
    setNotice(null);
    try {
      await api.purchaseRequisition(id);
      // The state snapshot carries the office, and several requisitions change
      // screens this one is not.
      await Promise.all([reload(), refresh()]);
    } catch {
      setNotice('Requisition returned unstamped. Supply will not say why.');
    } finally {
      setPending(null);
    }
  };

  if (loading && !data) return <div className="text-dim">Retrieving ledger...</div>;
  if (!data) return <div className="text-dim">{error ?? 'Ledger unavailable.'}</div>;

  /**
   * One section per currency, and each states its own balance.
   *
   * The balance line is the fix for the sharpest confusion here: the gold purse
   * used to live in the Requisitions heading two columns away from the Registry
   * that spends it every minute, and pension and commendation costs printed as
   * bare integers next to gold costs suffixed `g`. A player reading `1200`,
   * `900g` and `3` on one screen had no way to know they were three different
   * kinds of money.
   */
  const sections: { id: LedgerSection; label: string; balance: string }[] = [
    {
      id: 'sell',
      label: 'SELL',
      balance: `${data.gold.toLocaleString('en-GB')} gold in the purse.`,
    },
    {
      id: 'office',
      label: 'OFFICE',
      balance: `${data.gold.toLocaleString('en-GB')} gold in the purse.`,
    },
    {
      id: 'pension',
      label: 'PENSION',
      balance: `${data.pension.total.toLocaleString('en-GB')} pension banked. Permanent — it survives every death.`,
    },
    // Offered only once it means something. Before the first transfer this is a
    // ladder with no currency to climb it, which is a screen telling a new
    // player about a thing they cannot have.
    ...(data.transfer.total > 0 || (state?.transferAward ?? 0) > 0
      ? [
          {
            id: 'career' as const,
            label: 'CAREER',
            balance: `${data.transfer.total.toLocaleString('en-GB')} commendations. Never surrendered, by any death or transfer.`,
          },
        ]
      : []),
  ];
  const activeSection = sections.find((entry) => entry.id === section) ?? sections[0];

  return (
    <>
      {/*
        One job at a time.

        This screen used to render six systems side by side — inventory, the
        market, requisitions, pension unlocks, commendations and the staff
        registry — spending four different currencies, with costs printed as
        `900g`, `1200` and `3` in adjacent columns and the gold purse absent
        from the one column that spends it per minute. "The shop menus are
        confusing" was the report, and that is the whole of why.

        Splitting by *purpose* rather than by widget: what you sell, what gold
        buys, what pension buys, what commendations buy. Each section names its
        own currency and shows that balance, so a number on a button can only
        mean one thing. The sections a player has no use for yet are simply not
        offered — the commendation ladder does not exist until a transfer is
        worth something, which is the same progressive-disclosure argument the
        tab strip already makes.
      */}
      <div className={styles.sections} role="tablist" aria-label="Ledger sections">
        {sections.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={section === entry.id}
            className={styles.sectionTab}
            data-active={section === entry.id}
            onClick={() => setSection(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className={`text-dim ${styles.sectionBalance}`}>{activeSection.balance}</div>

      <div className={columns.columns}>
      {section === 'sell' && (
      <CabinetColumn
        inventory={data.inventory}
        market={data.market}
        office={data.office}
        onSell={sell}
        onBulkSell={bulkSell}
        busy={selling}
        notice={saleNotice}
      />
      )}

      {section === 'sell' && (
      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>MARKET</div>
        <div className={`text-dim ${styles.hint}`}>
          Standing demand, applied to every sale. <MarketClock />
        </div>
        {data.market.map((quote) => {
          const swing = Math.round((quote.demand - 1) * 100);
          return (
            <div key={quote.category} className={columns.row}>
              <span className="text-body">{quote.label}</span>
              <span
                className={swing >= 0 ? 'text-bright' : 'text-dim'}
                data-demand={swing >= 0 ? 'up' : 'down'}
              >
                {swing >= 0 ? '+' : ''}
                {swing}%
              </span>
            </div>
          );
        })}

      </div>
      )}

      {section === 'office' && (
      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>REQUISITIONS</div>
        <div className={`text-dim ${styles.hint}`}>
          Office equipment. Permanent — a desk is not buried with the recruit who
          paid for it. Prices below are in gold.
        </div>
        {data.requisitions.map((offer) => {
          const offerState = offer.owned ? 'owned' : offer.affordable ? 'affordable' : 'locked';
          return (
            <button
              key={offer.track}
              type="button"
              className={styles.unlock}
              data-state={offerState}
              disabled={!offer.affordable || pending !== null}
              onClick={() => void requisition(offer.id)}
            >
              <span className={styles.unlockHead}>
                <span className={offer.owned ? 'text-bright' : 'text-body'}>{offer.label}</span>
                <span className={offer.owned ? 'text-bright' : 'text-dim'}>
                  {offer.owned ? 'ON FILE' : pending === offer.id ? '...' : `${offer.cost}g`}
                </span>
              </span>
              <span className={`text-dim ${styles.unlockDetail}`}>
                {offer.maxTier > 1 && `Tier ${offer.tier}/${offer.maxTier} — `}
                {offer.detail}
              </span>
            </button>
          );
        })}
      </div>
      )}

      {section === 'pension' && (
      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>PERMANENT UPGRADES</div>
        <div className={`text-dim ${styles.hint}`}>
          Bought with pension, and kept through every future recruit. Prices
          below are in pension.
        </div>
        {data.unlocks.map((unlock) => {
          const unlockState = unlock.owned ? 'owned' : unlock.affordable ? 'affordable' : 'locked';
          return (
            <button
              key={unlock.track}
              type="button"
              className={styles.unlock}
              data-state={unlockState}
              disabled={!unlock.affordable || pending !== null}
              onClick={() => void buy(unlock.id)}
            >
              <span className={styles.unlockHead}>
                <span className={unlock.owned ? 'text-bright' : 'text-body'}>{unlock.label}</span>
                <span className={unlock.owned ? 'text-bright' : 'text-dim'}>
                  {/*
                    A licensed-out rung says so where the price goes. Showing a
                    cost the officer can plainly afford, on a button that will
                    not press, is the reading that makes a rule look like a bug.
                  */}
                  {unlock.owned
                    ? 'COMPLETE'
                    : pending === unlock.id
                      ? '...'
                      : unlock.blocked
                        ? 'NOT THIS POSTING'
                        : unlock.cost}
                </span>
              </span>
              <span className={`text-dim ${styles.unlockDetail}`}>
                {unlock.maxTier > 1 && `Tier ${unlock.tier}/${unlock.maxTier} — `}
                {unlock.blocked ? unlock.blockedReason : unlock.detail}
              </span>
            </button>
          );
        })}
        {notice && <div className="text-dim">{notice}</div>}

        {retirement && (
          <button
            type="button"
            className={styles.retire}
            disabled={!retirement.eligible || retiring}
            onClick={() => void retire()}
          >
            {retiring ? 'FILING FORM R-1...' : `FILE FORM R-1 — RETIRE FOR ${retirement.award}`}
            <span className={`text-dim ${styles.retireNote}`}>
              {retirement.eligible
                ? 'Banks the pension now and assigns a successor. Ends this career.'
                : `Separation requires ${retirement.minServiceTicks} minutes of service. ${retirement.serviceTicks} filed.`}
            </span>
          </button>
        )}
        {retireNotice && <div className="text-dim">{retireNotice}</div>}
      </div>
      )}

      {section === 'career' && (
      <CommendationColumn
        data={data}
        award={state?.transferAward ?? 0}
        onChanged={async () => {
          await Promise.all([reload(), refresh()]);
        }}
      />
      )}

      {section === 'office' && (
      <RegistryColumn
        registry={state?.registry ?? { staff: [], spent: 0, unpaid: false }}
        gold={state?.character.gold ?? 0}
        onChanged={async () => {
          await Promise.all([reload(), refresh()]);
        }}
      />
      )}
      </div>
    </>
  );
}
