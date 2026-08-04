import { useCallback, useState } from 'react';
import {
  CASE_FILE_SLOTS,
  carriedEffect,
  clauseById,
  clauseSlots,
  formGoldCost,
  formSpec,
  maxHpForLevel,
  romanGrade,
  type CaseFile,
  type Clause,
  type PendingFiling,
} from '@deepholdings/shared';
import { api } from '../api/client';
import { useServer } from '../state/serverContext';
import columns from './columns.module.css';
import styles from './ArmouryScreen.module.css';

/**
 * The drawer, and what is in it.
 *
 * Case files were shipped before there was anywhere to look at them: the
 * Terminal listed them as one dim line each, name and clause names run
 * together, no numbers. So the game's only system with *decisions* in it —
 * which four clauses you are carrying, and which good file you give up to make
 * room — was invisible, and a player could carry a Grade V for a week without
 * ever learning what it did.
 *
 * This screen is that, and one more thing the Terminal could never show: the
 * ceilings. See the note on the effect table below.
 */

const KIND_LABEL: Record<Clause['kind'], string> = {
  endorsement: 'Endorsement',
  rider: 'Rider',
};

/** "+3 vigour", "−2.5% survival". Signed always, because a rider may be either. */
function effectsOf(clause: Clause): string[] {
  const parts: string[] = [];
  const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
  const pct = (n: number) => `${n >= 0 ? '+' : '−'}${(Math.abs(n) * 100).toFixed(1)}%`;
  if (clause.vigour) parts.push(`${signed(clause.vigour)} vigour`);
  if (clause.survival) parts.push(`${pct(clause.survival)} survival`);
  if (clause.lootValue) parts.push(`${pct(clause.lootValue)} loot value`);
  return parts;
}

/** "2 hours", "18 minutes". Vague on purpose, like the permit clock. */
function wait(seconds: number): string {
  if (seconds <= 60) return 'imminent';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  return `${Math.round(minutes / 60)} hours`;
}

/**
 * The clause an officer has picked up but not yet placed.
 *
 * Form 19 needs four choices — which file survives, which is consumed, which
 * of its clauses crosses, and which slot it lands in — and asking for four
 * taps through four pickers on a phone is how a system nobody uses gets built.
 *
 * So it is a carry: tap TRANSFER on the clause you want, and every slot that
 * could legally receive it turns into a target. Two taps, and the illegal
 * combinations are never offered rather than being refused after the fact.
 */
interface Carried {
  donor: CaseFile;
  clause: Clause;
  clauseIndex: number;
}

interface CaseFileEntryProps {
  file: CaseFile;
  filings: readonly PendingFiling[];
  gold: number;
  standing: number;
  busy: boolean;
  /** Null unless a transfer is in progress. */
  carrying: Carried | null;
  canTransfer: boolean;
  onContest: (file: CaseFile, clauseIndex: number) => void;
  onCarry: (carried: Carried) => void;
  onPlace: (survivor: CaseFile, clauseIndex: number) => void;
  onCountersign: (caseFileId: string, countersigned: boolean) => void;
}

