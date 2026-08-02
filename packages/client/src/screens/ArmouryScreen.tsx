import {
  CASE_FILE_SLOTS,
  carriedEffect,
  clauseById,
  clauseSlots,
  maxHpForLevel,
  romanGrade,
  type CaseFile,
  type Clause,
} from '@deepholdings/shared';
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

function CaseFileEntry({ file }: { file: CaseFile }) {
  const clauses = file.clauseIds.map(clauseById).filter((c): c is Clause => Boolean(c));
  // Grade buys slots; a file may carry fewer clauses than its grade allows.
  // Showing the gap is the whole argument for Form 3-B when it lands.
  const vacant = Math.max(0, clauseSlots(file.grade) - clauses.length);

  return (
    <div className={styles.file}>
      <div className={styles.fileHead}>
        <span className="text-bright">{file.name}</span>
        <span className="text-dim">{file.id}</span>
      </div>
      <div className={`text-dim ${styles.fileMeta}`}>
        Grade {romanGrade(file.grade)} · {file.category} · book value {file.unitValue}g
      </div>
      {clauses.map((clause) => (
        <div key={clause.id} className={styles.clause} data-kind={clause.kind}>
          <span className={`text-dim ${styles.clauseKind}`}>{KIND_LABEL[clause.kind]}</span>
          <span className="text-body">{clause.text}</span>
          <span className={styles.clauseEffect}>{effectsOf(clause).join(', ')}</span>
        </div>
      ))}
      {Array.from({ length: vacant }, (_, i) => (
        <div key={`vacant-${i}`} className={`text-dim ${styles.vacant}`}>
          [ vacant clause ]
        </div>
      ))}
    </div>
  );
}

export function ArmouryScreen() {
  const { state } = useServer();
  if (!state) return null;

  const files = state.caseFiles ?? [];
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
            The drawer is empty. Most of what a recruit hauls out is weighed and
            sold; once in a while something turns up with contested ownership
            and gets a case number. That is what is filed here.
          </div>
        ) : (
          <>
            <div className={`text-dim ${styles.hint}`}>
              Carried by {state.character.name}. Case files do not survive the
              recruit who found them.
            </div>
            {files.map((file) => (
              <CaseFileEntry key={file.id} file={file} />
            ))}
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
            Nothing carried, so nothing applied. The ceilings stand at{' '}
            {caps.vigour} vigour, {(caps.survival * 100).toFixed(0)}% survival
            and {(caps.lootValue * 100).toFixed(0)}% loot value however many
            files the drawer holds.
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

        <div className={`text-head ${columns.headLater}`}>ARBITRATION</div>
        <div className={`text-dim ${styles.hint}`}>
          Forms 3-B, 12-C and 19 — amendment, arbitration and merger — are not
          yet released to your desk. Until they are, a case file is what it was
          found as.
        </div>
      </div>
    </div>
  );
}
