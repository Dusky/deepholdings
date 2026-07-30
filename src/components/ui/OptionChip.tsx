import styles from './OptionChip.module.css';

interface OptionChipProps {
  label: string;
  selected: boolean;
  onSelect: () => void;
}

/** Single-select chip used by the Standing Orders form. */
export function OptionChip({ label, selected, onSelect }: OptionChipProps) {
  return (
    <button type="button" className={styles.chip} aria-pressed={selected} onClick={onSelect}>
      {label}
    </button>
  );
}
