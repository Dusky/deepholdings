-- Standing orders exist from signup with sensible defaults, so "has the player
-- ever filed?" cannot be inferred from the row existing. The first session
-- needs to know: an officer who has never filed Form SO-1 gets told so.

ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS filed_at TIMESTAMPTZ;
