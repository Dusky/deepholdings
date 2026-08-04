-- Repairing the Commendation catalogue: two accelerator tracks become decisions.
--
-- Three of the five tracks changed identity, so stored ids are rewritten here
-- rather than left to rot into rungs the catalogue no longer contains. An
-- unknown id is not inert — `commendationTier` counts entries by track, so a
-- stale `endowment2` would go on counting toward a track that no longer exists
-- and the officer would simply have paid for nothing.
--
-- The mapping is tier-for-tier, which is the fairest reading of what was bought:
-- an officer keeps as many rungs, at the same heights, and they now do something
-- else. Nobody loses a purchase; some people's purchases change meaning.
--
--   intake N       -> intake N        unchanged in id, but now grants the permit
--                                     tier that dispensation used to
--   dispensation N -> (dropped)       its whole job moved into intake, so the
--                                     rung is refunded rather than remapped
--   endowment N    -> audience N      the retired pension multiplier's slot
--
-- Dispensation rungs are refunded to `commendations` at their old prices
-- (1, 2, 4) instead of being remapped, because there is no track left that
-- corresponds to them and silently converting them into Right of Audience would
-- hand an officer a system they never chose to buy into.
UPDATE transfers
SET
  commendations = commendations
    + COALESCE((unlocks @> '["dispensation1"]')::int, 0) * 1
    + COALESCE((unlocks @> '["dispensation2"]')::int, 0) * 2
    + COALESCE((unlocks @> '["dispensation3"]')::int, 0) * 4,
  unlocks = (
    SELECT COALESCE(jsonb_agg(remapped), '[]'::jsonb)
    FROM (
      SELECT CASE entry #>> '{}'
               WHEN 'endowment1' THEN '"audience1"'::jsonb
               WHEN 'endowment2' THEN '"audience2"'::jsonb
               WHEN 'endowment3' THEN '"audience3"'::jsonb
               ELSE entry
             END AS remapped
      FROM jsonb_array_elements(unlocks) AS entry
      WHERE entry #>> '{}' NOT LIKE 'dispensation%'
    ) AS mapped
  )
WHERE unlocks::text LIKE '%dispensation%'
   OR unlocks::text LIKE '%endowment%';
