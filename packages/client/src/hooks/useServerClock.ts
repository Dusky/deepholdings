import { useEffect, useState } from 'react';

/**
 * Estimated server time.
 *
 * Countdowns and the tick progress bar must not trust the device clock — a
 * phone with a skewed clock would otherwise show a heartbeat that never
 * arrives. Every snapshot carries the server's `now`, so we track the offset
 * and extrapolate between refreshes.
 */
export function useServerClock(serverNow: string | undefined, receivedAt: number, stepMs = 250): Date {
  const offset = serverNow && receivedAt ? new Date(serverNow).getTime() - receivedAt : 0;
  const [now, setNow] = useState(() => new Date(Date.now() + offset));

  useEffect(() => {
    setNow(new Date(Date.now() + offset));
    const timer = setInterval(() => setNow(new Date(Date.now() + offset)), stepMs);
    return () => clearInterval(timer);
  }, [offset, stepMs]);

  return now;
}
