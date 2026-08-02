import { useServer } from '../state/serverContext';
import { ScreenFrame } from './ScreenFrame';
import styles from './Bezel.module.css';

interface BezelProps {
  settingsOpen: boolean;
  onToggleSettings: () => void;
}

/**
 * The beige case: status LED, model badge, settings gear.
 *
 * **No clock.** This used to carry `NEXT WORLD TICK m:ss`, counting down to the
 * world heartbeat, and it was wrong in three ways at once.
 *
 * It was the least actionable thing in the game given the most prominent
 * position. A beat rerolls market demand, nudges the guild bar, and every
 * twelfth beat changes the bulletin event — of which only the first is
 * something a player might wait for, and only while deciding whether to sell.
 * That decision happens on the Ledger, so the countdown lives there now.
 *
 * It argued against the design. "Two check-ins a day should be plenty" and a
 * second-by-second countdown at the top of every screen are not the same
 * product, and on a phone it was worse than that — the model badge is hidden in
 * portrait, so the countdown *was* the title bar.
 *
 * And it re-rendered the entire application once a second. `useServerClock` at
 * 1000ms put a state change here, `ScreenFrame` is a child, nothing in this
 * tree is memoised: measured at 21 Console renders in 20 idle seconds, with no
 * input and no poll due. Removing the clock took that to the poll interval.
 */
export function Bezel({ settingsOpen, onToggleSettings }: BezelProps) {
  const { link } = useServer();
  const linkDown = link === 'degraded' || link === 'offline';

  return (
    <div className={styles.bezel}>
      <div className={styles.ledRow}>
        <div className={styles.led} data-link={link} aria-hidden="true" />
        <div className={styles.model}>SRA MODEL 4 — TERMINAL</div>
        <div className={styles.spacer} />
        {linkDown && <div className={styles.fault}>LINK FAULT — RETRYING</div>}
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
