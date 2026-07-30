import { useGame } from '../state/gameContext';
import type { ScreenId } from '../types';
import styles from './TabRow.module.css';

const TABS: readonly { id: ScreenId; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'tavern', label: 'Tavern' },
  { id: 'orders', label: 'Orders' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'bulletin', label: 'Bulletin' },
];

/** Screen switch plus the live resource read-out. */
export function TabRow() {
  const { state, dispatch } = useGame();

  return (
    <div className={styles.tabRow} role="tablist" aria-label="Terminal screens">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={state.activeScreen === tab.id}
          aria-controls="screen-body"
          onClick={() => dispatch({ type: 'goTo', screen: tab.id })}
        >
          {tab.label}
        </button>
      ))}
      <div className={styles.spacer} />
      <div className={styles.chip}>{state.gold}g</div>
      <div className={styles.chip}>{state.supplies} supplies</div>
    </div>
  );
}
