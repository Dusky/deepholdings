import type { CSSProperties } from 'react';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useServerClock } from '../hooks/useServerClock';
import { clockOf, currentActivity, secondsToNextTick, tickProgress } from '../lib/activity';
import { useServer } from '../state/serverContext';
import { useSettings } from '../state/settingsContext';
import styles from './TerminalScreen.module.css';

interface TerminalScreenProps {
  revealSkipped: boolean;
}

/** The whole cascade finishes within this budget, however long the journal is. */
const CASCADE_SECONDS = 2.4;

/** Reveal timing mirrors a monospace teletype: ~18ms per character. */
function revealStyle(text: string, index: number, count: number): CSSProperties {
  // Staggering by a fixed per-line delay was fine for a 22-line fixture, but
  // a resolved journal is much longer — spread the same cascade across it
  // instead of making the player wait line by line.
  const position = count > 1 ? index / (count - 1) : 0;
  return {
    '--reveal-duration': `${Math.max(0.4, text.length * 0.018)}s`,
    '--reveal-steps': Math.max(4, text.length),
    '--reveal-delay': `${(position * CASCADE_SECONDS).toFixed(2)}s`,
  } as CSSProperties;
}

/** Default screen: who you have, what they are doing, what they filed. */
export function TerminalScreen({ revealSkipped }: TerminalScreenProps) {
  const { state, receivedAt } = useServer();
  const { effectsOn, reducedMotion, highContrast } = useSettings();
  const serverNow = useServerClock(state?.now, receivedAt);

  const animate = effectsOn && !highContrast && !reducedMotion;
  const revealed = revealSkipped || !animate;

  if (!state) return null;
  const { character, orders, journal } = state;

  return (
    <>
      <div className={`text-bright ${styles.statLine}`}>
        {character.name} — Lvl {character.level} — HP {character.hp}/{character.maxHp} — Depth{' '}
        {character.depth} — Permit D-{character.permitTier}
      </div>

      <div className={styles.activity}>
        <div className={styles.activityRow}>
          <span className="text-bright">{currentActivity(character, orders)}</span>
          {/* Honest ETA: time to the next server resolution, not a fake timer. */}
          <span className="text-dim">{secondsToNextTick(serverNow)}s</span>
        </div>
        <ProgressBar value={tickProgress(serverNow)} label="Time to next resolution" />
      </div>

      <div className={styles.log} role="log">
        {journal.map((entry, i) => (
          <div key={entry.id} className={styles.logRow}>
            <span className={`text-dim ${styles.time}`}>{clockOf(entry.at)}</span>
            <span
              className={`text-body ${styles.text}`}
              data-revealed={revealed}
              style={revealed ? undefined : revealStyle(entry.text, i, journal.length)}
            >
              {entry.text}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
