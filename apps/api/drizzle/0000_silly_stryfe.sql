CREATE TABLE "favorites" (
	"uri" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"rkey" text NOT NULL,
	"station_id" text NOT NULL,
	"station" jsonb NOT NULL,
	"subject_uri" text,
	"created_at" timestamp with time zone,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jetstream_cursor" (
	"id" text PRIMARY KEY NOT NULL,
	"time_us" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"uri" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"rkey" text NOT NULL,
	"name" text NOT NULL,
	"stream_url" text NOT NULL,
	"description" text,
	"genre" text,
	"homepage" text,
	"logo_url" text,
	"tags" jsonb,
	"created_at" timestamp with time zone,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"did" text PRIMARY KEY NOT NULL,
	"handle" text,
	"display_name" text,
	"avatar_url" text,
	"description" text,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "favorites_did_idx" ON "favorites" USING btree ("did");--> statement-breakpoint
CREATE INDEX "favorites_station_id_idx" ON "favorites" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "stations_did_idx" ON "stations" USING btree ("did");