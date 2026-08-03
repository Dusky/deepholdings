import { useCallback } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import columns from './columns.module.css';

/** World event, guild objective, and the public death feed. */
export function BulletinScreen() {
  const load = useCallback(() => api.getBulletin(), []);
  const { data, error, loading } = useResource(load, 60_000);

  if (loading && !data) return <div className="text-dim">Retrieving bulletin...</div>;
  if (!data) return <div className="text-dim">{error ?? 'Bulletin unavailable.'}</div>;

  const { world, deaths, guild } = data;
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
