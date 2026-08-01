-- The journal read had no usable index, and it is the hottest query in the game.
--
-- Every `/v1/state` calls `listJournal(characterId, -1, 60)`, which is
--
--   WHERE character_id = $1 AND tick > -1 ORDER BY id DESC LIMIT 60
--
-- `tick > -1` matches every row the character has, so the filter does nothing;
-- the whole shape of the query is "the last 60 lines by write order". The only
-- index was (character_id, tick), which cannot serve ORDER BY id, so the
-- planner walked the *primary key* backwards and filtered:
--
--   Index Scan Backward using journal_pkey
--     Filter: (tick > -1 AND character_id = '…')
--     Rows Removed by Filter: 7871
--
-- 7,871 rows discarded to return 60, at 106k journal rows total. That number is
-- a function of how much *everybody* has played, not how much this player has,
-- so it grows with the population and never comes down — nothing in the journal
-- is ever deleted, which is a documented promise rather than an oversight.
--
-- (character_id, id) is scannable backwards, so the planner can walk this one
-- character's rows newest-first and stop at 60.

CREATE INDEX IF NOT EXISTS journal_character_id_idx ON journal (character_id, id DESC);

-- The old index is now dead weight on every insert. Nothing orders by tick:
-- `listJournal` and `listJournalBefore` both order by id, deliberately, because
-- several lines share a tick and a catch-up can write a line whose tick is
-- older than one already on file.
DROP INDEX IF EXISTS journal_character_tick;
