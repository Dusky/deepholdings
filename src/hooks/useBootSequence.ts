import { useCallback, useState } from 'react';
import { BOOT_LINES } from '../data/fixtures';
import { useInterval } from './useInterval';

const BOOT_INTERVAL_MS = 260;
/** Marks the session as already booted so a resume skips the BIOS lines. */
const SESSION_KEY = 'deepholdings.booted';

function alreadyBootedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberBooted(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Non-fatal: the boot sequence simply replays.
  }
}

export interface BootSequence {
  booted: boolean;
  visibleLines: readonly string[];
  skip: () => void;
}

/** Types the BIOS lines in one at a time on cold launch only. */
export function useBootSequence(): BootSequence {
  const [booted, setBooted] = useState(alreadyBootedThisSession);
  const [lineCount, setLineCount] = useState(0);

  const skip = useCallback(() => {
    setBooted(true);
    setLineCount(BOOT_LINES.length);
    rememberBooted();
  }, []);

  useInterval(
    () =>
      setLineCount((count) => {
        if (count >= BOOT_LINES.length) {
          skip();
          return count;
        }
        return count + 1;
      }),
    booted ? null : BOOT_INTERVAL_MS,
  );

  return {
    booted,
    visibleLines: booted ? BOOT_LINES : BOOT_LINES.slice(0, lineCount),
    skip,
  };
}
