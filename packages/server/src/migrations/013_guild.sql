-- The regional effort, once it started depending on what officers actually do.
--
-- `guild_cycle` on the world row is the watermark a contributor's own row is
-- compared against. It increments when an objective completes, which is the
-- only moment the objective text and target change.
ALTER TABLE world
  ADD COLUMN IF NOT EXISTS guild_cycle INTEGER NOT NULL DEFAULT 0;

-- One row per contributing account. Its own table rather than columns on
-- `accounts` because it is written on almost every read — a contribution lands
-- whenever a span resolves — and widening the row every account lookup touches
-- for the sake of two counters is how a hot table gets slow.
--
-- `cycle` is which objective the contribution counts toward. When the world has
-- moved past it, the contribution is owed a payout and the row is reset; that
-- comparison is the whole claim mechanism, and it means nothing has to run
-- per-player on a schedule to pay anybody.
CREATE TABLE IF NOT EXISTS guild_contributions (
  account_id   UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  cycle        INTEGER NOT NULL DEFAULT 0,
  contribution INTEGER NOT NULL DEFAULT 0,
  -- Gold paid out over all cycles, so the Bulletin can show a career total.
  paid         INTEGER NOT NULL DEFAULT 0
);
