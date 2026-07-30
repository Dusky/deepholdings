import { DEATH_FEED, GUILD, WORLD_EVENT } from '../data/fixtures';
import columns from './columns.module.css';

/** World event, guild objective, and the public death feed. */
export function BulletinScreen() {
  return (
    <div className={columns.columns}>
      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>WORLD EVENT</div>
        <div className="text-body">{WORLD_EVENT}</div>
        <div className={`text-head ${columns.headLater}`}>GUILD — {GUILD.name}</div>
        <div className="text-body">{GUILD.objective}</div>
      </div>

      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>DEATH FEED (PUBLIC)</div>
        {DEATH_FEED.map((notice) => (
          <div key={notice} className={`text-body ${columns.stackedRow}`}>
            {notice}
          </div>
        ))}
      </div>
    </div>
  );
}
