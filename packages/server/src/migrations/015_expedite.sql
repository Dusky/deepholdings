-- Form 4-E: which permit application was walked down the corridor.
--
-- A tick rather than a boolean, and the difference removes a whole class of
-- bug. The rule is "once per application", so the marker is compared against
-- `permit_applied_tick`: equal means this application was already expedited.
-- When the permit clears the watermark goes null, and the next application sets
-- a different tick, so the comparison fails on its own. A boolean would have
-- needed clearing at exactly the moment the resolver files the next
-- application — inside the pure function, which does not know about gold.
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS permit_expedited_tick INTEGER;
