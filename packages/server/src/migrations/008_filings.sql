-- Forms: Union Standing, and filings waiting on the clock.
--
-- 007 predicted this migration would move `case_files` out to a table, on the
-- reasoning that a filing resolving on a clock means "a query for filings due
-- before tick N across all characters, and that is a join, not a column".
--
-- That prediction was wrong, and the reason is worth writing down because it
-- is the same reason the rest of this server has the shape it does: **nothing
-- here runs across all characters on a schedule.** Resolution is lazy. A
-- character's missed ticks are replayed when their state is read, inside one
-- transaction on one row. A filing due at tick N therefore resolves the next
-- time that officer opens the terminal — or when the push sweep replays their
-- account looking for a death — and neither path ever wants every character's
-- filings at once.
--
-- So filings sit beside the case files they are about, in the row that already
-- holds them, loaded and written by the same transaction. The join becomes
-- right the day something genuinely needs a cross-character view of what is
-- being processed. Nothing does.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS filings JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Union Standing has been in the journal copy since the prototype — "Union
-- Standing +1 for prompt filing" — against no stored number. Existing recruits
-- start at zero rather than being back-credited for promotions they were never
-- actually paid for: a made-up balance is worse than a small one.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS standing INTEGER NOT NULL DEFAULT 0;
