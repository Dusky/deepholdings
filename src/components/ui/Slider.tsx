import type { CSSProperties } from 'react';
import styles from './Slider.module.css';

interface SliderProps {
  id: string;
  min: number;
  max: number;
  value: number;
  valueText: string;
  onChange: (value: number) => void;
}

export function Slider({ id, min, max, value, valueText, onChange }: SliderProps) {
  const fill = ((value - min) / (max - min)) * 100;

  return (
    <input
      id={id}
      type="range"
      className={styles.slider}
      min={min}
      max={max}
      value={value}
      aria-valuetext={valueText}
      style={{ '--fill': `${fill}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}
