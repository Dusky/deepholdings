import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { HOME_SCREEN, useScreen } from '../state/screenContext';

/**
 * Android hardware back.
 *
 * Anywhere but the Terminal, back returns to the Terminal. On the Terminal it
 * exits — Android users expect back to leave the app rather than trap them,
 * and there is no navigation stack to unwind.
 */
export function useBackButton(): void {
  const { activeScreen, goTo } = useScreen();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handle = App.addListener('backButton', () => {
      if (activeScreen !== HOME_SCREEN) goTo(HOME_SCREEN);
      else void App.exitApp();
    });

    return () => {
      void handle.then((listener) => listener.remove());
    };
  }, [activeScreen, goTo]);
}
