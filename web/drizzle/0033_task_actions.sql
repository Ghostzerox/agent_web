CREATE TABLE action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'), version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
--> statement-breakpoint
CREATE INDEX action_items_owner_idx ON action_items(user_id);
--> statement-breakpoint
CREATE TABLE action_entries (
  item_id uuid NOT NULL REFERENCES action_items(id) ON DELETE CASCADE, day text NOT NULL,
  data jsonb NOT NULL, CONSTRAINT action_entry_day_unique UNIQUE(item_id, day)
);
--> statement-breakpoint
CREATE TABLE action_events (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  fingerprint text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX action_events_owner_idx ON action_events(user_id);
