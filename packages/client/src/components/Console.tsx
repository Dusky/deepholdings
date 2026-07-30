import { BulletinScreen } from '../screens/BulletinScreen';
import { LedgerScreen } from '../screens/LedgerScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { TavernScreen } from '../screens/TavernScreen';
import { TerminalScreen } from '../screens/TerminalScreen';
import { useScreen } from '../state/screenContext';
import { useServer } from '../state/serverContext';
import { CommandBar } from './CommandBar';
import { TabRow } from './TabRow';
import styles from './Console.module.css';

interface ConsoleProps {
  revealSkipped: boolean;
}

/**
 * The booted terminal: tabs, the active screen, and the command bar. All five
 * screens share one mounted shell — there are no routes. Which screen is
 * showing lives in ScreenContext so the Android back button can reach it.
 */
export function Console({ revealSkipped }: ConsoleProps) {
  const { activeScreen: requested, goTo } = useScreen();
  const { state } = useServer();
  const clearance = state?.clearance ?? ['terminal'];
  // A command or a stale tap can name a screen this officer has not been
  // cleared for; the Terminal is always available.
  const activeScreen = clearance.includes(requested) ? requested : 'terminal';

  return (
    <div className={styles.console}>
      <TabRow activeScreen={activeScreen} onNavigate={goTo} />
      <div className={styles.body} id="screen-body" role="tabpanel">
        {activeScreen === 'terminal' && <TerminalScreen revealSkipped={revealSkipped} />}
        {activeScreen === 'tavern' && <TavernScreen />}
        {activeScreen === 'orders' && <OrdersScreen />}
        {activeScreen === 'ledger' && <LedgerScreen />}
        {activeScreen === 'bulletin' && <BulletinScreen />}
      </div>
      <CommandBar onNavigate={goTo} />
    </div>
  );
}
