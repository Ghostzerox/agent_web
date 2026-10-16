-- Destructive to knowledge documents: export/backup before any explicitly approved rollback.
-- Existing personal memories and conversations are not changed.
DROP TABLE knowledge_chunks;
--> statement-breakpoint
DROP TABLE knowledge_documents;
--> statement-breakpoint
DROP TABLE knowledge_collections;
