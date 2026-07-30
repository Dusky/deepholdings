import { useGame } from '../state/gameContext';
import { BulletinScreen } from '../screens/BulletinScreen';
import { LedgerScreen } from '../screens/LedgerScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { TavernScreen } from '../screens/TavernScreen';
import { TerminalScreen } from '../screens/TerminalScreen';
import { CommandBar } from './CommandBar';
import { TabRow } from './TabRow';
import styles from './Console.module.css';

interface ConsoleProps {
  revealSkipped: boolean;
}

/**
 * The booted terminal: tabs, the active screen, and the command bar. All five
 * screens share one mounted shell — there are no routes.
 */
export function Console({ revealSkipped }: ConsoleProps) {
  const { state } = useGame();

  return (
    <div className={styles.console}>
      <TabRow />
      <div className={styles.body} id="screen-body" role="tabpanel">
        {state.activeScreen === 'terminal' && <TerminalScreen revealSkipped={revealSkipped} />}
        {state.activeScreen === 'tavern' && <TavernScreen />}
        {state.activeScreen === 'orders' && <OrdersScreen />}
        {state.activeScreen === 'ledger' && <LedgerScreen />}
        {state.activeScreen === 'bulletin' && <BulletinScreen />}
      </div>
      <CommandBar />
    </div>
  );
}
