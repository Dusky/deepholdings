import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { ScreenId } from '../types';
import { HOME_SCREEN, ScreenContext } from './screenContext';

export function ScreenProvider({ children }: { children: ReactNode }) {
  const [activeScreen, setActiveScreen] = useState<ScreenId>(HOME_SCREEN);
  const goTo = useCallback((screen: ScreenId) => setActiveScreen(screen), []);
  const value = useMemo(() => ({ activeScreen, goTo }), [activeScreen, goTo]);

  return <ScreenContext.Provider value={value}>{children}</ScreenContext.Provider>;
}
