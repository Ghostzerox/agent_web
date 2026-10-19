DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM game_event_designs)
    OR EXISTS (SELECT 1 FROM game_world_drafts WHERE jsonb_array_length(COALESCE(content->'eventDesigns','[]'::jsonb))>0)
    OR EXISTS (SELECT 1 FROM game_world_revisions WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(definition->'events') event WHERE event ? 'details'))
    OR EXISTS (SELECT 1 FROM game_turns WHERE state_snapshot->'exploration' ? 'eventPlanIds' OR state_snapshot->'exploration' ? 'issuedUniqueItems')
  THEN RAISE EXCEPTION 'R10.5 event data exists; restore a reviewed backup instead of deleting event plans'; END IF;
END $$;
--> statement-breakpoint
DROP TABLE game_event_designs;
