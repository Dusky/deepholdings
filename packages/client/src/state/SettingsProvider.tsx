import { useCallback, useMemo, type ReactNode } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import {
  DEFAULT_NOTIFICATION_PREFS,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  SettingsContext,
  type Settings,
} from './settingsContext';

const STORAGE_KEY = 'deepholdings.settings';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function defaultSettings(): Settings {
  return {
    effectsOn: true,
    // Seed from the OS preference; the panel toggle can still override it.
    reducedMotion: prefersReducedMotion(),
    highContrast: false,
    fontScale: 1,
    notifications: { ...DEFAULT_NOTIFICATION_PREFS },
  };
}

function clampScale(value: number): number {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Math.round(value * 100) / 100));
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = usePersistentState<Settings>(STORAGE_KEY, defaultSettings);

  const toggleEffects = useCallback(
    () => setSettings((s) => ({ ...s, effectsOn: !s.effectsOn })),
    [setSettings],
  );
  const toggleReducedMotion = useCallback(
    () => setSettings((s) => ({ ...s, reducedMotion: !s.reducedMotion })),
    [setSettings],
  );
  const toggleHighContrast = useCallback(
    () => setSettings((s) => ({ ...s, highContrast: !s.highContrast })),
    [setSettings],
  );
  const increaseFont = useCallback(
    () => setSettings((s) => ({ ...s, fontScale: clampScale(s.fontScale + FONT_SCALE_STEP) })),
    [setSettings],
  );
  const decreaseFont = useCallback(
    () => setSettings((s) => ({ ...s, fontScale: clampScale(s.fontScale - FONT_SCALE_STEP) })),
    [setSettings],
  );

  const toggleNotifications = useCallback(
    () =>
      setSettings((s) => ({
        ...s,
        notifications: { ...s.notifications, enabled: !s.notifications.enabled },
      })),
    [setSettings],
  );
  const toggleNotificationKind = useCallback(
    (kind: 'permitReady' | 'shiftReady' | 'deathPush') =>
      setSettings((s) => ({
        ...s,
        notifications: { ...s.notifications, [kind]: !s.notifications[kind] },
      })),
    [setSettings],
  );

  const value = useMemo(
    () => ({
      ...settings,
      toggleEffects,
      toggleReducedMotion,
      toggleHighContrast,
      increaseFont,
      decreaseFont,
      toggleNotifications,
      toggleNotificationKind,
    }),
    [
      settings,
      toggleEffects,
      toggleReducedMotion,
      toggleHighContrast,
      increaseFont,
      decreaseFont,
      toggleNotifications,
      toggleNotificationKind,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
