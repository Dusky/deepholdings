import { useState, type CSSProperties } from 'react';
import { useBackButton } from '../native/useBackButton';
import { useNotificationTap } from '../native/useNotificationTap';
import { usePush } from '../native/usePush';
import { useServer } from '../state/serverContext';
import { useSettings } from '../state/settingsContext';
import { Bezel } from './Bezel';
import { HelpPanel } from './HelpPanel';
import { SettingsPanel } from './SettingsPanel';
import styles from './Desk.module.css';

/**
 * The desk the machine sits on. Owns the palette/effect data attributes that
 * every descendant's CSS reads.
 */
export function Desk() {
  const { state } = useServer();
  const { effectsOn, reducedMotion, highContrast, fontScale } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useBackButton();
  useNotificationTap();
  usePush();

  // High contrast takes the whole effect stack down with it — the palette
  // swap is the point, and glow/aberration would undo it.
  const effectsActive = effectsOn && !highContrast;
  // Cosmetic unlock, owned server-side.
  const greenPhosphor = Boolean(state?.pension.unlocks.includes('phosphor1')) && !highContrast;

  return (
    <div
      className={styles.desk}
      style={{ '--font-scale': fontScale } as CSSProperties}
      data-effects={effectsActive ? 'on' : 'off'}
      data-motion={reducedMotion ? 'reduced' : 'full'}
      data-contrast={highContrast ? 'high' : 'normal'}
      data-phosphor={greenPhosphor ? 'green' : 'amber'}
    >
      <Bezel
        settingsOpen={settingsOpen}
        // Only one drawer at a time: they overlap, and two open panels on a
        // phone is the whole screen covered by chrome.
        onToggleSettings={() => {
          setSettingsOpen((open) => !open);
          setHelpOpen(false);
        }}
        helpOpen={helpOpen}
        onToggleHelp={() => {
          setHelpOpen((open) => !open);
          setSettingsOpen(false);
        }}
      />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
