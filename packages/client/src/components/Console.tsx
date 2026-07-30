import { useState } from 'react';
import { BulletinScreen } from '../screens/BulletinScreen';
import { LedgerScreen } from '../screens/LedgerScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { TavernScreen } from '../screens/TavernScreen';
import { TerminalScreen } from '../screens/TerminalScreen';
import type { ScreenId } from '../types';
import { CommandBar } from './CommandBar';
import { TabRow } from './TabRow';
import styles from './Console.module.css';

interface ConsoleProps {
  revealSkipped: boolean;
}

/**
 * The booted terminal: tabs, the active screen, and the command bar. All five
 * screens share one mounted shell — there are no routes, so which screen is
 * showing stays local UI state rather than anything the server knows about.
 */
export function Console({ revealSkipped }: ConsoleProps) {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('terminal');

  return (
    <div className={styles.console}>
      <TabRow activeScreen={activeScreen} onNavigate={setActiveScreen} />
      <div className={styles.body} id="screen-body" role="tabpanel">
        {activeScreen === 'terminal' && <TerminalScreen revealSkipped={revealSkipped} />}
        {activeScreen === 'tavern' && <TavernScreen />}
        {activeScreen === 'orders' && <OrdersScreen />}
        {activeScreen === 'ledger' && <LedgerScreen />}
        {activeScreen === 'bulletin' && <BulletinScreen />}
      </div>
      <CommandBar onNavigate={setActiveScreen} />
    </div>
  );
}
