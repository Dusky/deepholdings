import { useServer } from '../state/serverContext';
import type { ScreenId } from '../types';
import styles from './TabRow.module.css';

const TABS: readonly { id: ScreenId; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'tavern', label: 'Tavern' },
  { id: 'orders', label: 'Orders' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'bulletin', label: 'Bulletin' },
];

interface TabRowProps {
  activeScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
}

/** Screen switch plus the live resource read-out. */
export function TabRow({ activeScreen, onNavigate }: TabRowProps) {
  const { state } = useServer();
  const character = state?.character;

  return (
    <div className={styles.tabRow} role="tablist" aria-label="Terminal screens">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={activeScreen === tab.id}
          aria-controls="screen-body"
          onClick={() => onNavigate(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      <div className={styles.spacer} />
      <div className={styles.chip}>{character?.gold ?? 0}g</div>
      <div className={styles.chip}>{character?.supplies ?? 0} supplies</div>
    </div>
  );
}
