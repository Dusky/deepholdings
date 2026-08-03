import { useEffect, useState } from 'react';
import {
  RETREAT_MAX_PCT,
  RETREAT_MIN_PCT,
  SITE_CATALOGUE,
  forecast,
  gloss,
  permitDepthLimit,
  siteAuthorised,
  siteSpec,
  type StandingOrders,
} from '@deepholdings/shared';
import { FileButton } from '../components/ui/FileButton';
import { OptionChip } from '../components/ui/OptionChip';
import { Slider } from '../components/ui/Slider';
import { clockOf } from '../lib/activity';
import { useServer } from '../state/serverContext';
import type { LootPriority, SpendPolicy } from '../types';
import styles from './OrdersScreen.module.css';

const LOOT_OPTIONS: readonly LootPriority[] = ['gold', 'gear', 'relics', 'knowledge'];
const SPEND_OPTIONS: readonly SpendPolicy[] = ['resupply', 'hoard', 'insure'];

/**
 * Every chip's plain meaning, from the one glossary.
 *
 * These trades were real and entirely invisible: relics are worth 2.1x but are
 * found 55% as often, and hoarding pays 15% more on every sale. Both numbers
 * had lived in `tuning.ts` since the prototype without ever reaching a player,
 * so the two chip rows on the game's most-used screen were four and three
 * unlabelled words.
 */
const LOOT_GLOSS: Record<LootPriority, string> = {
  gold: gloss('lootGold'),
  gear: gloss('lootGear'),
  relics: gloss('lootRelics'),
  knowledge: gloss('lootKnowledge'),
};

const SPEND_GLOSS: Record<SpendPolicy, string> = {
  resupply: gloss('spendResupply'),
  hoard: gloss('spendHoard'),
  insure: gloss('spendInsure'),
};

/**
 * What these orders are actually worth, before the player commits to them.
 *
 * The whole game is the trade between depth, safety and the two currencies, and
 * until this existed none of it was visible: four sliders and chips with no
 * stated consequence, on the screen the player uses most. The numbers are
 * measured by sweeping the real resolver (`npm run forecast`), not modelled, so
 * they cannot drift away from what the game does.
 *
 * The pension line is the one that earns its place. Gold rises all the way to
 * the cautious end of the slider, so a player shown gold alone would correctly
 * peg it at 45% and would be quietly wrong — pension is paid at a death, so a
 * recruit who never dies banks nothing permanent. On shallow floors set safely
 * that figure is *zero*, and a player can otherwise grind there for a week
 * without discovering that none of it counted.
 */
function Forecast({
  orders,
  permitFloor,
}: {
  orders: StandingOrders;
  permitFloor: number;
}) {
  // Forecast what will actually happen, not what the slider says: the recruit
  // cannot work deeper than the permit allows, so quoting the slider's depth
  // would overstate every figure for exactly the new players who most need it
  // to be true.
  const effective = Math.min(orders.targetDepth, permitFloor);
  const { goldPerHour, pensionPerHour, hoursPerDeath } = forecast({
    ...orders,
    targetDepth: effective,
  });
  const onAnnexe = (orders.site ?? 'holdings') !== 'holdings';

  return (
    <div className={styles.forecast}>
      <div className={`text-dim ${styles.label}`}>IF FILED — ROUGHLY</div>
      <div className={styles.forecastRow}>
        <span className="text-bright">{goldPerHour.toLocaleString('en-GB')}</span>
        <span className="text-dim"> gold an hour</span>
      </div>
      <div className={styles.forecastRow}>
        <span className="text-bright">{pensionPerHour.toLocaleString('en-GB')}</span>
        <span className="text-dim"> pension an hour</span>
      </div>
      <div className={styles.forecastRow}>
        <span className="text-dim">
          {Number.isFinite(hoursPerDeath)
            ? `a funeral about every ${Math.round(hoursPerDeath)} hours`
            : 'your recruit is unlikely to die at all'}
        </span>
      </div>

      {pensionPerHour === 0 && (
        <div className={`text-dim ${styles.hint}`}>
          <strong>No pension at this setting.</strong> Pension is only paid when
          a recruit dies, and at this depth and threshold yours will not. Gold
          buys equipment; pension is what survives a funeral — go deeper, or
          retreat later, to bank any.
        </div>
      )}

      <div className={`text-dim ${styles.hint}`}>
        Measured for a bare recruit with no staff, unlocks or case files, so a
        settled office does better.
        {orders.targetDepth > permitFloor &&
          ` Quoted for Floor ${effective}, which is as deep as your permit allows.`}
        {onAnnexe && ' Figures describe the Holdings; the Annexe pays and kills harder.'}
      </div>
    </div>
  );
}

