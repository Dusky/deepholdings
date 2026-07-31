import { useCallback, useState } from 'react';
import type { UnlockId } from '@deepholdings/shared';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useServer } from '../state/serverContext';
import columns from './columns.module.css';
import styles from './LedgerScreen.module.css';

/** Inventory, market, and the prestige spend. */
export function LedgerScreen() {
  const { refresh, state } = useServer();
  const load = useCallback(() => api.getLedger(), []);
  const { data, error, loading, reload } = useResource(load, 60_000);
  const [pending, setPending] = useState<UnlockId | null>(null);
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

  if (loading && !data) return <div className="text-dim">Retrieving ledger...</div>;
  if (!data) return <div className="text-dim">{error ?? 'Ledger unavailable.'}</div>;

  return (
    <div className={columns.columns}>
      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>INVENTORY</div>
        {data.inventory.length === 0 && (
          <div className="text-dim">Filing cabinet empty. The Authority is unimpressed.</div>
        )}
        {data.inventory.map((item) => (
          <div key={item.name} className={styles.stock}>
            <div className={columns.row}>
              <span className="text-body">{item.name}</span>
              <span className="text-dim">{item.note}</span>
            </div>
            <div className={styles.stockActions}>
              <span className="text-dim">
                {item.unitOffer}g each · {item.stackOffer}g the lot
              </span>
              <button
                type="button"
                className={styles.sell}
                disabled={selling !== null}
                onClick={() => void sell(item.name)}
              >
                {selling === item.name ? 'FILING...' : 'SELL'}
              </button>
            </div>
          </div>
        ))}
        {saleNotice && <div className="text-dim">{saleNotice}</div>}
      </div>

      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>MARKET</div>
        <div className={`text-dim ${styles.hint}`}>
          Standing demand, revised each world tick. Applied to every sale.
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
