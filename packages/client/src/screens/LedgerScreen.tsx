import { useCallback, useState } from 'react';
import { HEARTBEAT_SECONDS, type RequisitionId, type UnlockId } from '@deepholdings/shared';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useServerClock } from '../hooks/useServerClock';
import { secondsUntil } from '../lib/activity';
import { formatCountdown } from '../lib/format';
import { useServer } from '../state/serverContext';
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

/** Inventory, market, and the two things value can be turned into. */
export function LedgerScreen() {
  const { refresh, state } = useServer();
  const load = useCallback(() => api.getLedger(), []);
  const { data, error, loading, reload } = useResource(load, 60_000);
  const [pending, setPending] = useState<UnlockId | RequisitionId | null>(null);
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

  return (
    <div className={columns.columns}>
      <CabinetColumn
        inventory={data.inventory}
        market={data.market}
        office={data.office}
        onSell={sell}
        onBulkSell={bulkSell}
        busy={selling}
        notice={saleNotice}
      />

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

        <div className={`text-head ${columns.headLater}`}>REQUISITIONS — {data.gold}g</div>
        <div className={`text-dim ${styles.hint}`}>
          Office equipment, bought with gold. Permanent — a desk is not buried
          with the recruit who paid for it.
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

      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>PENSION — {data.pension.total}</div>
        <div className={`text-dim ${styles.hint}`}>
          Tap an unlock to redeem pension. Permanent. Survives death.
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
                  {unlock.owned ? 'COMPLETE' : pending === unlock.id ? '...' : unlock.cost}
                </span>
              </span>
              <span className={`text-dim ${styles.unlockDetail}`}>
                {unlock.maxTier > 1 && `Tier ${unlock.tier}/${unlock.maxTier} — `}
                {unlock.detail}
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

    </div>
  );
}
