import { createContext, useContext } from 'react';
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
} from '../native/notifications';

/** The quality floor: every effect must be defeatable (spec §7). */
export interface Settings {
  effectsOn: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  /** 0.85–1.4, applied as a CSS scale on every type token. */
  fontScale: number;
  /** Play requires a way to turn notifications off, and so does decency. */
  notifications: NotificationPrefs;
}

export interface SettingsContextValue extends Settings {
  toggleEffects: () => void;
  toggleReducedMotion: () => void;
  toggleHighContrast: () => void;
  increaseFont: () => void;
  decreaseFont: () => void;
  toggleNotifications: () => void;
  toggleNotificationKind: (kind: 'permitReady' | 'shiftReady' | 'deathPush') => void;
}

export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.4;
export const FONT_SCALE_STEP = 0.1;

export { DEFAULT_NOTIFICATION_PREFS };
export type { NotificationPrefs };

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
