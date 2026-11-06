import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { TurnOutput } from "../core/interviewer/state.js";

export const relationship = pgEnum("relationship", ["direct_report", "non_direct"]);
export const frequency = pgEnum("frequency", ["daily", "weekly", "monthly", "ad_hoc"]);
export const agendaSource = pgEnum("agenda_source", ["dimension", "admin_question", "receiver_objective", "committed_action"]);
export const conversationStatus = pgEnum("conversation_status", ["active", "ended"]);
export const messageRole = pgEnum("message_role", ["interviewer", "giver"]);
export const polarity = pgEnum("polarity", ["keep", "change"]);
export const recurrence = pgEnum("recurrence", ["one_off", "pattern", "unknown"]);
// pending: shown at the share preview; approved: goes to the pool; removed / too_identifying: never pooled.
export const itemStatus = pgEnum("item_status", ["pending", "approved", "removed", "too_identifying"]);

export const person = pgTable("person", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});

export const programme = pgTable("programme", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  floor: integer("floor").notNull().default(3),
  releaseAt: timestamp("release_at", { withTimezone: true }),
  hrRoute: text("hr_route").notNull(),
});

// Extra agenda items for one receiver in a programme. The default dimensions are added in code.
export const agendaItem = pgTable("agenda_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  programmeId: uuid("programme_id").notNull().references(() => programme.id),
  receiverId: uuid("receiver_id").notNull().references(() => person.id),
  key: text("key").notNull(), // stable id the interviewer and items refer to
  source: agendaSource("source").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
});

export const assignment = pgTable("assignment", {
  id: uuid("id").primaryKey().defaultRandom(),
  programmeId: uuid("programme_id").notNull().references(() => programme.id),
  giverId: uuid("giver_id").notNull().references(() => person.id),
  receiverId: uuid("receiver_id").notNull().references(() => person.id),
  relationship: relationship("relationship").notNull(),
  frequency: frequency("frequency").notNull(),
});

export const conversation = pgTable("conversation", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").notNull().unique().references(() => assignment.id),
  status: conversationStatus("status").notNull().default("active"),
  stopReason: text("stop_reason"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  // The interviewer's latest tracked state. Plain text for now (see PLAN: no encryption in the MVP).
  state: jsonb("state").$type<TurnOutput>(),
  // Share preview: set when item extraction starts (guards against generating twice), and when the giver submits.
  previewStartedAt: timestamp("preview_started_at", { withTimezone: true }),
  previewReadyAt: timestamp("preview_ready_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});

export const message = pgTable(
  "message",
  {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversation.id),
  seq: integer("seq").notNull(),
  role: messageRole("role").notNull(),
  text: text("text").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  // One message per position: a double-submitted turn fails instead of duplicating.
  (t) => [uniqueIndex("message_conversation_seq").on(t.conversationId, t.seq)],
);

export const feedbackItem = pgTable("feedback_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull().references(() => conversation.id),
  seq: integer("seq").notNull(),
  status: itemStatus("status").notNull().default("pending"),
  edited: boolean("edited").notNull().default(false), // giver changed the wording at the preview
  polarity: polarity("polarity").notNull(),
  agendaKey: text("agenda_key"),
  theme: text("theme").notNull(),
  behaviour: text("behaviour"),
  example: text("example"),
  impact: text("impact"),
  ask: text("ask"),
  recurrence: recurrence("recurrence").notNull(),
  specificity: integer("specificity").notNull(),
});
