import type { ReactNode } from 'react';
import styles from './FileButton.module.css';

interface FileButtonProps {
  children: ReactNode;
  onClick: () => void;
}

/** Filled amber action button — "FILE ORDERS", "FILE FOR PENSION". */
export function FileButton({ children, onClick }: FileButtonProps) {
  return (
    <button type="button" className={styles.button} onClick={onClick}>
      {children}
    </button>
  );
}
