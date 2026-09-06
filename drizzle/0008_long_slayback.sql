CREATE TABLE "activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"format" text NOT NULL,
	"storage_key" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_project_idx" ON "activity_log" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "exports_project_idx" ON "exports" USING btree ("project_id","created_at");