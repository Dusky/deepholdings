import { useMemo, useState } from 'react';
import {
  requisitionTier,
  type LedgerStack,
  type LootPriority,
  type MarketQuote,
  type Office,
} from '@deepholdings/shared';
import { usePersistentState } from '../hooks/usePersistentState';
import columns from './columns.module.css';
import styles from './LedgerScreen.module.css';

type SortKey = 'filed' | 'value' | 'category';

const SORTS: readonly { key: SortKey; label: string }[] = [
  { key: 'filed', label: 'AS FILED' },
  { key: 'value', label: 'VALUE' },
  { key: 'category', label: 'CATEGORY' },
];

const CATEGORIES: readonly LootPriority[] = ['gold', 'gear', 'relics', 'knowledge'];

interface CabinetView {
  sort: SortKey;
  filter: LootPriority | 'all';
}

export interface BulkSelector {
  category?: LootPriority;
  maxUnitValue?: number;
}

interface CabinetColumnProps {
  inventory: LedgerStack[];
  market: MarketQuote[];
  office: Office;
  onSell: (name: string) => Promise<void>;
  onBulkSell: (selector: BulkSelector) => Promise<void>;
  busy: string | null;
  notice: string | null;
}

/** What a bulk filing would clear, for the confirmation copy. */
function countMatching(
  inventory: readonly LedgerStack[],
  selector: BulkSelector,
): { stacks: number; gold: number } {
  const matches = inventory.filter((item) =>
    selector.category !== undefined
      ? item.category === selector.category
      : item.unitValue <= (selector.maxUnitValue ?? 0),
  );
  return {
    stacks: matches.length,
    gold: matches.reduce((total, item) => total + item.stackOffer, 0),
  };
}

/**
 * The filing cabinet, plus whatever the office has requisitioned to make it
 * easier to read and empty.
 *
 * Everything here is a tap-saver: sorting shows the same stacks in a different
 * order, and a bulk filing sells at exactly the price the individual SELL
 * buttons beside it would. An officer who has requisitioned nothing can do all
 * of it, one row at a time.
 */
