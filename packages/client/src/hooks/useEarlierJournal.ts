import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { JournalEntry } from '@deepholdings/shared';
import { api } from '../api/client';

/** Ids are a numeric sequence on both adapters; string order would lie. */
function byId(a: JournalEntry, b: JournalEntry): number {
  return Number(a.id) - Number(b.id);
}

/**
 * The log, plus however much of the file the officer has asked to see.
 *
 * The state response carries the most recent lines — 60, or more with Extended
 * Journal Retention. Everything before that is fetched a page at a time and
 * prepended, so retention decides what arrives unasked and never what may be
 * read.
 */
export function useEarlierJournal(
  characterId: string | undefined,
  current: JournalEntry[],
  /** Lines the opening page carries, so a short file offers no dead control. */
  openingSize: number,
) {
  const [older, setOlder] = useState<JournalEntry[]>([]);
  // A first-day officer with three lines has nothing behind them, and offering
  // to fetch it is a button that exists only to say "there is nothing here".
  const [hasMore, setHasMore] = useState(() => current.length >= openingSize);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const anchor = useRef<{ element: Element; fromBottom: number } | null>(null);

  // A successor is a new case file: nothing paged in belongs to them.
  useEffect(() => {
    setOlder([]);
    setHasMore(current.length >= openingSize);
    setFailed(false);
    // Deliberately keyed on the recruit alone: this resets the file, and must
    // not re-run every time a tick appends a line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  const entries = useMemo(() => {
    const merged = new Map(older.map((entry) => [entry.id, entry]));
    for (const entry of current) merged.set(entry.id, entry);
    return [...merged.values()].sort(byId);
  }, [older, current]);

  // Prepending pushes everything down, so without this the reader is thrown
  // several screens away from the line they were reading.
  useLayoutEffect(() => {
    const held = anchor.current;
    if (!held) return;
    anchor.current = null;
    held.element.scrollTop = held.element.scrollHeight - held.fromBottom;
  }, [older]);

  const loadEarlier = useCallback(async () => {
    const oldest = entries[0];
    if (!oldest || loading) return;
    setLoading(true);
    setFailed(false);

    const element = document.getElementById('screen-body');
    if (element) {
      anchor.current = { element, fromBottom: element.scrollHeight - element.scrollTop };
    }

    try {
      const page = await api.getJournalBefore(oldest.id);
      setHasMore(page.hasMore);
      if (page.entries.length === 0) {
        anchor.current = null;
        return;
      }
      setOlder((previous) => [...page.entries, ...previous]);
    } catch {
      anchor.current = null;
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [entries, loading]);

  /** Lines the officer paged in. History does not get typed out at them. */
  const history = useMemo(() => new Set(older.map((entry) => entry.id)), [older]);

  return { entries, history, hasMore, loading, failed, loadEarlier };
}
