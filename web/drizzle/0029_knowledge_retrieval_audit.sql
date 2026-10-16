ALTER TABLE prompt_runs ADD COLUMN knowledge_retrieval jsonb;
--> statement-breakpoint
ALTER TABLE prompt_runs ADD CONSTRAINT prompt_run_knowledge_object CHECK (knowledge_retrieval IS NULL OR jsonb_typeof(knowledge_retrieval) = 'object');