export function CabinetColumn({
  inventory,
  market,
  office,
  onSell,
  onBulkSell,
  busy,
  notice,
}: CabinetColumnProps) {
  const indexTier = requisitionTier(office.requisitions, 'index');
  const bulkTier = requisitionTier(office.requisitions, 'bulk');
  const [view, setView] = usePersistentState<CabinetView>('deepholdings.cabinetView', () => ({
    sort: 'filed',
    filter: 'all',
  }));
  const [threshold, setThreshold] = useState('20');
  // A bulk filing clears stacks that may not be on screen, so it confirms — and
  // the confirmation renders here, under the button that raised it. Put at the
  // foot of the screen it lands three columns below the tap that opened it.
  const [confirming, setConfirming] = useState<BulkSelector | null>(null);

  const demand = useMemo(
    () => new Map(market.map((quote) => [quote.category, quote.demand])),
    [market],
  );

  const shown = useMemo(() => {
    // The view is remembered, so a requisition that lapsed out of the response
    // must not leave the cabinet filtered to something the officer cannot see.
    const filtered =
      indexTier >= 2 && view.filter !== 'all'
        ? inventory.filter((item) => item.category === view.filter)
        : inventory;
    if (indexTier < 1 || view.sort === 'filed') return filtered;
    const sorted = [...filtered];
    if (view.sort === 'value') sorted.sort((a, b) => b.stackOffer - a.stackOffer);
    else sorted.sort((a, b) => a.category.localeCompare(b.category) || b.stackOffer - a.stackOffer);
    return sorted;
  }, [inventory, indexTier, view]);

  const confirmation = countMatching(inventory, confirming ?? {});
  const hidden = inventory.length - shown.length;
  const parsedThreshold = Number(threshold);
  const thresholdValid = Number.isFinite(parsedThreshold) && parsedThreshold >= 0;

  return (
    <div className={columns.column}>
      <div className={`text-head ${columns.head}`}>INVENTORY</div>

      {indexTier >= 1 && (
        <div className={styles.indexBar}>
          <div className={styles.chipRow} role="group" aria-label="Sort filing cabinet">
            {SORTS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={styles.viewChip}
                aria-pressed={view.sort === option.key}
                onClick={() => setView((current) => ({ ...current, sort: option.key }))}
              >
                {option.label}
              </button>
            ))}
          </div>
          {indexTier >= 2 && (
            <div className={styles.chipRow} role="group" aria-label="Filter filing cabinet">
              {(['all', ...CATEGORIES] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={styles.viewChip}
                  aria-pressed={view.filter === option}
                  onClick={() => setView((current) => ({ ...current, filter: option }))}
                >
                  {option === 'all' ? 'ALL' : option.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {inventory.length === 0 && (
        <div className="text-dim">Filing cabinet empty. The Authority is unimpressed.</div>
      )}
      {inventory.length > 0 && shown.length === 0 && (
        <div className="text-dim">Nothing on file under that heading.</div>
      )}

      {shown.map((item) => (
        <div key={item.name} className={styles.stock}>
          <div className={columns.row}>
            <span className="text-body">{item.name}</span>
            <span className="text-dim">{item.note}</span>
          </div>
          <div className={styles.stockActions}>
            <span className="text-dim">
              {item.unitOffer}g each · {item.stackOffer}g the lot
            </span>
            <button
              type="button"
              className={styles.sell}
              disabled={busy !== null}
              onClick={() => void onSell(item.name)}
            >
              {busy === item.name ? 'FILING...' : 'SELL'}
            </button>
          </div>
        </div>
      ))}

      {hidden > 0 && (
        <div className="text-dim">
          {hidden} stack{hidden === 1 ? '' : 's'} filed under other headings.
        </div>
      )}

      {bulkTier >= 1 && inventory.length > 0 && (
        <div className={styles.bulk}>
          <div className={`text-dim ${styles.hint}`}>
            Bulk filing. One form, the same price per item.
          </div>
          <div className={styles.chipRow}>
            {CATEGORIES.filter((category) => inventory.some((item) => item.category === category)).map(
              (category) => (
                <button
                  key={category}
                  type="button"
                  className={styles.viewChip}
                  disabled={busy !== null}
                  onClick={() => setConfirming({ category })}
                >
                  SELL ALL {category.toUpperCase()}
                  {demand.get(category) !== undefined && (
                    <span className="text-dim">
                      {' '}
                      {Math.round((demand.get(category)! - 1) * 100) >= 0 ? '+' : ''}
                      {Math.round((demand.get(category)! - 1) * 100)}%
                    </span>
                  )}
                </button>
              ),
            )}
          </div>
          {bulkTier >= 2 && (
            <div className={styles.thresholdRow}>
              <label className="text-dim" htmlFor="bulk-threshold">
                Clear under
              </label>
              <input
                id="bulk-threshold"
                className={styles.threshold}
                inputMode="numeric"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                aria-label="Unit value threshold"
              />
              <span className="text-dim">g a unit</span>
              <button
                type="button"
                className={styles.sell}
                disabled={busy !== null || !thresholdValid}
                onClick={() => setConfirming({ maxUnitValue: parsedThreshold })}
              >
                FILE
              </button>
            </div>
          )}

          {confirming && (
            <div className={styles.confirm} role="alertdialog" aria-label="Confirm bulk filing">
              <div className="text-body">
                {confirmation.stacks === 0
                  ? 'Nothing on file under that heading.'
                  : `Clear ${confirmation.stacks} stack${confirmation.stacks === 1 ? '' : 's'} for ${confirmation.gold} gold?`}
              </div>
              <div className={`text-dim ${styles.hint}`}>
                {confirming.category
                  ? `Everything filed under ${confirming.category}.`
                  : `Everything appraised under ${confirming.maxUnitValue}g a unit.`}
              </div>
              <div className={styles.confirmActions}>
                <button type="button" className={styles.sell} onClick={() => setConfirming(null)}>
                  WITHDRAW
                </button>
                <button
                  type="button"
                  className={styles.sell}
                  disabled={confirmation.stacks === 0 || busy !== null}
                  onClick={() => {
                    setConfirming(null);
                    void onBulkSell(confirming);
                  }}
                >
                  FILE IT
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {notice && <div className="text-dim">{notice}</div>}
    </div>
  );
}
