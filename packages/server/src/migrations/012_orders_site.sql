-- Where the recruit works, on the form the officer already files.
--
-- A column rather than a JSON blob because the other four knobs are columns and
-- a fifth that behaved differently would be the odd one out for no reason a
-- reader could reconstruct.
--
-- Backfilled to the home site, which is where every existing recruit already
-- is: sites were introduced with `holdings` reproducing the previous global
-- behaviour exactly, so this migration cannot change what any stored order does.
ALTER TABLE standing_orders
  ADD COLUMN IF NOT EXISTS site TEXT NOT NULL DEFAULT 'holdings';
