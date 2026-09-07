ALTER TABLE "usage_events" ADD COLUMN "conversation_id" text;--> statement-breakpoint
CREATE INDEX "usage_events_conversation_idx" ON "usage_events" USING btree ("conversation_id");