import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api } from '../api/client';
import { COMPACT_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { usePersistentState } from '../hooks/usePersistentState';
import {
  COMMAND_PLACEHOLDER,
  completionsFor,
  parseCommand,
  type CommandContext,
} from '../lib/commands';
import { useServer } from '../state/serverContext';
import type { ScreenId } from '../types';
import styles from './CommandBar.module.css';

interface CommandBarProps {
  onNavigate: (screen: ScreenId) => void;
}

/** Enough history to be useful, not enough to become a diary. */
const HISTORY_LIMIT = 40;

/**
 * The other half of navigation: type where you want to go, and what to do.
 *
 * On a phone in portrait the bar collapses to a `>` button — the tabs already
 * cover navigation there, and a permanent input row spends a line of screen on
 * an affordance that needs the keyboard anyway.
 */
export function CommandBar({ onNavigate }: CommandBarProps) {
  const { refresh, state, fileOrders } = useServer();
  const [value, setValue] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = usePersistentState<{ entries: string[] }>(
    'deepholdings.commandHistory',
    () => ({ entries: [] }),
  );
  // -1 is "composing something new"; 0 is the most recent entry.
  const [recalled, setRecalled] = useState(-1);
  const compact = useMediaQuery(COMPACT_QUERY);
  const inputRef = useRef<HTMLInputElement>(null);

  // Rotating out of compact must not strand the bar half-open.
  useEffect(() => {
    if (!compact) setExpanded(false);
  }, [compact]);

  const open = () => {
    setExpanded(true);
    // Focus after paint, so the keyboard opens against the resized viewport.
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ block: 'nearest' });
    });
  };

  const collapse = () => {
    setExpanded(false);
    inputRef.current?.blur();
  };

  const context: CommandContext = useMemo(
    () => ({
      navigate: onNavigate,
      clearance: state?.clearance ?? ['terminal'],
      refresh,
      orders: state?.orders ?? null,
      fileOrders,
      async sellByName(query) {
        const ledger = await api.getLedger();
        const needle = query.toLowerCase();
        const matches = ledger.inventory.filter((item) =>
          item.name.toLowerCase().includes(needle),
        );
        if (matches.length === 0) return `Nothing on file matching "${query}".`;
        // Guessing which stack was meant is how an officer sells the wrong one.
        if (matches.length > 1) {
          return `That matches ${matches.length} stacks:\n${matches
            .map((item) => `  ${item.name}`)
            .join('\n')}`;
        }
        const sold = await api.sellItem(matches[0].name);
        await refresh();
        return `Sold ${sold.sold} x ${matches[0].name} for ${sold.goldReceived} gold. Receipt filed in triplicate.`;
      },
      async retire() {
        const result = await api.retireRecruit();
        await refresh();
        return `Separation processed. ${result.character.name} assigned.`;
      },
    }),
    [onNavigate, refresh, state?.clearance, state?.orders, fileOrders],
  );

  const suggestions = useMemo(
    () => (value.trim() || /\s$/.test(value) ? completionsFor(value).slice(0, 6) : []),
    [value],
  );

  const remember = (entry: string) => {
    setHistory((current) => ({
      // Re-running the same command should not fill the history with it.
      entries: [entry, ...current.entries.filter((e) => e !== entry)].slice(0, HISTORY_LIMIT),
    }));
    setRecalled(-1);
  };

  const submit = async (raw: string) => {
    const parsed = parseCommand(raw);
    if (!parsed) {
      // Never silent. An unrecognised word used to do nothing at all, which
      // reads as a broken input rather than a wrong word.
      setResponse(`Unrecognised: ${raw.trim().split(/\s+/)[0]}. Type \`help\`.`);
      return;
    }
    setBusy(true);
    try {
      setResponse(await parsed.spec.run(parsed.args, context));
    } catch {
      setResponse('The Authority declined to process that. It did not say why.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const raw = value.trim();
    if (!raw || busy) return;
    remember(raw);
    setValue('');
    void submit(raw);
    if (compact) collapse();
  };

  /** Step through history. `delta` of 1 goes further back. */
  const recall = (delta: number) => {
    const next = recalled + delta;
    if (next < -1 || next >= history.entries.length) return;
    setRecalled(next);
    setValue(next === -1 ? '' : history.entries[next]);
  };

  const complete = () => {
    const options = completionsFor(value);
    if (options.length === 0) return;
    if (options.length === 1) {
      setValue(`${options[0]} `);
      return;
    }
    setResponse(options.join('   '));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && compact) return collapse();
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      return recall(1);
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      return recall(-1);
    }
    if (event.key === 'Tab' && value.trim()) {
      event.preventDefault();
      complete();
    }
  };

  const collapsed = compact && !expanded;

  return (
    <div className={styles.dock} data-collapsed={collapsed}>
      {!collapsed && response && (
        <div className={`text-dim ${styles.response}`} role="status">
          {response}
        </div>
      )}

      {!collapsed && suggestions.length > 0 && (
        <div className={styles.suggestions}>
          {suggestions.map((option) => (
            <button
              key={option}
              type="button"
              className={styles.suggestion}
              // Chips rather than Tab alone: the platform this ships on first
              // has no Tab key, and completion that needs a desktop keyboard
              // would make typing the second-class path it must not be.
              onClick={() => {
                setValue(`${option} `);
                inputRef.current?.focus();
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      <form className={styles.bar} data-collapsed={collapsed} onSubmit={handleSubmit}>
        <button
          type="button"
          className={styles.prompt}
          onClick={collapsed ? open : undefined}
          tabIndex={collapsed ? 0 : -1}
          aria-label={collapsed ? 'Open command line' : undefined}
          aria-hidden={!collapsed}
        >
          &gt;
        </button>
        <input
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setRecalled(-1);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (compact && !value.trim()) setExpanded(false);
          }}
          placeholder={COMMAND_PLACEHOLDER}
          aria-label="Command"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </form>
    </div>
  );
}
