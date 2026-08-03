import type { CSSProperties } from 'react';
import { useCallback, useState } from 'react';
import { caseFileTitle, journalLines } from '@deepholdings/shared';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ShiftDigest } from '../components/ShiftDigest';
import { useEarlierJournal } from '../hooks/useEarlierJournal';
import { useServerClock } from '../hooks/useServerClock';
import { clockOf, currentActivity, secondsToNextTick, tickProgress } from '../lib/activity';
import { api } from '../api/client';
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

/** Bureaucratic estimates: vague on purpose, but never wrong. */
function formatWait(seconds: number): string {
  if (seconds <= 60) return 'imminent';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  return `${Math.round(minutes / 60)} hours`;
}

/** Default screen: who you have, what they are doing, what they filed. */
export function TerminalScreen({ revealSkipped }: TerminalScreenProps) {
  const { state, receivedAt, refresh } = useServer();
  const [expediting, setExpediting] = useState(false);
  const [expediteNotice, setExpediteNotice] = useState<string | null>(null);

  const expedite = async () => {
    setExpediting(true);
    setExpediteNotice(null);
    try {
      await api.expeditePermit();
      await refresh();
    } catch {
      setExpediteNotice('The clerk was unmoved. Nothing was charged.');
    } finally {
      setExpediting(false);
    }
  };
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

  const {
    entries: journal,
    history,
    hasMore,
    loading: loadingEarlier,
    failed: earlierFailed,
    loadEarlier,
  } = useEarlierJournal(
    state?.character.id,
    state?.journal ?? [],
    journalLines(state?.office.requisitions ?? []),
  );

  const animate = effectsOn && !highContrast && !reducedMotion;
  const revealed = revealSkipped || !animate;

  if (!state) return null;
  const { character, orders } = state;
  const clearance = state.clearance ?? [];

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

      {/* The next rung, always visible while it is being processed: the
          genre's hundred-hour churn is "nothing is ahead of me". */}
      {state.pendingPermit && (
        <div className={`text-dim ${styles.ladder}`}>
          Permit D-{state.pendingPermit.tier} in processing — authorises Depth{' '}
          {state.pendingPermit.authorisesDepth}. Estimated{' '}
          {formatWait(state.pendingPermit.secondsRemaining)}.
          {/*
            Form 4-E. The only thing on this screen that rewards being here
            rather than coming back later — so it lives beside the wait it
            shortens, and says nothing when there is nothing to chase.
          */}
          {!state.pendingPermit.expedited && (
            <>
              {' '}
              <button
                type="button"
                className={styles.expedite}
                disabled={
                  expediting || state.character.gold < state.pendingPermit.expediteCost
                }
                onClick={() => void expedite()}
              >
                {expediting
                  ? 'FILING 4-E...'
                  : `FILE FORM 4-E — ${state.pendingPermit.expediteCost}g TO HALVE IT`}
              </button>
            </>
          )}
          {expediteNotice && <span className="text-dim"> {expediteNotice}</span>}
        </div>
      )}

      {/* Death is not the only way to bank a pension, and for a recruit who
          is not dying it is the only one they would ever discover. Quiet and
          standing, like the permit clock — not a nag. */}
      {state.retirement?.eligible && state.retirement.award > 0 && (
        <div className={`text-dim ${styles.ladder}`}>
          Form R-1 available — {character.name} has served{' '}
          {Math.round(state.retirement.serviceTicks / 60)} hours. Separation assessed at{' '}
          {state.retirement.award}.
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

      {/* One line, not the drawer. This used to print every file with every
          clause name run together and no numbers, which was the only view of
          the game's one system with decisions in it. The Armoury is that view
          now; the Terminal says what is carried and where to read it. */}
      {state.caseFiles && state.caseFiles.length > 0 && (
        <div className={`text-dim ${styles.ladder}`}>
          {state.caseFiles.length === 1
            ? `1 case file on hand — ${caseFileTitle(state.caseFiles[0])}.`
            : `${state.caseFiles.length} case files on hand.`}{' '}
          {clearance.includes('armoury') ? 'Filed in the Armoury.' : ''}
        </div>
      )}

      <div className={styles.log} role="log">
        {hasMore && (
          <button
            type="button"
            className={styles.earlier}
            disabled={loadingEarlier}
            onClick={() => void loadEarlier()}
          >
            {loadingEarlier ? 'RETRIEVING...' : 'EARLIER ENTRIES'}
          </button>
        )}
        {!hasMore && journal.length > 0 && (
          <div className={`text-dim ${styles.fileStart}`}>
            Start of file. Nothing precedes this recruit's appointment.
          </div>
        )}
        {earlierFailed && (
          <div className={`text-dim ${styles.fileStart}`}>
            Archive did not answer. The clerk suggests trying later.
          </div>
        )}
        {journal.map((entry, i) => {
          // Paged-in history is not typed out: the officer asked for it, and
          // watching two hundred lines cascade is not a reward.
          const done = revealed || typed.has(entry.id) || history.has(entry.id);
          return (
            <div key={entry.id} className={styles.logRow} data-kind={entry.kind ?? 'routine'}>
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
