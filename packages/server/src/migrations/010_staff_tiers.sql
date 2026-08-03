-- Posts get promoted, so a staff row carries the tier it holds.
--
-- Registries written before this have members shaped `{role, policy}` and
-- nothing else. Every read goes through `staffTier`, which treats a missing
-- tier as 1, so the game is correct without this migration — but leaving the
-- stored shape inconsistent means every future query over `staff` has to know
-- about two shapes, and the fallback would quietly become load-bearing rather
-- than a belt-and-braces default.
--
-- `jsonb_agg` over the expanded array rather than a jsonb path update, because
-- the members are positional and `||` on each element is the only way to add a
-- key without naming an index. The `WHERE` keeps it to rows that actually have
-- staff: `jsonb_agg` over an empty set returns NULL, which would turn an empty
-- department into a null column.
--
-- The default is on the *left* of `||` so that a member which already carries a
-- tier keeps it. That makes this idempotent, which matters more than it looks:
-- migrations are tracked and run once, but a hand-repaired database or a
-- restored backup is exactly the situation where somebody re-runs one, and a
-- version of this that clobbered every promotion back to tier 1 would be
-- indistinguishable from working.
UPDATE registries
SET staff = (
  SELECT jsonb_agg('{"tier": 1}'::jsonb || member)
  FROM jsonb_array_elements(staff) AS member
)
WHERE jsonb_array_length(staff) > 0;
