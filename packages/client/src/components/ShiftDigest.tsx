import type { ShiftDigest as Digest } from '@deepholdings/shared';
import styles from './ShiftDigest.module.css';

interface ShiftDigestProps {
  digest: Digest;
  onDismiss: () => void;
}

function hours(minutes: number): string {
  if (minutes < 90) return `${minutes} minutes`;
  return `${Math.round(minutes / 60)} hours`;
}

/**
 * What happened while you were away.
 *
 * Coming back to sixty log lines is a wall of text; the shift is more legible
 * as a summary with the log underneath it. Written as the report a clerk would
 * leave on your desk, because everything else here is too.
 */
export function ShiftDigest({ digest, onDismiss }: ShiftDigestProps) {
  const rows: [string, string][] = [
    ['Gold', `${digest.goldDelta >= 0 ? '+' : ''}${digest.goldDelta}`],
    ['Deepest floor', String(digest.deepestFloor)],
    ['Encounters', String(digest.encounters)],
    ['Acquisitions', String(digest.acquisitions)],
  ];
  if (digest.levelsGained > 0) rows.push(['Grade reviews passed', String(digest.levelsGained)]);
  if (digest.permitsApproved > 0) rows.push(['Permits approved', String(digest.permitsApproved)]);

  return (
    <div className={styles.digest}>
      <div className={styles.head}>
        <span className="text-bright">SHIFT SUMMARY — {hours(digest.minutes)} unattended</span>
        {digest.died && <span className="text-dim">Concluded by death. See below.</span>}
      </div>

      <div className={styles.rows}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.row}>
            <span className="text-dim">{label}</span>
            <span className="text-body">{value}</span>
          </div>
        ))}
      </div>

      <button type="button" className={`text-dim ${styles.dismiss}`} onClick={onDismiss}>
        Acknowledge
      </button>
    </div>
  );
}
