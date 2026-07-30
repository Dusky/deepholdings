import { createContext, useContext } from 'react';
import type { ScreenId } from '../types';

export interface ScreenState {
  activeScreen: ScreenId;
  goTo: (screen: ScreenId) => void;
}

/**
 * Which screen is showing. Local UI state, but it lives above the Console so
 * the Android back button can reach it — hardware back should return to the
 * Terminal before it exits the app.
 */
export const ScreenContext = createContext<ScreenState | null>(null);

export function useScreen(): ScreenState {
  const ctx = useContext(ScreenContext);
  if (!ctx) throw new Error('useScreen must be used inside <ScreenProvider>');
  return ctx;
}

export const HOME_SCREEN: ScreenId = 'terminal';
