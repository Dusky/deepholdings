-- The Registry: staff, and what they cost.
--
-- Its own table rather than columns on `offices`, though both are account-level
-- gold sinks. Requisitions are a set of ids; staff are rows with a mutable
-- policy each, plus a payroll flag that changes on almost every read. Folding
-- them together would mean rewriting the requisition list every time a wage is
-- paid, and the two have different lifetimes: equipment is bought once and
-- never touched again, staff are adjusted.
--
-- `spent` is kept the way the office keeps its own: a running total that is
-- never re-credited, so an officer can see what the department has cost them.
-- Wages add to it, which is the number that makes the recurring cost visible —
-- a per-minute drip is invisible without somewhere the total accumulates.
CREATE TABLE IF NOT EXISTS registries (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  staff      JSONB   NOT NULL DEFAULT '[]'::jsonb,
  spent      INTEGER NOT NULL DEFAULT 0,
  unpaid     BOOLEAN NOT NULL DEFAULT false
);
