import { useCallback, useState } from 'react';
import { useBootSequence } from '../hooks/useBootSequence';
import { useServer } from '../state/serverContext';
import { BootSequence } from './BootSequence';
import { Console } from './Console';
import { DeathOverlay } from './DeathOverlay';
import { LinkFault } from './LinkFault';
import styles from './ScreenFrame.module.css';

/**
 * The glass. Owns boot state and the one-time teletype skip, and stacks the
 * scanline/vignette overlays above whatever is on screen.
 */
export function ScreenFrame() {
  const { state, error, refresh } = useServer();
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
        {!booted && <BootSequence lines={visibleLines} onSkip={skip} />}
        {/* The boot crawl doubles as the loading state. A cold client that
            cannot reach the Authority gets a fault card rather than an
            empty terminal. */}
        {booted && !state && <LinkFault message={error} onRetry={refresh} />}
        {booted && state && <Console revealSkipped={revealSkipped} />}
        {state?.pendingDeath && <DeathOverlay death={state.pendingDeath} />}
        <div className={styles.scanlines} aria-hidden="true" />
        <div className={styles.vignette} aria-hidden="true" />
      </div>
    </div>
  );
}
