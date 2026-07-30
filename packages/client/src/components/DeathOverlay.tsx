import { useState } from 'react';
import type { DeathRecord } from '@deepholdings/shared';
import { useServer } from '../state/serverContext';
import { FileButton } from './ui/FileButton';
import styles from './DeathOverlay.module.css';

interface DeathOverlayProps {
  death: DeathRecord;
}

/**
 * End of a run. The server has already recorded the death and computed the
 * award; the client renders it and files the paperwork.
 */
export function DeathOverlay({ death }: DeathOverlayProps) {
  const { claimPension } = useServer();
  const [filing, setFiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    setFiling(true);
    setError(null);
    try {
      await claimPension();
    } catch {
      setError('The pension office did not respond. The claim remains open.');
      setFiling(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Character deceased">
      <div className={styles.card}>
        <div className={styles.alert}>CHARACTER DECEASED</div>
        <div className={`text-bright ${styles.name}`}>{death.characterName}</div>
        <div className="text-body">Cause of death: {death.cause}</div>
        <div className="text-body">
          Reached Floor {death.depth}. Lifetime gold handled: {death.goldHandled}g.
        </div>
        <div className={styles.divider} />
        <div className="text-bright">Pension awarded: +{death.pensionAwarded}</div>
        <div className="text-dim">
          Next of kin notified by form letter. A new recruit has been assigned.
        </div>
        {error && <div className="text-dim">{error}</div>}
        <FileButton onClick={handleClaim}>
          {filing ? 'FILING...' : 'FILE FOR PENSION & CONTINUE'}
        </FileButton>
      </div>
    </div>
  );
}
