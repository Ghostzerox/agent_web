CREATE UNIQUE INDEX game_sessions_id_owner_key ON game_sessions(id, user_id);
--> statement-breakpoint
CREATE TABLE game_item_draws (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  parent_turn_id uuid NOT NULL REFERENCES game_turns(id) ON DELETE CASCADE,
  expected_version integer NOT NULL CHECK (expected_version > 0),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 90000),
  status text NOT NULL CHECK (status IN ('sampled','generating','ready','failed','cancelled','settled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  settled_turn_id uuid REFERENCES game_turns(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(session_id, user_id) REFERENCES game_sessions(id, user_id) ON DELETE CASCADE,
  CHECK ((status = 'settled') = (settled_turn_id IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX game_item_draws_branch_idx ON game_item_draws(session_id, parent_turn_id, created_at);