/** Form SO-1: the four knobs the player actually controls (spec §4). */
export function OrdersScreen() {
  const { state, fileOrders } = useServer();
  const authorised = SITE_CATALOGUE.filter((spec) =>
    siteAuthorised(spec.id, state?.transfer.unlocks ?? []),
  );
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

  const permitFloor = permitDepthLimit(state.character.permitTier, draft.site ?? 'holdings');

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

      {/*
        Only shown once a second site exists to choose between. A control with
        one option is not a choice — it is a permanent reminder that the game
        has something you cannot have, on the screen the player uses most.
      */}
      {authorised.length > 1 && (
        <div className={styles.row}>
          <div className={`text-dim ${styles.label}`} id="site-label">
            0. SITE
          </div>
          <div className={styles.options} role="group" aria-labelledby="site-label">
            {authorised.map((spec) => (
              <OptionChip
                key={spec.id}
                label={spec.id === 'holdings' ? 'HOLDINGS' : 'ANNEXE'}
                selected={(draft.site ?? 'holdings') === spec.id}
                onSelect={() => update({ site: spec.id })}
              />
            ))}
          </div>
          <div className={`text-dim ${styles.hint}`}>
            {siteSpec(draft.site ?? 'holdings').detail}
          </div>
        </div>
      )}

      <div className={styles.row}>
        <label className={`text-dim ${styles.label}`} htmlFor="target-depth">
          1. TARGET DEPTH
        </label>
        <div className={`text-dim ${styles.hint}`}>{gloss('targetDepth')}</div>
        <Slider
          id="target-depth"
          min={1}
          max={12}
          value={draft.targetDepth}
          valueText={`Floor ${draft.targetDepth}`}
          onChange={(targetDepth) => update({ targetDepth })}
        />
        <div className={`text-bright ${styles.value}`}>Floor {draft.targetDepth}</div>
        {/*
          The permit is the reason a slider set to 12 may produce a recruit
          working Floor 3, and saying nothing about it made the control look
          broken. It is a fact about the player's own file, so it is stated
          where the confusion happens rather than left to be discovered.
        */}
        {draft.targetDepth > permitFloor && (
          <div className={`text-dim ${styles.hint}`}>
            Your permit authorises Floor {permitFloor}. Anything deeper is an
            aspiration until D-{state.character.permitTier + 1} clears.
          </div>
        )}
      </div>

      <div className={styles.row}>
        <label className={`text-dim ${styles.label}`} htmlFor="retreat-threshold">
          2. RETREAT THRESHOLD
        </label>
        <div className={`text-dim ${styles.hint}`}>{gloss('retreatThreshold')}</div>
        <Slider
          id="retreat-threshold"
          min={RETREAT_MIN_PCT}
          max={RETREAT_MAX_PCT}
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
        <div className={`text-dim ${styles.hint}`}>{gloss('lootPriority')}</div>
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
        <div className={`text-dim ${styles.hint}`}>{LOOT_GLOSS[draft.lootPriority]}</div>
      </div>

      <div className={styles.row}>
        <div className={`text-dim ${styles.label}`} id="spend-policy-label">
          4. SPEND POLICY
        </div>
        <div className={`text-dim ${styles.hint}`}>{gloss('spendPolicy')}</div>
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
        <div className={`text-dim ${styles.hint}`}>{SPEND_GLOSS[draft.spendPolicy]}</div>
      </div>

      <Forecast orders={draft} permitFloor={permitFloor} />

      <div className={styles.fileRow}>
        <FileButton onClick={handleFile}>{saving ? 'FILING...' : 'FILE ORDERS'}</FileButton>
        <div className="text-dim" role="status">
          {notice ?? (dirty ? 'Unfiled amendments on this form.' : null)}
        </div>
      </div>
    </div>
  );
}
