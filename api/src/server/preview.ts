// Share preview: after the chat ends, the giver sees the paraphrased items and decides
// what is pooled. Nothing reaches the pool without the giver's approval.
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import type { TranscriptTurn } from "../core/interviewer/interviewer.js";
import type { InterviewContext } from "../core/interviewer/prompt.js";
import type { StructuredLLM } from "../core/llm.js";
import { anonymiseItems } from "../core/pipeline/anonymise.js";
import { extractItems, specificity } from "../core/pipeline/extract.js";
import type { DB } from "../db/client.js";
import * as t from "../db/schema.js";

// A claim on generation older than this is assumed to have crashed and may be retried.
const STALE_MS = 2 * 60 * 1000;

export interface PreviewItem {
  id: string;
  polarity: "keep" | "change";
  theme: string;
  behaviour: string | null;
  example: string | null;
  impact: string | null;
  ask: string | null;
}

export interface PreviewView {
  // not_ended: chat still running; none: nothing to preview (misconduct); preparing: being generated;
  // ready: awaiting the giver's decision; submitted: done (items = what was shared).
  state: "not_ended" | "none" | "preparing" | "ready" | "submitted";
  floor: number;
  items: PreviewItem[];
}

const text = z
  .string()
  .max(2000)
  .nullable()
  .transform((s) => (s === null || s.trim() === "" ? null : s.trim()));

export const Submission = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid(),
        action: z.enum(["keep", "remove", "too_identifying"]),
        theme: z.string().trim().min(1).max(200),
        behaviour: text,
        example: text,
        impact: text,
        ask: text,
      }),
    )
    .max(100),
});
export type Submission = z.infer<typeof Submission>;

const toPreview = (i: typeof t.feedbackItem.$inferSelect): PreviewItem => ({
  id: i.id,
  polarity: i.polarity,
  theme: i.theme,
  behaviour: i.behaviour,
  example: i.example,
  impact: i.impact,
  ask: i.ask,
});

export class PreviewError extends Error {
  constructor(
    public status: 409 | 502,
    message: string,
  ) {
    super(message);
  }
}

async function items(db: DB, conversationId: string) {
  return db.select().from(t.feedbackItem).where(eq(t.feedbackItem.conversationId, conversationId)).orderBy(asc(t.feedbackItem.seq));
}

export async function getPreview(
  db: DB,
  llm: StructuredLLM,
  ctx: InterviewContext,
  floor: number,
  conv: typeof t.conversation.$inferSelect,
  transcript: TranscriptTurn[],
  now: () => number,
): Promise<PreviewView> {
  const view = (state: PreviewView["state"], list: PreviewItem[] = []): PreviewView => ({ state, floor, items: list });
  if (conv.status !== "ended") return view("not_ended");
  if (conv.stopReason === "misconduct") return view("none");
  if (conv.submittedAt) {
    return view("submitted", (await items(db, conv.id)).filter((i) => i.status === "approved").map(toPreview));
  }
  if (conv.previewReadyAt) {
    return view("ready", (await items(db, conv.id)).filter((i) => i.status === "pending").map(toPreview));
  }

  // Claim generation so two requests can't extract twice.
  const [claimed] = await db
    .update(t.conversation)
    .set({ previewStartedAt: new Date(now()) })
    .where(
      and(
        eq(t.conversation.id, conv.id),
        isNull(t.conversation.previewReadyAt),
        or(isNull(t.conversation.previewStartedAt), lt(t.conversation.previewStartedAt, new Date(now() - STALE_MS))),
      ),
    )
    .returning({ id: t.conversation.id });
  if (!claimed) return view("preparing");

  try {
    const extracted = await extractItems(llm, ctx.agenda, transcript, "x");
    const anonymised = await anonymiseItems(llm, extracted);
    await db.transaction(async (tx) => {
      if (anonymised.length) {
        await tx.insert(t.feedbackItem).values(
          anonymised.map((i, n) => ({
            conversationId: conv.id,
            seq: n,
            polarity: i.polarity,
            agendaKey: i.agendaItemId,
            theme: i.theme,
            behaviour: i.behaviour,
            example: i.example,
            impact: i.impact,
            ask: i.ask,
            recurrence: i.recurrence,
            specificity: i.specificity,
          })),
        );
      }
      await tx.update(t.conversation).set({ previewReadyAt: new Date(now()) }).where(eq(t.conversation.id, conv.id));
    });
  } catch (err) {
    console.error("Preview generation failed:", err);
    await db.update(t.conversation).set({ previewStartedAt: null }).where(eq(t.conversation.id, conv.id));
    throw new PreviewError(502, "We couldn't prepare your summary. Please try again.");
  }
  return view("ready", (await items(db, conv.id)).map(toPreview));
}

export async function submitPreview(
  db: DB,
  conv: typeof t.conversation.$inferSelect,
  submission: Submission,
  now: () => number,
): Promise<void> {
  if (conv.status !== "ended" || !conv.previewReadyAt) throw new PreviewError(409, "Your summary isn't ready yet.");
  const pending = (await items(db, conv.id)).filter((i) => i.status === "pending");
  const decided = new Map(submission.items.map((d) => [d.id, d]));
  if (decided.size !== submission.items.length || decided.size !== pending.length || pending.some((i) => !decided.has(i.id))) {
    throw new PreviewError(409, "Please decide on every item before sharing.");
  }

  await db.transaction(async (tx) => {
    // Only the first submission wins.
    const [won] = await tx
      .update(t.conversation)
      .set({ submittedAt: new Date(now()) })
      .where(and(eq(t.conversation.id, conv.id), isNull(t.conversation.submittedAt)))
      .returning({ id: t.conversation.id });
    if (!won) throw new PreviewError(409, "You've already shared this feedback.");

    for (const item of pending) {
      const d = decided.get(item.id)!;
      if (d.action !== "keep") {
        const status = d.action === "remove" ? "removed" : "too_identifying";
        await tx.update(t.feedbackItem).set({ status }).where(eq(t.feedbackItem.id, item.id));
        continue;
      }
      const fields = { theme: d.theme, behaviour: d.behaviour, example: d.example, impact: d.impact, ask: d.ask };
      const edited = (Object.keys(fields) as (keyof typeof fields)[]).some((k) => fields[k] !== item[k]);
      await tx
        .update(t.feedbackItem)
        .set({ status: "approved", ...(edited ? { ...fields, edited: true, specificity: specificity(fields) } : {}) })
        .where(eq(t.feedbackItem.id, item.id));
    }
  });
}
