// Shared types. These are the coordination point between the interviewer,
// the extraction/synthesis pipeline, the database and the UI. Change with care.
import { z } from "zod";

// --- People and relationships ---

export const Relationship = z.enum(["direct_report", "non_direct"]);
export type Relationship = z.infer<typeof Relationship>;

export const InteractionFrequency = z.enum(["daily", "weekly", "monthly", "ad_hoc"]);
export type InteractionFrequency = z.infer<typeof InteractionFrequency>;

// --- Agenda: what the conversation must try to get to ---

export const AgendaSource = z.enum([
  "dimension", // one of the default (or admin-edited) dimensions
  "admin_question", // admin's "must learn" question for this receiver
  "receiver_objective", // receiver's own question, admin-approved
  "committed_action", // an action the receiver committed to last round
]);
export type AgendaSource = z.infer<typeof AgendaSource>;

export const AgendaItem = z.object({
  id: z.string(),
  source: AgendaSource,
  title: z.string(),
  // Plain-words description the interviewer uses to phrase its own open question.
  description: z.string(),
});
export type AgendaItem = z.infer<typeof AgendaItem>;

export const Agenda = z.object({
  receiverName: z.string(),
  items: z.array(AgendaItem),
});
export type Agenda = z.infer<typeof Agenda>;

// --- Feedback items: the unit everything downstream works on ---

export const Polarity = z.enum(["keep", "change"]);
export type Polarity = z.infer<typeof Polarity>;

export const Recurrence = z.enum(["one_off", "pattern", "unknown"]);
export type Recurrence = z.infer<typeof Recurrence>;

export const FeedbackItem = z.object({
  id: z.string(),
  polarity: Polarity,
  agendaItemId: z.string().nullable(), // which agenda item it speaks to, if any
  theme: z.string(), // short label used for pooling, e.g. "Deadline communication"
  behaviour: z.string().nullable(), // what they did or didn't do
  example: z.string().nullable(), // a specific instance
  impact: z.string().nullable(), // what it cost or enabled
  ask: z.string().nullable(), // what better would look like (or "keep doing X")
  recurrence: Recurrence,
  // 0 = trait only, 1 = behaviour, 2 = behaviour + example, 3 = behaviour + example + ask
  specificity: z.number(),
  approved: z.boolean(), // giver approved it at the share preview
});
export type FeedbackItem = z.infer<typeof FeedbackItem>;

// --- Report: what the receiver reads ---

export const Confidence = z.enum(["high", "medium", "low", "insufficient"]);
export type Confidence = z.infer<typeof Confidence>;

export const Theme = z.object({
  title: z.string(),
  givers: z.number(), // how many givers raised it
  // Split by relationship; null when either group is below the anonymity floor.
  directReports: z.number().nullable(),
  nonDirect: z.number().nullable(),
  examples: z.array(z.string()), // paraphrased, 1–2
  whyItMattered: z.string(),
  asks: z.array(z.string()), // concrete asks (empty for most "keep" themes)
});
export type Theme = z.infer<typeof Theme>;

export const Report = z.object({
  receiverName: z.string(),
  totalGivers: z.number(),
  questionsAnswered: z.array(
    z.object({
      agendaItemId: z.string(),
      question: z.string(),
      answer: z.string(),
      voices: z.number(),
      confidence: Confidence,
    }),
  ),
  summary: z.string(),
  keepDoing: z.array(Theme),
  change: z.array(Theme),
  byDimension: z.array(
    z.object({
      agendaItemId: z.string(),
      title: z.string(),
      averageRating: z.number().nullable(), // null when ratings are off or below threshold
      ratings: z.number(),
    }),
  ),
  sinceLastTime: z.array(
    z.object({ agendaItemId: z.string(), action: z.string(), progress: z.string(), voices: z.number() }),
  ),
  gaps: z.array(z.object({ agendaItemId: z.string(), title: z.string(), voices: z.number() })),
});
export type Report = z.infer<typeof Report>;
