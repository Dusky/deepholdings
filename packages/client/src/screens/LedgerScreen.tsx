import { useCallback, useState } from 'react';
import type { UnlockId } from '@deepholdings/shared';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useServer } from '../state/serverContext';
import columns from './columns.module.css';
import styles from './LedgerScreen.module.css';

/** Inventory, market, and the prestige spend. */
export function LedgerScreen() {
  const { refresh } = useServer();
  const load = useCallback(() => api.getLedger(), []);
  const { data, error, loading, reload } = useResource(load, 60_000);
  const [pending, setPending] = useState<UnlockId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        {data.inventory.map((item) => (
          <div key={item.name} className={columns.row}>
            <span className="text-body">{item.name}</span>
            <span className="text-dim">{item.note}</span>
          </div>
        ))}
      </div>

      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>MARKET</div>
        {data.market.map((lot) => (
          <div key={lot.name} className={columns.row}>
            <span className="text-body">{lot.name}</span>
            <span className="text-bright">{lot.price}g</span>
          </div>
        ))}
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
              key={unlock.id}
              type="button"
              className={styles.unlock}
              data-state={unlockState}
              disabled={!unlock.affordable || pending !== null}
              onClick={() => void buy(unlock.id)}
            >
              <span className={unlock.owned ? 'text-bright' : 'text-body'}>{unlock.label}</span>
              <span className={unlock.owned ? 'text-bright' : 'text-dim'}>
                {unlock.owned ? 'OWNED' : pending === unlock.id ? '...' : unlock.cost}
              </span>
            </button>
          );
        })}
        {notice && <div className="text-dim">{notice}</div>}
      </div>
    </div>
  );
}
