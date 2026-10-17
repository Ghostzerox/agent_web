CREATE TABLE memory_controls (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
 version integer NOT NULL CHECK (version > 0)
);
