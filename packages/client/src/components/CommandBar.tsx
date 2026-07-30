import { useEffect, useRef, useState, type FormEvent } from 'react';
import { COMPACT_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { COMMAND_PLACEHOLDER, parseCommand } from '../lib/commands';
import { useServer } from '../state/serverContext';
import type { ScreenId } from '../types';
import styles from './CommandBar.module.css';

interface CommandBarProps {
  onNavigate: (screen: ScreenId) => void;
}

/**
 * The other half of navigation: type where you want to go.
 *
 * On a phone in portrait the bar collapses to a `>` button — the tabs already
 * cover navigation there, and a permanent input row spends a line of screen on
 * an affordance that needs the keyboard anyway.
 */
export function CommandBar({ onNavigate }: CommandBarProps) {
  const { refresh } = useServer();
  const [value, setValue] = useState('');
  const [expanded, setExpanded] = useState(false);
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const command = parseCommand(value);
    if (command.kind === 'navigate') onNavigate(command.screen);
    else if (command.kind === 'refresh') void refresh();
    setValue('');
    if (compact) collapse();
  };

  const collapsed = compact && !expanded;

  return (
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
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && compact) collapse();
        }}
        onBlur={() => {
          if (compact && !value.trim()) setExpanded(false);
        }}
        placeholder={COMMAND_PLACEHOLDER}
        aria-label="Command"
        autoComplete="off"
        spellCheck={false}
      />
    </form>
  );
}
