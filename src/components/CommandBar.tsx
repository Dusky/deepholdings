import { useState, type FormEvent } from 'react';
import { COMMAND_PLACEHOLDER, parseCommand } from '../lib/commands';
import { useGame } from '../state/gameContext';
import styles from './CommandBar.module.css';

/** The other half of navigation: type where you want to go. */
export function CommandBar() {
  const { dispatch } = useGame();
  const [value, setValue] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const command = parseCommand(value);
    if (command.kind === 'navigate') dispatch({ type: 'goTo', screen: command.screen });
    else if (command.kind === 'die') dispatch({ type: 'triggerDeath' });
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
