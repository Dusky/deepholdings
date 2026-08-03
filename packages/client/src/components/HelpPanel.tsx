import { useEffect } from 'react';
import {
  FORMS,
  GLOSSARY_SCREENS,
  glossaryFor,
  type GlossaryScreen,
} from '@deepholdings/shared';
import styles from './HelpPanel.module.css';

interface HelpPanelProps {
  onClose: () => void;
}

/**
 * Somewhere to look things up.
 *
 * ## Why the game needed one
 *
 * Everything the product ever explained, it explained **once, in the journal**
 * — the three onboarding lines at account creation, and one line per screen as
 * clearance was granted. The journal scrolls, so all of it is gone within the
 * hour and none of it can be recalled. A player who put the app down for a week
 * and came back had no way to find out what a Commendation was, and no way to
 * discover there had ever been an explanation.
 *
 * The `help` command was not a substitute for two reasons: it lists command
 * usage rather than meanings, and it is not rendered on a phone in portrait
 * (`Console.tsx`), which is the platform this ships on. So the target audience
 * had no help at all.
 *
 * ## Why it is not the main answer
 *
 * This is the backstop, deliberately. The primary fix is that every control now
 * carries its meaning where it is used, because a game whose main screen needs
 * a manual has already lost the player who would have opened one. What lives
 * here is the second read — the paragraph, the joke, the bit of history — for
 * somebody who has chosen to learn more.
 *
 * Both come from the same `glossary.ts` entries, so the tooltip and the manual
 * cannot drift apart.
 */
const SECTION_TITLES: Record<GlossaryScreen, string> = {
  basics: 'The basics',
  orders: 'Standing orders',
  ledger: 'Selling',
  office: 'Spending gold',
  pension: 'Permanent progress',
  armoury: 'Case files',
  bulletin: 'The region',
};

export function HelpPanel({ onClose }: HelpPanelProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.panel} role="dialog" aria-label="What things mean">
      <div className={styles.head}>
        <div className={styles.title}>WHAT THINGS MEAN</div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close help">
          ✕
        </button>
      </div>

      <div className={styles.body}>
        {GLOSSARY_SCREENS.map((screen) => (
          <section key={screen}>
            <h2 className={styles.section}>{SECTION_TITLES[screen]}</h2>
            {glossaryFor(screen).map((entry) => (
              <div key={entry.term} className={styles.entry}>
                <div className={styles.term}>{entry.term}</div>
                <div className={styles.plain}>{entry.plain}</div>
                {entry.detail && <div className={styles.detail}>{entry.detail}</div>}
              </div>
            ))}
          </section>
        ))}

        <section>
          <h2 className={styles.section}>Forms</h2>
          {/*
            Every form the game can put in front of a player, with what it does
            said as an action. A form code on its own — "Form R-1 available" —
            is the single thing that made this product unreadable, so the verb
            comes first here and the code is the label rather than the subject.
          */}
          {Object.entries(FORMS).map(([code, form]) => (
            <div key={code} className={styles.entry}>
              <div className={styles.term}>
                {form.verb} <span className={styles.code}>(Form {code})</span>
              </div>
              <div className={styles.plain}>{form.plain}</div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
