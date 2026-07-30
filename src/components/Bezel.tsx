import { formatCountdown } from '../lib/format';
import { useGame } from '../state/gameContext';
import { ScreenFrame } from './ScreenFrame';
import styles from './Bezel.module.css';

interface BezelProps {
  settingsOpen: boolean;
  onToggleSettings: () => void;
}

/** The beige case: status LED, model badge, heartbeat chip, settings gear. */
export function Bezel({ settingsOpen, onToggleSettings }: BezelProps) {
  const { state } = useGame();

  return (
    <div className={styles.bezel}>
      <div className={styles.ledRow}>
        {/* Decorative here; wire to the real heartbeat event in production. */}
        <div className={styles.led} aria-hidden="true" />
        <div className={styles.model}>SRA MODEL 4 — TERMINAL</div>
        <div className={styles.spacer} />
        <div className={styles.heartbeat}>NEXT WORLD TICK {formatCountdown(state.heartbeatSecs)}</div>
        <button
          type="button"
          className={styles.gear}
          onClick={onToggleSettings}
          aria-expanded={settingsOpen}
          aria-label="Quality floor settings"
        >
          ⚙
        </button>
      </div>
      <ScreenFrame />
    </div>
  );
}
