/**
 * The guard behind product goal #2: a term of art may not reach a player
 * unexplained.
 *
 * ## What this can and cannot catch — read this before trusting it
 *
 * **Fully enforced: form codes.** Every `Form <code>` the client or the server's
 * player-visible strings can render must have a `FORMS` entry. This family is
 * complete, mechanical, and the one most likely to grow — four more forms are
 * already designed. A new one cannot ship without a plain-English meaning.
 *
 * **Enforced: the quality of every gloss we do have.** Length, punctuation,
 * self-containment, and that no gloss leans on a term the reader has not met.
 *
 * **Not enforced: a brand-new invented noun.** Nothing can tell "Undersill" from
 * "cabinet" by inspection, so a genuinely new word still needs a human to
 * notice. Saying so plainly here rather than implying total coverage, because a
 * guard everyone believes is total is worse than one whose edges are known —
 * that is the same mistake as a green test suite that could not see an
 * unreadable UI.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FORMS,
  GLOSSARY,
  GLOSSARY_SCREENS,
  describeForm,
  glossaryFor,
} from '@deepholdings/shared';

const here = fileURLToPath(new URL('.', import.meta.url));
const CLIENT_SRC = join(here, '..', 'src');
const SERVER_SRC = join(here, '..', '..', 'server', 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/** `Form X` but not `Forms X` — the plural list is matched separately. */
const FORM_CODE = /\bForm\s+([A-Z0-9]+(?:-[A-Z0-9]+)?)\b/g;
/** `Forms 7-A, 3-B, N-1 and 44` — the withheld-forms sentence. */
const FORM_LIST = /\bForms\s+([A-Z0-9-]+(?:,\s*[A-Z0-9-]+)*(?:\s+and\s+[A-Z0-9-]+)?)/g;

function formCodesIn(text: string): string[] {
  const codes: string[] = [];
  for (const match of text.matchAll(FORM_CODE)) codes.push(match[1]);
  for (const match of text.matchAll(FORM_LIST)) {
    for (const code of match[1].split(/,\s*|\s+and\s+/)) codes.push(code.trim());
  }
  return codes;
}

test('every form code the client can render has a plain meaning', () => {
  const missing = new Map<string, string[]>();

  for (const file of [...sourceFiles(CLIENT_SRC), ...sourceFiles(SERVER_SRC)]) {
    const text = readFileSync(file, 'utf8');
    for (const code of formCodesIn(text)) {
      if (FORMS[code]) continue;
      const seen = missing.get(code) ?? [];
      seen.push(file.replace(/.*\/packages\//, 'packages/'));
      missing.set(code, seen);
    }
  }

  assert.deepEqual(
    [...missing.keys()],
    [],
    `Form codes with no FORMS entry in glossary.ts:\n` +
      [...missing].map(([code, files]) => `  Form ${code} — ${files[0]}`).join('\n') +
      `\n\nAdd each to FORMS with a verb and a plain sentence. A form code on ` +
      `its own tells a player nothing.`,
  );
});

test('a form describes itself as an action, not a code', () => {
  // The house style: say what it does, then the code. `Form R-1 available` was
  // the line that made the case for this whole file.
  assert.equal(
    describeForm('R-1'),
    'Retire this recruit — Ends this recruit\'s career now and banks their ' +
      'pension. A successor is assigned immediately.',
  );
  assert.equal(describeForm('nonexistent'), null);
});

test('every gloss stands on its own beside a control', () => {
  for (const [id, entry] of Object.entries(GLOSSARY)) {
    assert.ok(entry.plain.length > 0, `${id}: empty gloss`);
    assert.ok(
      entry.plain.length <= 160,
      `${id}: gloss is ${entry.plain.length} chars. It has to fit beside the ` +
        `control it explains; put the rest in \`detail\`.`,
    );
    assert.match(entry.plain, /[.!?]$/, `${id}: gloss should be a sentence`);
    assert.ok(entry.term.length > 0, `${id}: empty term`);
  }
});

test('no gloss explains one invented word with another', () => {
  // A gloss that says "Filed as Form SO-1" in its first line has moved the
  // problem rather than solved it. Codes are allowed in `detail`, where the
  // reader has already opted in.
  for (const [id, entry] of Object.entries(GLOSSARY)) {
    assert.deepEqual(
      formCodesIn(entry.plain),
      [],
      `${id}: the inline gloss names a form code. Inline text is read by ` +
        `someone who does not know what a form is; move it to \`detail\`.`,
    );
  }
});

test('the help panel has no empty sections', () => {
  for (const screen of GLOSSARY_SCREENS) {
    assert.ok(
      glossaryFor(screen).length > 0,
      `Glossary screen "${screen}" has no entries, so the help panel would ` +
        `render an empty heading.`,
    );
  }
});

test('the terms that broke the game are covered', () => {
  // Regression pins on the specific failures the owner reported. These are the
  // ones that made the product unreadable; they do not get to quietly lapse.
  for (const id of ['supplies', 'pension', 'standing', 'floor', 'permit'] as const) {
    assert.ok(GLOSSARY[id], `${id} must stay glossed`);
  }
  // "Separation assessed at 3056" — a number with no unit. The gloss for
  // pension has to name it as money-that-is-kept, not as a process.
  assert.match(GLOSSARY.pension.plain, /permanent/i);
  // Supplies was a permanently visible chip with no meaning anywhere. Its
  // gloss must state the consequence, because the consequence is death.
  assert.match(GLOSSARY.supplies.plain, /starv/i);
});
