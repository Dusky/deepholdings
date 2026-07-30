import { useCallback, useState } from 'react';
import { useBootSequence } from '../hooks/useBootSequence';
import { useGame } from '../state/gameContext';
import { BootSequence } from './BootSequence';
import { Console } from './Console';
import { DeathOverlay } from './DeathOverlay';
import styles from './ScreenFrame.module.css';

/**
 * The glass. Owns boot state and the one-time teletype skip, and stacks the
 * scanline/vignette overlays above whatever is on screen.
 */
export function ScreenFrame() {
  const { state } = useGame();
  const { booted, visibleLines, skip } = useBootSequence();
  const [revealSkipped, setRevealSkipped] = useState(false);

  // Tap anywhere: first tap skips the boot, later taps finish the teletype.
  const handleTap = useCallback(() => {
    if (!booted) skip();
    else setRevealSkipped(true);
  }, [booted, skip]);

  const tappable = !booted || !revealSkipped;

  return (
    <div className={styles.frame}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div className={styles.screen} data-tappable={tappable} onClick={handleTap}>
        {booted ? (
          <Console revealSkipped={revealSkipped} />
        ) : (
          <BootSequence lines={visibleLines} onSkip={skip} />
        )}
        {state.isDead && <DeathOverlay />}
        <div className={styles.scanlines} aria-hidden="true" />
        <div className={styles.vignette} aria-hidden="true" />
      </div>
    </div>
  );
}
