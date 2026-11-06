CREATE TYPE "public"."agenda_source" AS ENUM('dimension', 'admin_question', 'receiver_objective', 'committed_action');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('daily', 'weekly', 'monthly', 'ad_hoc');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('interviewer', 'giver');--> statement-breakpoint
CREATE TYPE "public"."relationship" AS ENUM('direct_report', 'non_direct');--> statement-breakpoint
CREATE TABLE "agenda_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"key" text NOT NULL,
	"source" "agenda_source" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"programme_id" uuid NOT NULL,
	"giver_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"relationship" "relationship" NOT NULL,
	"frequency" "frequency" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"stop_reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"state" jsonb,
	CONSTRAINT "conversation_assignment_id_unique" UNIQUE("assignment_id")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"role" "message_role" NOT NULL,
	"text" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "person_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "programme" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"floor" integer DEFAULT 3 NOT NULL,
	"release_at" timestamp with time zone,
	"hr_route" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_receiver_id_person_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_programme_id_programme_id_fk" FOREIGN KEY ("programme_id") REFERENCES "public"."programme"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_giver_id_person_id_fk" FOREIGN KEY ("giver_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_receiver_id_person_id_fk" FOREIGN KEY ("receiver_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_conversation_seq" ON "message" USING btree ("conversation_id","seq");