function CaseFileEntry({
  file, filings, gold, standing, busy, carrying, canTransfer, onContest, onCarry, onPlace,
  onCountersign,
}: CaseFileEntryProps) {
  const clauses = file.clauseIds.map(clauseById).filter((c): c is Clause => Boolean(c));
  // Grade buys slots; a file may carry fewer clauses than its grade allows.
  // Showing the gap is the whole argument for Form 3-B when it lands.
  const vacant = Math.max(0, clauseSlots(file.grade) - clauses.length);
  const spec = formSpec('12-C')!;
  const merge = formSpec('19')!;
  const fee = formGoldCost(spec, file.grade);
  const mergeFee = formGoldCost(merge, file.grade);
  const affordable = gold >= fee && standing >= spec.standing;
  // A file with anything before the panel cannot be given up: Form 19 destroys
  // the donor at filing, and a form resolving against a file that no longer
  // exists is a fee already paid for nothing. This is the *only* restriction
  // the drawer adds beyond the server's, and it mirrors one the server also
  // enforces — an earlier version disabled CONTEST on the same condition too,
  // which was tighter than the rules for no reason a player could see.
  const busyFile = filings.some((filing) => filing.caseFileId === file.id);

  /** Whether this file's slot could legally receive what is being carried. */
  const receives = (index: number) =>
    carrying !== null &&
    carrying.donor.id !== file.id &&
    // The same two rules a roll obeys: no duplicates, nothing above the grade
    // of the file carrying it.
    carrying.clause.minGrade <= file.grade &&
    !file.clauseIds.some((id, at) => id === carrying.clause.id && at !== index) &&
    gold >= mergeFee;

  return (
    <div className={styles.file} data-donor={carrying?.donor.id === file.id}>
      <div className={styles.fileHead}>
        <span className="text-bright">{file.name}</span>
        <span className="text-dim">{file.id}</span>
      </div>
      <div className={`text-dim ${styles.fileMeta}`}>
        Grade {romanGrade(file.grade)} · {file.category} · book value {file.unitValue}g
      </div>
      {/*
        Direct Issue, and the reason it sits at the top of the file rather than
        beside the forms below: it is not paperwork about the item, it is an
        instruction about your own drawer. Free, immediate, and reversible — so
        it reads as a toggle, and the state is spelled out in words rather than
        left to the button's colour.
      */}
      <div className={styles.countersign}>
        <button
          type="button"
          className={styles.countersignButton}
          data-on={Boolean(file.countersigned)}
          disabled={busy}
          onClick={() => onCountersign(file.id, !file.countersigned)}
        >
          {file.countersigned ? 'KEPT BY HAND — RELEASE' : 'KEEP BY HAND (FORM 5-E)'}
        </button>
        <span className={`text-dim ${styles.countersignNote}`}>
          {file.countersigned
            ? 'The quartermaster will not release this file, even for a better one.'
            : 'Protects this file from being released when the drawer is full.'}
        </span>
      </div>
      {clauses.map((clause, index) => {
        const processing = filings.find(
          (filing) => filing.caseFileId === file.id && filing.clauseIndex === index,
        );
        return (
          <div key={clause.id} className={styles.clause} data-kind={clause.kind}>
            <span className={`text-dim ${styles.clauseKind}`}>{KIND_LABEL[clause.kind]}</span>
            <span className="text-body">{clause.text}</span>
            <span className={styles.clauseEffect}>{effectsOf(clause).join(', ')}</span>
            {processing ? (
              <span className={`text-dim ${styles.contestState}`}>
                Form {processing.form} before the panel — {wait(processing.secondsRemaining)}
              </span>
            ) : carrying ? (
              receives(index) ? (
                <button
                  type="button"
                  className={`${styles.contest} ${styles.place}`}
                  disabled={busy}
                  onClick={() => onPlace(file, index)}
                  title={`Form 19 — ${mergeFee} gold, and case ${carrying.donor.id} is consumed`}
                >
                  REPLACE THIS — {mergeFee}g
                </button>
              ) : null
            ) : (
              <span className={styles.actions}>
                {/* Disabled rather than hidden when it cannot be afforded: the
                    price is the decision, and a control that vanishes teaches
                    nothing about why. */}
                <button
                  type="button"
                  className={styles.contest}
                  disabled={busy || !affordable}
                  onClick={() => onContest(file, index)}
                  title={`Form 12-C — ${fee} gold and ${spec.standing} Union Standing`}
                >
                  CONTEST — {fee}g, {spec.standing} standing
                </button>
                {canTransfer && (
                  <button
                    type="button"
                    className={styles.contest}
                    disabled={busy || busyFile}
                    onClick={() => onCarry({ donor: file, clause, clauseIndex: index })}
                    title="Form 19 — carry this clause onto another file, consuming this one"
                  >
                    TRANSFER
                  </button>
                )}
              </span>
            )}
          </div>
        );
      })}
      {Array.from({ length: vacant }, (_, i) => (
        <div key={`vacant-${i}`} className={`text-dim ${styles.vacant}`}>
          [ vacant clause ]
        </div>
      ))}
    </div>
  );
}

