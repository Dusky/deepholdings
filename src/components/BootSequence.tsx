import styles from './BootSequence.module.css';

interface BootSequenceProps {
  lines: readonly string[];
  onSkip: () => void;
}

/** Cold-launch BIOS crawl. Blank lines keep their height, so the cadence of
 *  the original listing survives. */
export function BootSequence({ lines, onSkip }: BootSequenceProps) {
  return (
    <div className={styles.boot}>
      {lines.map((line, i) => (
        <div key={`${i}-${line}`} className={styles.line}>
          {line}
        </div>
      ))}
      <div className={styles.cursor}>█</div>
      <button type="button" className={styles.skipHint} onClick={onSkip}>
        (tap to skip)
      </button>
    </div>
  );
}
