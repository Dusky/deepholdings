import { useState, type FormEvent } from 'react';
import { TAVERN_PRESENT } from '../data/fixtures';
import { useGame } from '../state/gameContext';
import styles from './TavernScreen.module.css';

/** Live channel for case officers. Server-backed chat in production. */
export function TavernScreen() {
  const { state, dispatch } = useGame();
  const [draft, setDraft] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    dispatch({ type: 'sendTavernMessage', body: draft });
    setDraft('');
  };

  return (
    <>
      <div className={`text-dim ${styles.header}`}>
        TAVERN CHANNEL — {TAVERN_PRESENT} CASE OFFICERS PRESENT
      </div>

      <div className={styles.stream} role="log">
        {state.tavernMessages.map((msg) => (
          <div key={msg.id} className={styles.row}>
            <span className={styles.author}>{msg.author}</span>
            <span className="text-body">{msg.body}</span>
          </div>
        ))}
      </div>

      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="say something to the channel"
          aria-label="Tavern message"
          autoComplete="off"
        />
      </form>
    </>
  );
}
