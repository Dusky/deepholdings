import type { Character, Pension, ScreenId } from '@deepholdings/shared';

/**
 * Which screens an officer has been cleared for.
 *
 * Handing a new player all five tabs is the genre's most common fatal mistake:
 * it reads as overwhelming on day one and hollow at hour one hundred, because
 * nothing is ever ahead of you. Clearance is the in-fiction fix — a case
 * officer is issued a recruit and a permit, and the rest arrives as their file
 * thickens.
 *
 * Derived, not stored: no table, no migration, no drift between the client's
 * idea of clearance and the server's.
 *
 * Every condition is chosen to be **monotone across death**. Level and depth
 * reset with a new recruit; permit tier, recruit number and pension do not, so
 * a screen never disappears after a funeral.
 */
export function clearanceFor(character: Character, pension: Pension): ScreenId[] {
  const granted: ScreenId[] = ['terminal'];

  // The four knobs are the game. Withholding them would look broken, not paced.
  granted.push('orders');

  // Something worth recording: a promotion, or a pension on the books.
  if (character.level >= 2 || pension.total + pension.spent > 0) granted.push('ledger');

  // You have dealt with the permit office; here is the regional situation.
  if (character.permitTier >= 2 || character.recruitNum > 1) granted.push('bulletin');

  // Long enough in post to be worth talking to.
  if (character.level >= 4 || character.recruitNum > 1) granted.push('tavern');

  return granted;
}

const SCREEN_LABEL: Record<ScreenId, string> = {
  terminal: 'Terminal',
  orders: 'Standing Orders',
  ledger: 'Ledger',
  bulletin: 'Regional Bulletin',
  tavern: 'Tavern Channel',
};

/** The line the Authority files when your clearance changes. */
export function clearanceGrantedText(screen: ScreenId): string {
  const notes: Record<ScreenId, string> = {
    terminal: 'Terminal access granted.',
    orders: 'Form SO-1 released to your desk. Amend standing orders at any time.',
    ledger: 'Ledger access granted. Records may not be removed from the premises.',
    bulletin: 'Regional Bulletin access granted. Read it. There will be no summary.',
    tavern: 'Tavern Channel access granted. Conduct reflects on the Authority.',
  };
  return `Clearance amended: ${SCREEN_LABEL[screen]}. ${notes[screen]}`;
}
