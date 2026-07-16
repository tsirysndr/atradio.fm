CREATE TABLE "comments" (
	"uri" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"rkey" text NOT NULL,
	"station_id" text NOT NULL,
	"station" jsonb NOT NULL,
	"text" text NOT NULL,
	"facets" jsonb,
	"gif" jsonb,
	"created_at" timestamp with time zone,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_seen" (
	"did" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_did" text NOT NULL,
	"author_did" text NOT NULL,
	"reason" text NOT NULL,
	"subject_uri" text NOT NULL,
	"station_id" text,
	"station" jsonb,
	"text" text,
	"created_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"uri" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"rkey" text NOT NULL,
	"station_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "comments_station_id_idx" ON "comments" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "comments_did_idx" ON "comments" USING btree ("did");--> statement-breakpoint
CREATE INDEX "comments_created_at_idx" ON "comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_did","created_at");--> statement-breakpoint
CREATE INDEX "notifications_subject_uri_idx" ON "notifications" USING btree ("subject_uri");--> statement-breakpoint
CREATE INDEX "reactions_station_id_idx" ON "reactions" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "reactions_created_at_idx" ON "reactions" USING btree ("created_at");