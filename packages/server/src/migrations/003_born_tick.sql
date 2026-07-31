-- Pensions accrue with service, so a recruit has to know when they started.
-- Existing rows backfill from their resolution watermark: the best available
-- estimate, and only wrong for characters that predate the change.

ALTER TABLE characters ADD COLUMN IF NOT EXISTS born_tick BIGINT;
UPDATE characters SET born_tick = last_resolved_tick WHERE born_tick IS NULL;
ALTER TABLE characters ALTER COLUMN born_tick SET NOT NULL;
