-- Special Assignments: which one is being worked, and which are finished.
--
-- Its own table rather than columns on `transfers`, even though both are
-- account-level and permanent-ish, because they have opposite write patterns:
-- a transfer row changes a handful of times in a career, and `progress` here
-- changes on every read that resolves any ticks. Putting a hot counter in the
-- row that holds the prestige currency is how a careless UPDATE loses somebody
-- their Commendations.
--
-- `completed` is a set, not a count. An assignment pays once, and which ones
-- are finished is what the Bulletin renders.
CREATE TABLE IF NOT EXISTS assignments (
  account_id   UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  active       TEXT,
  progress     INTEGER NOT NULL DEFAULT 0,
  started_tick INTEGER NOT NULL DEFAULT 0,
  completed    JSONB   NOT NULL DEFAULT '[]'::jsonb
);
