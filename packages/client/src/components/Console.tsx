import { ArmouryScreen } from '../screens/ArmouryScreen';
import { BulletinScreen } from '../screens/BulletinScreen';
import { LedgerScreen } from '../screens/LedgerScreen';
import { OrdersScreen } from '../screens/OrdersScreen';
import { TavernScreen } from '../screens/TavernScreen';
import { TerminalScreen } from '../screens/TerminalScreen';
import { COMPACT_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { useScreen } from '../state/screenContext';
import { useServer } from '../state/serverContext';
import { CommandBar } from './CommandBar';
import { TabRow } from './TabRow';
import styles from './Console.module.css';

interface ConsoleProps {
  revealSkipped: boolean;
}

/**
 * The booted terminal: tabs, the active screen, and the command bar. Every
 * screen shares one mounted shell — there are no routes. Which screen is
 * showing lives in ScreenContext so the Android back button can reach it.
 */
export function Console({ revealSkipped }: ConsoleProps) {
  const { activeScreen: requested, goTo } = useScreen();
  const { state } = useServer();
  /**
   * No command line on a phone in portrait.
   *
   * Every command has a touch equivalent — the four knobs are sliders and chips
   * on Form SO-1, `sell` and `retire` are buttons on the Ledger, navigation is
   * the tab row above, `sync` is the poll. So on a phone the bar could not do
   * anything the screen could not, and it collapsed to a 44px bordered square
   * in the bottom-right: Android's floating-action-button position and shape,
   * which reads as *the* primary action. It advertised a keyboard as the way to
   * play a game that never needs one.
   *
   * A JS branch rather than `display: none` deliberately. The layout rule for
   * this client is "one source of truth, in CSS" — but a hidden form is still
   * mounted, still holds command history state, and is still reachable by a
   * screen reader that ignores the media query. Not rendering it is the version
   * that is actually absent.
   */
  const compact = useMediaQuery(COMPACT_QUERY);
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
        {activeScreen === 'armoury' && <ArmouryScreen />}
      </div>
      {!compact && <CommandBar onNavigate={goTo} />}
    </div>
  );
}
