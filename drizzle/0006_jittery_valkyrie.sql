CREATE TYPE "public"."pass_kind" AS ENUM('generate', 'inpaint', 'outpaint', 'upscale');--> statement-breakpoint
CREATE TYPE "public"."pass_status" AS ENUM('draft', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "asset_references" (
	"id" text PRIMARY KEY NOT NULL,
	"pass_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"role" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"pass_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text DEFAULT 'image/png' NOT NULL,
	"width" integer,
	"height" integer,
	"seed" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"seq" integer NOT NULL,
	"kind" "pass_kind" DEFAULT 'generate' NOT NULL,
	"status" "pass_status" DEFAULT 'draft' NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"model_id" text,
	"batch_size" integer DEFAULT 1 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'Untitled project' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_pass_id_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."passes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_references" ADD CONSTRAINT "asset_references_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_pass_id_passes_id_fk" FOREIGN KEY ("pass_id") REFERENCES "public"."passes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passes" ADD CONSTRAINT "passes_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_references_pass_asset_role_idx" ON "asset_references" USING btree ("pass_id","asset_id","role");--> statement-breakpoint
CREATE INDEX "assets_pass_idx" ON "assets" USING btree ("pass_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "passes_project_seq_idx" ON "passes" USING btree ("project_id","seq");--> statement-breakpoint
CREATE INDEX "projects_user_idx" ON "projects" USING btree ("user_id","updated_at");