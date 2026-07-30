import { useCallback, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import styles from './TavernScreen.module.css';

/** Live channel for case officers. Polled while the screen is open. */
export function TavernScreen() {
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const load = useCallback(() => api.getTavern(), []);
  const { data, error, loading, reload } = useResource(load, 10_000);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    setSendError(null);
    try {
      await api.sendTavernMessage(body);
      await reload();
    } catch {
      // Put the text back rather than losing what they typed.
      setSendError('Message not delivered. The channel did not answer.');
      setDraft(body);
    }
  };

  return (
    <>
      <div className={`text-dim ${styles.header}`}>
        {data
          ? `TAVERN CHANNEL — ${data.present} CASE OFFICER${data.present === 1 ? '' : 'S'} PRESENT`
          : 'TAVERN CHANNEL — CONNECTING'}
      </div>

      <div className={styles.stream} role="log">
        {loading && !data && <div className="text-dim">Opening channel...</div>}
        {data?.messages.length === 0 && (
          <div className="text-dim">Channel quiet. Nobody has filed anything worth saying.</div>
        )}
        {data?.messages.map((msg) => (
          <div key={msg.id} className={styles.row}>
            <span className={styles.author}>{msg.author}</span>
            <span className="text-body">{msg.body}</span>
          </div>
        ))}
      </div>

      {(sendError ?? error) && <div className="text-dim">{sendError ?? error}</div>}

      <form className={styles.inputRow} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="say something to the channel"
          aria-label="Tavern message"
          autoComplete="off"
          maxLength={280}
        />
      </form>
    </>
  );
}