export function ArmouryScreen() {
  const { state, refresh } = useServer();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [carrying, setCarrying] = useState<Carried | null>(null);

  const contest = useCallback(
    async (file: CaseFile, clauseIndex: number) => {
      setBusy(true);
      setNotice(null);
      try {
        const result = await api.fileForm({ form: '12-C', caseFileId: file.id, clauseIndex });
        setNotice(
          `Form 12-C filed against case ${file.id}. ${result.goldCharged} gold and ` +
            `${result.standingCharged} standing paid. The panel sits in ` +
            `${wait(result.filing.secondsRemaining)}.`,
        );
        await refresh();
      } catch {
        setNotice('The clerk declined the form and did not say why. Nothing was charged.');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const countersign = useCallback(
    async (caseFileId: string, next: boolean) => {
      setBusy(true);
      setNotice(null);
      try {
        await api.countersign({ caseFileId, countersigned: next });
        await refresh();
      } catch {
        setNotice('The clerk declined the form and did not say why. Nothing was charged.');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const place = useCallback(
    async (survivor: CaseFile, clauseIndex: number) => {
      if (!carrying) return;
      setBusy(true);
      setNotice(null);
      try {
        const result = await api.fileForm({
          form: '19',
          caseFileId: survivor.id,
          clauseIndex,
          donorCaseFileId: carrying.donor.id,
          donorClauseIndex: carrying.clauseIndex,
        });
        setNotice(
          `Form 19 filed. Case ${carrying.donor.id} struck from the register; ` +
            `"${carrying.clause.text}" crosses to case ${survivor.id} in ` +
            `${wait(result.filing.secondsRemaining)}.`,
        );
        setCarrying(null);
        await refresh();
      } catch {
        setNotice('The clerk declined the requisition. Both files are where they were.');
      } finally {
        setBusy(false);
      }
    },
    [carrying, refresh],
  );

  if (!state) return null;

  const files = state.caseFiles ?? [];
  const filings = state.filings ?? [];
  // The ceiling is a share of the recruit's own maximum *before* clauses —
  // character.maxHp already has the carried vigour folded into it, so reading
  // it back would move the ceiling every time a file changed it.
  const base = maxHpForLevel(state.character.level);
  const { raw, effective, caps } = carriedEffect(files, base);

  // A zero prints as a dash. "+0.0%" is three characters of precision about
  // nothing, and a column of them reads as a broken read-out.
  //
  // Tested against an epsilon rather than zero: the survival figures are sums
  // of hundredths, so a drawer whose clauses genuinely cancel lands on -1e-17
  // and printed as "−0.0%" — a minus sign in front of nothing, which is worse
  // than either honest answer.
  const nil = (n: number) => Math.abs(n) < 1e-9;
  const flat = (n: number) => (nil(n) ? '—' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  const pct = (n: number, places = 0) =>
    nil(n) ? '—' : `${n > 0 ? '+' : '−'}${(Math.abs(n) * 100).toFixed(places)}%`;

  const rows = [
    {
      label: 'Vigour',
      raw: flat(raw.vigour),
      effective: flat(effective.vigour),
      ceiling: `${caps.vigour} at Grade ${state.character.level}`,
      clipped: !nil(raw.vigour - effective.vigour),
    },
    {
      label: 'Survival',
      raw: pct(raw.survival, 1),
      effective: pct(effective.survival, 1),
      ceiling: pct(caps.survival).replace('+', ''),
      clipped: !nil(raw.survival - effective.survival),
    },
    {
      label: 'Loot value',
      raw: pct(raw.lootValue),
      effective: pct(effective.lootValue),
      ceiling: pct(caps.lootValue).replace('+', ''),
      clipped: !nil(raw.lootValue - effective.lootValue),
    },
  ];

  // The filed column earns its place only when it differs from the applied
  // one. With an untouched drawer the two are identical, and a table showing
  // the same number twice under different headings invites the reader to hunt
  // for a distinction that is not there.
  const anyClipped = rows.some((row) => row.clipped);

  return (
    <div className={columns.columns}>
      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>
          DRAWER — {files.length} of {CASE_FILE_SLOTS}
        </div>
        {files.length === 0 ? (
          <div className={`text-dim ${styles.empty}`}>
            Nothing filed yet. Most of what your recruit finds is sold for gold;
            occasionally something is worth keeping instead, and it is kept here.
            Kept items make your recruit tougher or richer, and are lost when
            they die.
          </div>
        ) : (
          <>
            <div className={`text-dim ${styles.hint}`}>
              Carried by {state.character.name}. Case files do not survive the
              recruit who found them — and neither does the standing.{' '}
              <span className="text-body">
                {state.character.gold}g · {state.character.standing} Union Standing
              </span>
            </div>
            {carrying && (
              <div className={`text-dim ${styles.carrying}`}>
                Carrying <span className="text-bright">&ldquo;{carrying.clause.text}&rdquo;</span>{' '}
                from case {carrying.donor.id}. Choose the clause it replaces — that
                file is consumed.{' '}
                <button type="button" className={styles.contest} onClick={() => setCarrying(null)}>
                  CANCEL
                </button>
              </div>
            )}
            {files.map((file) => (
              <CaseFileEntry
                key={file.id}
                file={file}
                filings={filings}
                gold={state.character.gold}
                standing={state.character.standing}
                busy={busy}
                carrying={carrying}
                canTransfer={files.length > 1}
                onContest={contest}
                onCarry={setCarrying}
                onPlace={place}
                onCountersign={countersign}
              />
            ))}
            {notice && <div className={`text-dim ${styles.hint}`}>{notice}</div>}
            {files.length === CASE_FILE_SLOTS && (
              <div className={`text-dim ${styles.hint}`}>
                Drawer full. The next file worth more than the weakest one here
                replaces it, and the log will say which.
              </div>
            )}
          </>
        )}
      </div>

      <div className={columns.column}>
        <div className={`text-head ${columns.head}`}>CARRIED EFFECT</div>
        {/* The reason this table has three columns rather than one.
            A player who adds up four clauses reading +15 vigour and then sees
            their maximum move by nineteen concludes the game is broken — and
            they are closer to right than a screen showing only the figure
            resolution uses. The clauses really did roll that high; the ceiling
            really did take the rest. Stating both turns a bug report into a
            decision about what to carry. */}
        {files.length === 0 ? (
          <div className={`text-dim ${styles.hint}`}>
            Nothing kept, so nothing is being added. When you do keep something,
            no amount of it can take your recruit past{' '}
            <span className="text-body">
              +{caps.vigour} health, {(caps.survival * 100).toFixed(0)}% less
              damage taken, or +{(caps.lootValue * 100).toFixed(0)}% loot value
            </span>{' '}
            , however much you keep.
          </div>
        ) : (
          <>
            <div className={`text-dim ${styles.hint}`}>
              {anyClipped
                ? 'What the clauses add up to, and what resolution actually uses.'
                : 'What resolution actually uses, against the ceiling.'}
            </div>
            <div
              className={`text-dim ${styles.effectRow} ${styles.effectHead}`}
              data-filed={anyClipped}
            >
              <span />
              {anyClipped && <span>filed</span>}
              <span>applied</span>
              <span>ceiling</span>
            </div>
            {rows.map((row) => (
              <div
                key={row.label}
                className={styles.effectRow}
                data-filed={anyClipped}
                data-clipped={row.clipped}
              >
                <span className="text-body">{row.label}</span>
                {anyClipped && (
                  <span className={row.clipped ? 'text-dim' : 'text-body'}>{row.raw}</span>
                )}
                <span className="text-bright">{row.effective}</span>
                <span className="text-dim">{row.ceiling}</span>
              </div>
            ))}
            {anyClipped && (
              <div className={`text-dim ${styles.hint}`}>
                A struck figure means further clauses of that kind are doing
                nothing — the ceilings are {caps.vigour} vigour,{' '}
                {(caps.survival * 100).toFixed(0)}% survival and{' '}
                {(caps.lootValue * 100).toFixed(0)}% loot value. They exist
                because a recruit who cannot die banks no pension, and the
                pension is the half of the game that lasts.
              </div>
            )}
          </>
        )}

        {/*
          Only shown once there is something to use them on.

          These three paragraphs used to render on an empty drawer, so the first
          view of this screen was several hundred words about rerolling clauses
          on files the player did not have and could not yet get. Explaining a
          mechanic before its inputs exist is indistinguishable from noise — the
          reader has nothing to attach it to, and the density reads as "this
          game is complicated" rather than "here is a choice".
        */}
        {files.length > 0 && (
          <>
            <div className={`text-head ${columns.headLater}`}>
              WHAT YOU CAN DO WITH A KEPT ITEM
            </div>
            <div className={`text-dim ${styles.hint}`}>
              <span className="text-body">Reroll one line (Form 12-C).</span>{' '}
              Pays a fee to swap a single line for a different one, decided two
              hours later. The new line may be worse, and the fee is kept either
              way. A gamble, not an upgrade.
            </div>
            <div className={`text-dim ${styles.hint}`}>
              <span className="text-body">Move one line (Form 19).</span> Takes
              a line off one item and puts it on another, destroying the item it
              came from. Four hours, and it always works.
            </div>
            <div className={`text-dim ${styles.hint}`}>
              Rerolling costs Union Standing, which your recruit earns by
              levelling up. A successor starts with none of it, however long you
              have been an officer. Moving a line costs none.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
