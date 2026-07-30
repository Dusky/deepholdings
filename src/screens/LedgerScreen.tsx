import { INVENTORY, MARKET } from '../data/fixtures';
import { useGame } from '../state/gameContext';
import columns from './columns.module.css';
import styles from './LedgerScreen.module.css';

/** Inventory, market, and the prestige spend. */
export function LedgerScreen() {
  const { state, dispatch } = useGame();

  return (
    <div className={columns.columns}>
      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>INVENTORY</div>
        {INVENTORY.map((item) => (
          <div key={item.name} className={columns.row}>
            <span className="text-body">{item.name}</span>
            <span className="text-dim">{item.note}</span>
          </div>
        ))}
      </div>

      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>MARKET</div>
        {MARKET.map((lot) => (
          <div key={lot.name} className={columns.row}>
            <span className="text-body">{lot.name}</span>
            <span className="text-bright">{lot.price}g</span>
          </div>
        ))}
      </div>

      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>PENSION — {state.pensionTotal}</div>
        <div className={`text-dim ${styles.hint}`}>
          Tap an unlock to redeem pension. Permanent. Survives death.
        </div>
        {state.unlocks.map((unlock) => {
          const affordable = !unlock.owned && state.pensionTotal >= unlock.cost;
          const unlockState = unlock.owned ? 'owned' : affordable ? 'affordable' : 'locked';
          return (
            <button
              key={unlock.id}
              type="button"
              className={styles.unlock}
              data-state={unlockState}
              disabled={!affordable}
              onClick={() => dispatch({ type: 'purchaseUnlock', id: unlock.id })}
            >
              <span className={unlock.owned ? 'text-bright' : 'text-body'}>{unlock.label}</span>
              <span className={unlock.owned ? 'text-bright' : 'text-dim'}>
                {unlock.owned ? 'OWNED' : unlock.cost}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
