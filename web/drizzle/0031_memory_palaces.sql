CREATE TABLE memory_palaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
 purpose text NOT NULL CHECK (purpose IN ('navigation','learning')),
 rooms jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rooms) = 'array' AND jsonb_array_length(rooms) <= 6),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX memory_palaces_owner_updated_idx ON memory_palaces(user_id, updated_at);
