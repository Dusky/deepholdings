import { useState, type CSSProperties } from 'react';
import { useGame } from '../state/gameContext';
import { isUnlockOwned } from '../state/gameReducer';
import { useSettings } from '../state/settingsContext';
import { Bezel } from './Bezel';
import { SettingsPanel } from './SettingsPanel';
import styles from './Desk.module.css';

/**
 * The desk the machine sits on. Owns the palette/effect data attributes that
 * every descendant's CSS reads.
 */
export function Desk() {
  const { state } = useGame();
  const { effectsOn, reducedMotion, highContrast, fontScale } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // High contrast takes the whole effect stack down with it — the palette
  // swap is the point, and glow/aberration would undo it.
  const effectsActive = effectsOn && !highContrast;
  const greenPhosphor = isUnlockOwned(state, 'green') && !highContrast;

  return (
    <div
      className={styles.desk}
      style={{ '--font-scale': fontScale } as CSSProperties}
      data-effects={effectsActive ? 'on' : 'off'}
      data-motion={reducedMotion ? 'reduced' : 'full'}
      data-contrast={highContrast ? 'high' : 'normal'}
      data-phosphor={greenPhosphor ? 'green' : 'amber'}
    >
      <Bezel settingsOpen={settingsOpen} onToggleSettings={() => setSettingsOpen((open) => !open)} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
