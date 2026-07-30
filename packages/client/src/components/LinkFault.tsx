import { FileButton } from './ui/FileButton';
import styles from './LinkFault.module.css';

interface LinkFaultProps {
  message: string | null;
  onRetry: () => void;
}

/** Cold start with no reachable server. In voice, because everything is. */
export function LinkFault({ message, onRetry }: LinkFaultProps) {
  return (
    <div className={styles.fault}>
      <div className={styles.title}>LINK TO THE AUTHORITY UNAVAILABLE</div>
      <div className={`text-body ${styles.detail}`}>
        The case management system did not answer. Your recruit continues to work
        regardless; the record will be reconciled on reconnection.
      </div>
      {message && <div className="text-dim">Reported fault: {message}</div>}
      <FileButton onClick={onRetry}>RETRY CONNECTION</FileButton>
    </div>
  );
}
