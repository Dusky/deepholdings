import { useEffect, useState } from 'react';

/** Subscribes to a media query. Used where layout state needs a JS branch. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** A phone held upright: the layout that drops the machine. */
export const COMPACT_QUERY = '(max-width: 720px) and (orientation: portrait)';
