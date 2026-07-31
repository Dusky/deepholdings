import { requisitionTier, type PendingPermit } from '@deepholdings/shared';
import { useServer } from '../state/serverContext';
import type { ScreenId } from '../types';
import styles from './TabRow.module.css';

/**
 * The permit clock in the width of a chip, and only while there is one.
 *
 * A standing "permit ok" chip is pure noise that costs the tab strip a third
 * of its width on a phone — the tabs scroll, so anything parked beside them is
 * taken straight out of navigation.
 */
function permitChip(permit: PendingPermit | null): string | null {
  if (!permit) return null;
  const minutes = Math.max(0, Math.ceil(permit.secondsRemaining / 60));
  return minutes >= 60
    ? `D-${permit.tier} ${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
    : `D-${permit.tier} ${minutes}m`;
}

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
  // Screens the officer has not been cleared for do not exist as far as the
  // client is concerned; the server decides.
  const clearance = state?.clearance ?? ['terminal'];
  const pinned = requisitionTier(state?.office.requisitions ?? [], 'readouts') >= 1;
  const permit = permitChip(state?.pendingPermit ?? null);

  return (
    <div className={styles.tabRow}>
      <div className={styles.tabs} role="tablist" aria-label="Terminal screens">
        {TABS.filter((tab) => clearance.includes(tab.id)).map((tab) => (
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
      </div>
      <div className={styles.chips}>
        <div className={styles.chip}>{character?.gold ?? 0}g</div>
        <div className={styles.chip}>{character?.supplies ?? 0} supplies</div>
        {/* Pinned Readouts: depth and the permit clock follow you off the
            Terminal. Both numbers are already on screen there — this buys the
            trip back, not the information. */}
        {pinned && (
          <>
            <div className={styles.chip}>F{character?.depth ?? 0}</div>
            {permit && <div className={styles.chip}>{permit}</div>}
          </>
        )}
      </div>
    </div>
  );
}
