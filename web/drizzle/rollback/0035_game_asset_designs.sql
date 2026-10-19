-- Refuse a lossy downgrade after anyone has used the new authoring features.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM game_asset_designs)
    OR EXISTS (SELECT 1 FROM game_world_revisions WHERE definition ? 'personas')
    OR EXISTS (SELECT 1 FROM game_world_drafts WHERE input->>'numericPolicy' = 'specified'
      OR jsonb_array_length(content->'items'->'definitions') > 0 OR jsonb_array_length(content->'items'->'placements') > 0
      OR jsonb_array_length(content->'itemRules'->'attributes') > 0
      OR content->'itemRules'->'slots' <> '["hand"]'::jsonb OR jsonb_array_length(content->'characters') > 5
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(content->'characters') person WHERE person->>'category' <> 'npc'
        OR person->'profile' <> '{"faction":"尚未表明阵营","appearance":"尚未描述外貌","publicBackground":"你尚未了解此人的过往。","privateBackground":"待设计的本人经历","values":[],"boundaries":["不替玩家决定思想与选择"],"abilities":[],"needs":[],"longTermGoal":"待设计的长期目标","relationships":[],"secrets":[],"authorNotes":[],"usesSupernatural":false}'::jsonb))
  THEN RAISE EXCEPTION 'R10.4 authoring data exists; restore a reviewed backup instead of deleting it for downgrade.';
  END IF;
END $$;
--> statement-breakpoint
UPDATE game_world_drafts SET content = (content - 'itemRules' - 'items') || jsonb_build_object('characters',
  (SELECT jsonb_agg(person - 'kind' - 'category' - 'profile' ORDER BY ord) FROM jsonb_array_elements(content->'characters') WITH ORDINALITY AS entry(person, ord)))
WHERE content IS NOT NULL;
--> statement-breakpoint
DROP TABLE game_asset_designs;
