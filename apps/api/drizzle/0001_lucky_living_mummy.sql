CREATE TABLE "recently_played" (
	"did" text NOT NULL,
	"station_id" text NOT NULL,
	"station" jsonb NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recently_played_did_played_at_pk" PRIMARY KEY("did","played_at")
);
--> statement-breakpoint
CREATE INDEX "recently_played_did_idx" ON "recently_played" USING btree ("did");--> statement-breakpoint
CREATE INDEX "recently_played_station_id_idx" ON "recently_played" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "recently_played_played_at_idx" ON "recently_played" USING btree ("played_at");