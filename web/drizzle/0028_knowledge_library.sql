CREATE TABLE knowledge_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('professional','reflection','news','reading','tasks','memorization','problem-solving','game')),
  title text NOT NULL, description text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX knowledge_collections_id_owner_unique ON knowledge_collections(id,user_id);
--> statement-breakpoint
CREATE INDEX knowledge_collections_owner_idx ON knowledge_collections(user_id);
--> statement-breakpoint
CREATE TABLE knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, collection_id uuid NOT NULL,
  source_key text NOT NULL, title text NOT NULL, format text NOT NULL CHECK (format IN ('text','markdown')),
  content text NOT NULL CHECK (length(btrim(content)) > 0 AND length(content) <= 100000 AND octet_length(content) <= 300000),
  content_hash text NOT NULL, source_url text NOT NULL DEFAULT '', file_name text NOT NULL DEFAULT '', chunk_strategy text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (collection_id,user_id) REFERENCES knowledge_collections(id,user_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX knowledge_document_source_unique ON knowledge_documents(collection_id,source_key);
--> statement-breakpoint
CREATE INDEX knowledge_document_owner_collection_idx ON knowledge_documents(user_id,collection_id);
--> statement-breakpoint
CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  document_version integer NOT NULL CHECK (document_version > 0), ordinal integer NOT NULL CHECK (ordinal >= 0),
  content text NOT NULL, content_hash text NOT NULL, start_line integer NOT NULL CHECK (start_line > 0),
  end_line integer NOT NULL, heading text NOT NULL, CHECK (end_line >= start_line)
);
--> statement-breakpoint
CREATE UNIQUE INDEX knowledge_chunk_document_ordinal_unique ON knowledge_chunks(document_id,ordinal);
