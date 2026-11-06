CREATE TYPE "public"."item_status" AS ENUM('pending', 'approved', 'removed', 'too_identifying');--> statement-breakpoint
CREATE TYPE "public"."polarity" AS ENUM('keep', 'change');--> statement-breakpoint
CREATE TYPE "public"."recurrence" AS ENUM('one_off', 'pattern', 'unknown');--> statement-breakpoint
CREATE TABLE "feedback_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"status" "item_status" DEFAULT 'pending' NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"polarity" "polarity" NOT NULL,
	"agenda_key" text,
	"theme" text NOT NULL,
	"behaviour" text,
	"example" text,
	"impact" text,
	"ask" text,
	"recurrence" "recurrence" NOT NULL,
	"specificity" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "preview_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feedback_item" ADD CONSTRAINT "feedback_item_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE no action ON UPDATE no action;