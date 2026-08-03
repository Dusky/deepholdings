-- Transfer: the officer's own prestige, and the only currency that survives it.
--
-- Its own table rather than columns on `pensions`, because the two have exactly
-- opposite lifetimes: a transfer *empties* the pension row and leaves this one
-- untouched. Folding them together would put the thing being reset and the
-- thing being paid in the same UPDATE, which is the shape of a bug that costs
-- somebody their whole prestige currency.
--
-- `careers` counts transfers filed rather than recruits buried — those are
-- `characters.recruit_num`, which restarts with each posting. Kept because it
-- is the only record that a previous posting happened at all, and a player who
-- has reset three times should be able to see that they did.
CREATE TABLE IF NOT EXISTS transfers (
  account_id    UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  commendations INTEGER NOT NULL DEFAULT 0,
  spent         INTEGER NOT NULL DEFAULT 0,
  unlocks       JSONB   NOT NULL DEFAULT '[]'::jsonb,
  careers       INTEGER NOT NULL DEFAULT 0
);
