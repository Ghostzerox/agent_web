CREATE TABLE game_asset_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), world_id uuid NOT NULL, user_id uuid NOT NULL,
  source_world_version integer NOT NULL CHECK (source_world_version > 0), source_snapshot jsonb NOT NULL,
  brief text NOT NULL, content jsonb NOT NULL, locked_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  origins jsonb NOT NULL DEFAULT '{}'::jsonb, generation_receipt jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), applied_world_version integer,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (world_id, user_id) REFERENCES game_world_drafts(id, user_id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(source_snapshot) = 'object' AND octet_length(source_snapshot::text) <= 250000),
  CHECK (jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 60000)
);
--> statement-breakpoint
CREATE INDEX game_asset_designs_world_idx ON game_asset_designs(world_id, user_id, updated_at);
--> statement-breakpoint
-- One-time upgrade of editable drafts only. Published definitions and save snapshots stay immutable.
UPDATE game_world_drafts SET content = content || jsonb_build_object(
  'itemRules', jsonb_build_object('slots', jsonb_build_array('hand'), 'attributes', '[]'::jsonb),
  'items', jsonb_build_object('definitions', '[]'::jsonb, 'placements', '[]'::jsonb),
  'characters', (SELECT jsonb_agg(person || '{"kind":"character","category":"npc","profile":{"faction":"尚未表明阵营","appearance":"尚未描述外貌","publicBackground":"你尚未了解此人的过往。","privateBackground":"待设计的本人经历","values":[],"boundaries":["不替玩家决定思想与选择"],"abilities":[],"needs":[],"longTermGoal":"待设计的长期目标","relationships":[],"secrets":[],"authorNotes":[],"usesSupernatural":false}}'::jsonb ORDER BY ord)
    FROM jsonb_array_elements(content->'characters') WITH ORDINALITY AS entry(person, ord))
) WHERE content IS NOT NULL;
