import { useState, type FormEvent } from 'react';
import { COMMAND_PLACEHOLDER, parseCommand } from '../lib/commands';
import { useServer } from '../state/serverContext';
import type { ScreenId } from '../types';
import styles from './CommandBar.module.css';

interface CommandBarProps {
  onNavigate: (screen: ScreenId) => void;
}

/** The other half of navigation: type where you want to go. */
export function CommandBar({ onNavigate }: CommandBarProps) {
  const { refresh } = useServer();
  const [value, setValue] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const command = parseCommand(value);
    if (command.kind === 'navigate') onNavigate(command.screen);
    else if (command.kind === 'refresh') void refresh();
    setValue('');
  };

  return (
    <form className={styles.bar} onSubmit={handleSubmit}>
      <div className={styles.prompt} aria-hidden="true">
        &gt;
      </div>
      <input
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={COMMAND_PLACEHOLDER}
        aria-label="Command"
        autoComplete="off"
        spellCheck={false}
      />
    </form>
  );
}
