import { useEffect, useState } from 'react';
import type { StandingOrders } from '@deepholdings/shared';
import { FileButton } from '../components/ui/FileButton';
import { OptionChip } from '../components/ui/OptionChip';
import { Slider } from '../components/ui/Slider';
import { clockOf } from '../lib/activity';
import { useServer } from '../state/serverContext';
import type { LootPriority, SpendPolicy } from '../types';
import styles from './OrdersScreen.module.css';

const LOOT_OPTIONS: readonly LootPriority[] = ['gold', 'gear', 'relics', 'knowledge'];
const SPEND_OPTIONS: readonly SpendPolicy[] = ['resupply', 'hoard', 'insure'];

/** Form SO-1: the four knobs the player actually controls (spec §4). */
export function OrdersScreen() {
  const { state, fileOrders } = useServer();
  const filed = state?.orders;

  // The form is a draft until it is filed — nothing takes effect on the
  // server until the button is pressed, so the UI should say so too.
  const [draft, setDraft] = useState<StandingOrders | null>(filed ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Adopt the server's copy whenever it changes and the form is untouched.
    setDraft((current) => current ?? filed ?? null);
  }, [filed]);

  if (!state || !draft || !filed) return null;

  const dirty =
    draft.targetDepth !== filed.targetDepth ||
    draft.retreatPct !== filed.retreatPct ||
    draft.lootPriority !== filed.lootPriority ||
    draft.spendPolicy !== filed.spendPolicy;

  const update = (patch: Partial<StandingOrders>) => {
    setDraft({ ...draft, ...patch });
    setNotice(null);
  };

  const handleFile = async () => {
    setSaving(true);
    try {
      const filedAt = await fileOrders(draft);
      setNotice(`Filed at ${clockOf(filedAt)}. Union Standing unaffected.`);
    } catch {
      setNotice('Filing rejected. The Authority did not accept the form.');
    } finally {
      setSaving(false);
    }
  };

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
          value={draft.targetDepth}
          valueText={`Floor ${draft.targetDepth}`}
          onChange={(targetDepth) => update({ targetDepth })}
        />
        <div className={`text-bright ${styles.value}`}>Floor {draft.targetDepth}</div>
      </div>

      <div className={styles.row}>
        <label className={`text-dim ${styles.label}`} htmlFor="retreat-threshold">
          2. RETREAT THRESHOLD
        </label>
        <Slider
          id="retreat-threshold"
          min={5}
          max={80}
          value={draft.retreatPct}
          valueText={`${draft.retreatPct} percent HP`}
          onChange={(retreatPct) => update({ retreatPct })}
        />
        <div className={`text-bright ${styles.value}`}>{draft.retreatPct}% HP</div>
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
              selected={draft.lootPriority === option}
              onSelect={() => update({ lootPriority: option })}
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
              selected={draft.spendPolicy === option}
              onSelect={() => update({ spendPolicy: option })}
            />
          ))}
        </div>
      </div>

      <div className={styles.fileRow}>
        <FileButton onClick={handleFile}>{saving ? 'FILING...' : 'FILE ORDERS'}</FileButton>
        <div className="text-dim" role="status">
          {notice ?? (dirty ? 'Unfiled amendments on this form.' : null)}
        </div>
      </div>
    </div>
  );
}
