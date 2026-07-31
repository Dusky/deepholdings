-- Requisitions: office equipment bought with gold.
--
-- Account-scoped rather than character-scoped, because that is the whole point
-- of the sink — gold dies with the recruit, a desk does not. `spent` is kept
-- for the same reason pensions keep theirs: the officer should be able to see
-- what the office has cost them without it ever being refundable.

CREATE TABLE IF NOT EXISTS offices (
  account_id   UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  spent        INTEGER NOT NULL DEFAULT 0,
  requisitions JSONB NOT NULL DEFAULT '[]'::jsonb
);
