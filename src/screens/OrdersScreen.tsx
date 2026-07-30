import { FileButton } from '../components/ui/FileButton';
import { OptionChip } from '../components/ui/OptionChip';
import { Slider } from '../components/ui/Slider';
import { useGame } from '../state/gameContext';
import type { LootPriority, SpendPolicy } from '../types';
import styles from './OrdersScreen.module.css';

const LOOT_OPTIONS: readonly LootPriority[] = ['gold', 'gear', 'relics', 'knowledge'];
const SPEND_OPTIONS: readonly SpendPolicy[] = ['resupply', 'hoard', 'insure'];

/** Form SO-1: the four knobs the player actually controls (spec §4). */
export function OrdersScreen() {
  const { state, dispatch } = useGame();

  return (
    <div className={styles.paper}>
      <div className={`text-bright ${styles.title}`}>STANDING ORDERS — FORM SO-1</div>

      <div className={styles.row}>
        <label className={`text-dim ${styles.label}`} htmlFor="target-depth">
          1. TARGET DEPTH
        </label>
        <Slider
          id="target-depth"
          min={1}
          max={12}
          value={state.targetDepth}
          valueText={`Floor ${state.targetDepth}`}
          onChange={(value) => dispatch({ type: 'setTargetDepth', value })}
        />
        <div className={`text-bright ${styles.value}`}>Floor {state.targetDepth}</div>
      </div>

      <div className={styles.row}>
        <label className={`text-dim ${styles.label}`} htmlFor="retreat-threshold">
          2. RETREAT THRESHOLD
        </label>
        <Slider
          id="retreat-threshold"
          min={5}
          max={80}
          value={state.retreatPct}
          valueText={`${state.retreatPct} percent HP`}
          onChange={(value) => dispatch({ type: 'setRetreatPct', value })}
        />
        <div className={`text-bright ${styles.value}`}>{state.retreatPct}% HP</div>
      </div>

      <div className={styles.row}>
        <div className={`text-dim ${styles.label}`} id="loot-priority-label">
          3. LOOT PRIORITY
        </div>
        <div className={styles.options} role="group" aria-labelledby="loot-priority-label">
          {LOOT_OPTIONS.map((option) => (
            <OptionChip
              key={option}
              label={option.toUpperCase()}
              selected={state.lootPriority === option}
              onSelect={() => dispatch({ type: 'setLootPriority', value: option })}
            />
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <div className={`text-dim ${styles.label}`} id="spend-policy-label">
          4. SPEND POLICY
        </div>
        <div className={styles.options} role="group" aria-labelledby="spend-policy-label">
          {SPEND_OPTIONS.map((option) => (
            <OptionChip
              key={option}
              label={option.toUpperCase()}
              selected={state.spendPolicy === option}
              onSelect={() => dispatch({ type: 'setSpendPolicy', value: option })}
            />
          ))}
        </div>
      </div>

      <div className={styles.fileRow}>
        <FileButton onClick={() => dispatch({ type: 'fileOrders', at: new Date() })}>
          FILE ORDERS
        </FileButton>
        <div className="text-dim" role="status">
          {state.ordersFiled && `Filed at ${state.filedTime}. Union Standing unaffected.`}
        </div>
      </div>
    </div>
  );
}
