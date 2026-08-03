import { useCallback, useState } from 'react';
import { assignmentProgressText, assignmentSpec, type AssignmentId } from '@deepholdings/shared';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import columns from './columns.module.css';
import styles from './BulletinScreen.module.css';

/** World event, guild objective, and the public death feed. */
export function BulletinScreen() {
  const load = useCallback(() => api.getBulletin(), []);
  const { data, error, loading, reload } = useResource(load, 60_000);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const accept = async (id: AssignmentId) => {
    setBusy(id);
    setNotice(null);
    try {
      await api.acceptAssignment(id);
      await reload();
    } catch {
      setNotice('The assignment was not issued.');
    } finally {
      setBusy(null);
    }
  };

  const abandon = async () => {
    setBusy('abandon');
    setNotice(null);
    try {
      await api.abandonAssignment();
      await reload();
    } catch {
      setNotice('The file would not close.');
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <div className="text-dim">Retrieving bulletin...</div>;
  if (!data) return <div className="text-dim">{error ?? 'Bulletin unavailable.'}</div>;

  const { world, deaths, guild, assignments } = data;
  const open = assignments.find((entry) => entry.active);
  const share = Math.min(100, Math.round((world.guildProgress / Math.max(1, world.guildTarget)) * 100));

  return (
    <div className={columns.columns}>
      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>WORLD EVENT</div>
        <div className="text-body">{world.event}</div>
        <div className={`text-head ${columns.headLater}`}>GUILD — {world.guildName}</div>
        <div className="text-body">{world.guildObjective}</div>
        <div className="text-body">
          <span className="text-bright">
            {world.guildProgress.toLocaleString()} / {world.guildTarget.toLocaleString()}
          </span>{' '}
          ({share}%)
        </div>
        {/*
          The personal number, without which a shared bar is one you cannot tell
          whether you are affecting — the same defect the bar itself had when it
          advanced on a timer.
        */}
        <div className="text-dim">
          {guild.contribution > 0
            ? `This office has contributed ${guild.contribution.toLocaleString()}.`
            : 'This office has contributed nothing to the current objective.'}
          {guild.paid > 0 ? ` Paid to date: ${guild.paid.toLocaleString()} gold.` : ''}
        </div>
      </div>

      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>SPECIAL ASSIGNMENTS</div>
        <div className="text-dim">
          Optional postings under suspended conditions. Free to accept, free to
          hand back, and nothing is lost by failing one.
        </div>
        {assignments.map((offer) => {
          const spec = assignmentSpec(offer.id);
          const state = offer.completed ? 'owned' : offer.active ? 'affordable' : 'locked';
          return (
            <div key={offer.id} className={columns.stackedRow}>
              <button
                type="button"
                className={styles.assignment}
                data-state={state}
                disabled={offer.completed || open !== undefined || busy !== null}
                onClick={() => void accept(offer.id)}
              >
                <span className={styles.assignmentHead}>
                  <span className={offer.completed ? 'text-dim' : 'text-body'}>{offer.name}</span>
                  <span className={offer.completed ? 'text-dim' : 'text-bright'}>
                    {offer.completed
                      ? 'CLOSED'
                      : busy === offer.id
                        ? '...'
                        : `${offer.reward} COMMENDATION${offer.reward === 1 ? '' : 'S'}`}
                  </span>
                </span>
                <span className="text-dim">{offer.brief}</span>
              </button>
              {offer.active && spec && (
                <div className="text-bright">
                  In progress — {assignmentProgressText(spec, offer.progress)}.{' '}
                  <button type="button" className={styles.abandon} onClick={() => void abandon()}>
                    HAND BACK
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {notice && <div className="text-dim">{notice}</div>}
      </div>

      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>DEATH FEED (PUBLIC)</div>
        {deaths.length === 0 && (
          <div className="text-dim">No deaths on file. The Authority remains suspicious.</div>
        )}
        {deaths.map((death) => (
          <div key={death.id} className={`text-body ${columns.stackedRow}`}>
            {death.characterName} died on Floor {death.depth}. Cause of death: {death.cause}. Next of
            kin notified by form letter.
          </div>
        ))}
      </div>
    </div>
  );
}
