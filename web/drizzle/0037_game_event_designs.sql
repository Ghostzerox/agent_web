CREATE TABLE game_event_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  world_id uuid, session_id uuid, parent_turn_id uuid REFERENCES game_turns(id) ON DELETE CASCADE,
  source_version integer NOT NULL CHECK (source_version > 0),
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot)='object' AND octet_length(source_snapshot::text)<=350000),
  brief text NOT NULL CHECK (length(btrim(brief)) BETWEEN 1 AND 600),
  content jsonb NOT NULL CHECK (jsonb_typeof(content)='object' AND octet_length(content::text)<=100000),
  locked_fields jsonb NOT NULL DEFAULT '[]', origins jsonb NOT NULL DEFAULT '{}',
  generation jsonb NOT NULL DEFAULT '{"attempts":[],"active":null,"error":null}',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), applied_world_version integer,
  applied_turn_id uuid REFERENCES game_turns(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(world_id,user_id) REFERENCES game_world_drafts(id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY(session_id,user_id) REFERENCES game_sessions(id,user_id) ON DELETE CASCADE,
  CHECK ((world_id IS NOT NULL AND session_id IS NULL AND parent_turn_id IS NULL AND applied_turn_id IS NULL)
     OR (world_id IS NULL AND session_id IS NOT NULL AND parent_turn_id IS NOT NULL AND applied_world_version IS NULL))
);
--> statement-breakpoint
CREATE INDEX game_event_designs_source_idx ON game_event_designs(user_id,world_id,session_id,updated_at);
