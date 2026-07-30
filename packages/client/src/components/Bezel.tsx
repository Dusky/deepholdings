import { useServerClock } from '../hooks/useServerClock';
import { secondsUntil } from '../lib/activity';
import { formatCountdown } from '../lib/format';
import { useServer } from '../state/serverContext';
import { ScreenFrame } from './ScreenFrame';
import styles from './Bezel.module.css';

interface BezelProps {
  settingsOpen: boolean;
  onToggleSettings: () => void;
}

/** The beige case: status LED, model badge, heartbeat chip, settings gear. */
export function Bezel({ settingsOpen, onToggleSettings }: BezelProps) {
  const { state, receivedAt, link } = useServer();
  const serverNow = useServerClock(state?.now, receivedAt, 1000);

  // Counted against the server's own next-beat timestamp, not a local loop.
  const heartbeat = state ? formatCountdown(secondsUntil(state.world.nextBeatAt, serverNow)) : '--:--';
  const linkDown = link === 'degraded' || link === 'offline';

  return (
    <div className={styles.bezel}>
      <div className={styles.ledRow}>
        <div className={styles.led} data-link={link} aria-hidden="true" />
        <div className={styles.model}>SRA MODEL 4 — TERMINAL</div>
        <div className={styles.spacer} />
        {linkDown && <div className={styles.fault}>LINK FAULT — RETRYING</div>}
        <div className={styles.heartbeat}>NEXT WORLD TICK {heartbeat}</div>
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
