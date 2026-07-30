import type { CSSProperties } from 'react';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ACTIVITIES, LOG_LINES } from '../data/fixtures';
import { useGame } from '../state/gameContext';
import { characterName } from '../state/gameReducer';
import { useSettings } from '../state/settingsContext';
import styles from './TerminalScreen.module.css';

interface TerminalScreenProps {
  revealSkipped: boolean;
}

/** Reveal timing mirrors a monospace teletype: ~18ms per character. */
function revealStyle(text: string, index: number): CSSProperties {
  return {
    '--reveal-duration': `${Math.max(0.4, text.length * 0.018)}s`,
    '--reveal-steps': Math.max(4, text.length),
    '--reveal-delay': `${index * 0.12}s`,
  } as CSSProperties;
}

/** Default screen: who you have, what they are doing, what they filed. */
export function TerminalScreen({ revealSkipped }: TerminalScreenProps) {
  const { state } = useGame();
  const { effectsOn, reducedMotion, highContrast } = useSettings();

  const animate = effectsOn && !highContrast && !reducedMotion;
  const revealed = revealSkipped || !animate;

  const etaSeconds = Math.max(0, Math.round((100 - state.activityProgress) / 25));

  return (
    <>
      <div className={`text-bright ${styles.statLine}`}>
        {characterName(state.recruitNum)} — Lvl 6 — HP 61/86 — Depth 6 — Permit D-5
      </div>

      <div className={styles.activity}>
        <div className={styles.activityRow}>
          <span className="text-bright">{ACTIVITIES[state.activityIdx]}</span>
          <span className="text-dim">{etaSeconds}s</span>
        </div>
        <ProgressBar value={state.activityProgress} label="Current activity progress" />
      </div>

      <div className={styles.log} role="log">
        {LOG_LINES.map((entry, i) => (
          <div key={`${entry.time}-${i}`} className={styles.logRow}>
            <span className={`text-dim ${styles.time}`}>{entry.time}</span>
            <span
              className={`text-body ${styles.text}`}
              data-revealed={revealed}
              style={revealed ? undefined : revealStyle(entry.text, i)}
            >
              {entry.text}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
