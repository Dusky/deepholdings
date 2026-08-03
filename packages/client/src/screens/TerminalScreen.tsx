import type { CSSProperties } from 'react';
import { useCallback, useState } from 'react';
import { caseFileTitle, journalLines, permitDepthLimit } from '@deepholdings/shared';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ShiftDigest } from '../components/ShiftDigest';
import { useEarlierJournal } from '../hooks/useEarlierJournal';
import { useServerClock } from '../hooks/useServerClock';
import { clockOf, currentActivity, secondsToNextTick, tickProgress } from '../lib/activity';
import { api } from '../api/client';
import { useScreen } from '../state/screenContext';
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

  const { goTo } = useScreen();

  if (!state) return null;
  const { character, orders } = state;
  const clearance = state.clearance ?? [];

  return (
    <>
      {/*
        Four facts, each in one vocabulary.
        - `Lvl` was the only place in the product that said "Lvl"; everything
          else said Grade, which is also what a case file's quality is called.
          It is Level here and Grade means the thing on a case file.
        - `Depth 7` sat two lines above "Descending to Floor 8" and beside
          "Permit D-6", which was three names for one axis. It is Floor now.
        - The permit says what it authorises. Standing alone, `Permit D-6` is
          a number a player cannot act on; what they want to know is how deep
          it lets them go, and that was only ever stated while the *next* one
          was being processed.
      */}
      <div className={`text-bright ${styles.statLine}`}>
        {character.name} — Level {character.level} — HP {character.hp}/{character.maxHp} — Floor{' '}
        {character.depth} — Permit D-{character.permitTier} (to Floor{' '}
        {permitDepthLimit(character.permitTier, orders.site ?? 'holdings')})
      </div>

      {state.digest && !digestDismissed && (
        <ShiftDigest digest={state.digest} onDismiss={() => setDigestDismissed(true)} />
      )}

      {/*
        What you are working toward, and what to do about it.

        Placed directly under the stat line because it is the answer to the
        first two questions anybody has on opening the app, and neither was
        answered anywhere in the product before now. It is deliberately plain
        prose rather than a styled call to action: this is orientation, not a
        prompt, and an idle game that shouts at its player has misunderstood
        what it is for.
      */}
      {state.guidance && (
        <div className={styles.guidance}>
          <div className="text-dim">{state.guidance.aim}</div>
          <div className={styles.guidanceAction}>
            {state.guidance.action ? (
              <button
                type="button"
                className={styles.link}
                onClick={() => goTo(state.guidance.action!.screen)}
              >
                {state.guidance.action.text}
              </button>
            ) : (
              /* The honest answer, most of the time, and it is not a failure to
                 give it. Two check-ins a day should be plenty. */
              <span className="text-dim">Nothing needs you right now.</span>
            )}
          </div>
        </div>
      )}

      {/*
        The unfiled-orders nudge used to live here, reading "Form SO-1 has not
        been filed. Descent proceeds on default orders." — a problem named in a
        vocabulary the player had not been taught, with no indication of where
        to fix it.
        It is gone rather than rewritten. `guidance` above already opens on
        exactly this case and says it better, with the aim attached; keeping
        both put the same sentence on screen twice, one above the other, on the
        first screen a new player ever sees. Caught by looking at a screenshot
        of hour zero, which is a thing nobody had done.
      */}

      {/* The next rung, always visible while it is being processed: the
          genre's hundred-hour churn is "nothing is ahead of me". */}
      {state.pendingPermit && (
        <div className={`text-dim ${styles.ladder}`}>
          Permit D-{state.pendingPermit.tier} being processed — it will let you
          work down to Floor {state.pendingPermit.authorisesDepth}. About{' '}
          {formatWait(state.pendingPermit.secondsRemaining)} to go.
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
      {/*
        The line that made the case for all of this. It read:
          "Form R-1 available — GRIMWALD I has served 32 hours. Separation
           assessed at 3056."
        Three invented terms and a bare number. The number is pension, and the
        word "pension" was not in the sentence — so the one line telling a
        player how to bank permanent progress was unreadable, and it is the
        mechanic the whole game is built to teach.
      */}
      {state.retirement?.eligible && state.retirement.award > 0 && (
        <div className={`text-dim ${styles.ladder}`}>
          {character.name} has served{' '}
          {Math.round(state.retirement.serviceTicks / 60)} hours. Retiring them
          now banks{' '}
          <span className="text-bright">
            {state.retirement.award.toLocaleString('en-GB')} pension
          </span>{' '}
          — permanent, kept through every future recruit — and a successor
          starts immediately.{' '}
          {clearance.includes('ledger') && (
            <button type="button" className={styles.link} onClick={() => goTo('ledger')}>
              Retire (Form R-1)
            </button>
          )}
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
