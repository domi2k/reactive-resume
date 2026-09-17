ALTER TABLE "agent_threads" ADD COLUMN "agent_mode" text DEFAULT 'analyze' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_threads" ADD COLUMN "custom_instructions" text;--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_agent_mode_check" CHECK ("agent_mode" in ('analyze', 'edit', 'autonomous'));