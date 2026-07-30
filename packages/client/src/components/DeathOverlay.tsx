import { useGame } from '../state/gameContext';
import { FileButton } from './ui/FileButton';
import styles from './DeathOverlay.module.css';

/**
 * End of a run: bank the pension, take delivery of the next recruit.
 * Server-driven in production — the client only renders the outcome.
 */
export function DeathOverlay() {
  const { state, dispatch } = useGame();
  const death = state.deathInfo;
  if (!death) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Character deceased">
      <div className={styles.card}>
        <div className={styles.alert}>CHARACTER DECEASED</div>
        <div className={`text-bright ${styles.name}`}>{death.name}</div>
        <div className="text-body">Cause of death: {death.cause}</div>
        <div className="text-body">
          Reached Floor {death.floor}. Lifetime gold handled: {death.gold}g.
        </div>
        <div className={styles.divider} />
        <div className="text-bright">Pension awarded: +{death.pensionAwarded}</div>
        <div className="text-dim">
          Next of kin notified by form letter. A new recruit has been assigned.
        </div>
        <FileButton onClick={() => dispatch({ type: 'claimPension' })}>
          FILE FOR PENSION &amp; CONTINUE
        </FileButton>
      </div>
    </div>
  );
}
