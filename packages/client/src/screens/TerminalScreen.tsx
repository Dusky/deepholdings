import type { CSSProperties } from 'react';
import { useCallback, useState } from 'react';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ShiftDigest } from '../components/ShiftDigest';
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
  const [digestDismissed, setDigestDismissed] = useState(false);
  // A line is nowrap while it types, so it has to be released back to normal
  // wrapping when its animation ends — otherwise long lines stay clipped at
  // the right edge for good, which is most lines on a phone.
  const [typed, setTyped] = useState<ReadonlySet<string>>(() => new Set());
  const markTyped = useCallback((id: string) => {
    setTyped((previous) => (previous.has(id) ? previous : new Set(previous).add(id)));
  }, []);

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

      {state.digest && !digestDismissed && (
        <ShiftDigest digest={state.digest} onDismiss={() => setDigestDismissed(true)} />
      )}

      {/* The first session's only nudge: the recruit is descending on defaults
          until the officer says otherwise. */}
      {!state.ordersFiled && (
        <div className={`text-dim ${styles.nudge}`}>
          Form SO-1 has not been filed. Descent proceeds on default orders.
        </div>
      )}

      <div className={styles.activity}>
        <div className={styles.activityRow}>
          <span className="text-bright">{currentActivity(character, orders)}</span>
          {/* Honest ETA: time to the next server resolution, not a fake timer. */}
          <span className="text-dim">{secondsToNextTick(serverNow)}s</span>
        </div>
        <ProgressBar value={tickProgress(serverNow)} label="Time to next resolution" />
      </div>

      <div className={styles.log} role="log">
        {journal.map((entry, i) => {
          const done = revealed || typed.has(entry.id);
          return (
            <div key={entry.id} className={styles.logRow}>
              <span className={`text-dim ${styles.time}`}>{clockOf(entry.at)}</span>
              <span
                className={`text-body ${styles.text}`}
                data-revealed={done}
                style={done ? undefined : revealStyle(entry.text, i, journal.length)}
                onAnimationEnd={() => markTyped(entry.id)}
              >
                {entry.text}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
