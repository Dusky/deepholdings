import { useEffect, useRef } from 'react';

/**
 * setInterval that always calls the latest callback and stops when `delay`
 * is null — keeps timers out of component bodies and re-renders.
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const saved = useRef(callback);

  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}
