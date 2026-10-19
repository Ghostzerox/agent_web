CREATE TABLE game_world_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input jsonb NOT NULL, content jsonb, origins jsonb NOT NULL DEFAULT '{}'::jsonb,
  locked_sections jsonb NOT NULL DEFAULT '[]'::jsonb, generation_receipt jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, user_id), CHECK (jsonb_typeof(input) = 'object'),
  CHECK (content IS NULL OR (jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 200000))
);
--> statement-breakpoint
CREATE TABLE game_world_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), world_id uuid NOT NULL, user_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0), draft_version integer NOT NULL CHECK (draft_version > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object' AND octet_length(definition::text) <= 300000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (world_id, user_id) REFERENCES game_world_drafts(id, user_id) ON DELETE RESTRICT,
  UNIQUE(world_id, revision), UNIQUE(world_id, draft_version)
);
--> statement-breakpoint
CREATE TABLE game_world_saves (
  session_id uuid PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES game_world_revisions(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL, fingerprint text NOT NULL, UNIQUE(user_id, request_id)
);
