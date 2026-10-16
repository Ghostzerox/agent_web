DROP TRIGGER message_summary_invalidation ON messages;
--> statement-breakpoint
DROP FUNCTION invalidate_conversation_summaries();
--> statement-breakpoint
ALTER TABLE prompt_runs DROP COLUMN summary_usage;
--> statement-breakpoint
DROP TABLE conversation_summaries;
