DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM game_item_draws)
    OR EXISTS (SELECT 1 FROM game_world_drafts WHERE jsonb_array_length(COALESCE(content->'drawPools','[]'::jsonb)) > 0)
    OR EXISTS (SELECT 1 FROM game_world_revisions WHERE jsonb_array_length(COALESCE(definition->'drawPools','[]'::jsonb)) > 0)
    OR EXISTS (SELECT 1 FROM game_turns WHERE state_snapshot->'exploration' ? 'acquisitions')
  THEN RAISE EXCEPTION 'R10.4.1 draw data exists; restore a backup instead of silently deleting acquisitions'; END IF;
END $$;
--> statement-breakpoint
DROP TABLE game_item_draws;
--> statement-breakpoint
DROP INDEX game_sessions_id_owner_key;
