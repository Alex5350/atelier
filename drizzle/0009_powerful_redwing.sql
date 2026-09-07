CREATE TABLE "video_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"provider" text NOT NULL,
	"model_id" text,
	"prompt" text NOT NULL,
	"seconds" integer DEFAULT 4 NOT NULL,
	"first_frame_asset_id" text,
	"external_id" text,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"storage_key" text,
	"bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_first_frame_asset_id_assets_id_fk" FOREIGN KEY ("first_frame_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_jobs_project_idx" ON "video_jobs" USING btree ("project_id","created_at");