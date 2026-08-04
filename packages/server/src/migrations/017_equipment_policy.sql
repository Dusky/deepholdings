-- Which case file the quartermaster keeps when the drawer is full.
--
-- A column beside the other five knobs, for the reason 012 gives: a sixth that
-- behaved differently would be the odd one out for no reason a reader could
-- reconstruct.
--
-- Backfilled to 'balanced', which is the formula `file()` has always used —
-- `vigour + survival*200 + lootValue*120`. So this migration cannot change what
-- any stored order does; it only gives the officer a way to say otherwise.
ALTER TABLE standing_orders
  ADD COLUMN IF NOT EXISTS equipment_policy TEXT NOT NULL DEFAULT 'balanced';

-- Direct Issue (Form 5-E) needs no migration. Case files are stored as jsonb on
-- the character row, so the `countersigned` flag rides along with the rest of
-- the file; an existing drawer simply has the property absent, which reads as
-- false. Noted here rather than left for the next person to wonder about.
