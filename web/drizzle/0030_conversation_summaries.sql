CREATE TABLE conversation_summaries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 fingerprint text NOT NULL,
 mode text NOT NULL,
 policy text NOT NULL,
 context_stamp text NOT NULL,
 model_key text NOT NULL,
 settings jsonb NOT NULL,
 sources jsonb NOT NULL,
 payload jsonb,
 status text NOT NULL CHECK (status IN ('pending','draft','approved','failed')),
 version integer NOT NULL DEFAULT 1 CHECK (version > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(conversation_id, fingerprint),
 CHECK (jsonb_typeof(sources) = 'array'),
 CHECK (payload IS NULL OR jsonb_typeof(payload) = 'object')
);
--> statement-breakpoint
CREATE INDEX conversation_summaries_owner_idx ON conversation_summaries(user_id, conversation_id);
--> statement-breakpoint
ALTER TABLE prompt_runs ADD COLUMN summary_usage jsonb CHECK (summary_usage IS NULL OR jsonb_typeof(summary_usage) = 'object');
--> statement-breakpoint
CREATE FUNCTION invalidate_conversation_summaries() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM conversation_summaries WHERE conversation_id = OLD.conversation_id;
 RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER message_summary_invalidation AFTER UPDATE OF content, parent_message_id, role, status OR DELETE ON messages FOR EACH ROW EXECUTE FUNCTION invalidate_conversation_summaries();
