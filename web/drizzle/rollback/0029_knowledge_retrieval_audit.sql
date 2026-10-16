-- Removes retrieval metadata only, not source documents, personal memories or messages.
ALTER TABLE prompt_runs DROP COLUMN knowledge_retrieval;
