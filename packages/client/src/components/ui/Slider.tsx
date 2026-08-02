import type { CSSProperties } from 'react';
import styles from './Slider.module.css';

interface SliderProps {
  id: string;
  min: number;
  max: number;
  /** Defaults to 1. Staff policies move in steps of 25, 2500 and 1. */
  step?: number;
  value: number;
  valueText: string;
  onChange: (value: number) => void;
}

export function Slider({ id, min, max, step = 1, value, valueText, onChange }: SliderProps) {
  const fill = ((value - min) / (max - min)) * 100;

  return (
    <input
      id={id}
      type="range"
      className={styles.slider}
      min={min}
      max={max}
      step={step}
      value={value}
      aria-valuetext={valueText}
      style={{ '--fill': `${fill}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}
