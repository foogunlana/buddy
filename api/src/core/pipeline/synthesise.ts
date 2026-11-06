import { z } from "zod";
import type { StructuredLLM } from "../llm.js";
import type { Agenda, Confidence, FeedbackItem, Relationship, Report, Theme } from "../types.js";
import { DEFAULT_FLOOR, MIN_GIVERS_FOR_EXAMPLES, releaseDecision } from "./threshold.js";

// An approved, anonymised item with who gave it. giverId never leaves this module.
export interface PooledItem extends FeedbackItem {
  giverId: string;
  relationship: Relationship;
}

const Draft = z.object({
  summary: z.string(),
  themes: z.array(
    z.object({
      title: z.string(),
      polarity: z.enum(["keep", "change"]),
      itemIds: z.array(z.string()),
      whyItMattered: z.string(),
      asks: z.array(z.string()),
      examples: z.array(z.string()),
    }),
  ),
  answers: z.array(
    z.object({
      agendaItemId: z.string(),
      answer: z.string(),
      itemIds: z.array(z.string()),
      confidence: z.enum(["high", "medium", "low", "insufficient"]),
    }),
  ),
});
type Draft = z.infer<typeof Draft>;

const QUESTION_SOURCES = new Set(["admin_question", "receiver_objective", "committed_action"]);

function instructions(agenda: Agenda): string {
  const name = agenda.receiverName;
  const questions = agenda.items.filter((i) => QUESTION_SOURCES.has(i.source));
  return `You write the synthesis for ${name}'s 360 feedback report from pooled, anonymised feedback items. Each item has an id and a pseudonymous giver (G1, G2, ...).

Return:
- themes: group items that make the same point into themes. Each theme has one polarity (keep or change), a short title, the ids of every item that supports it, whyItMattered (one sentence on the impact, in general terms; no examples, events or situations), concrete asks (from the items' asks, merged into at most 2; "When pushed for a date, give one with a range" beats "communicate better"; for keep themes, usually none), and 1–2 short paraphrased examples, kept ONLY in the examples field (they are shown or hidden separately). A theme may come from one giver.
- answers: for each of these questions, a direct answer from the items, the ids of the items it rests on, and a confidence. Say plainly when the items don't answer it.
${questions.length ? questions.map((q) => `  - ${q.id}: ${q.description}`).join("\n") : "  (none)"}
- summary: 3–5 sentences: the strongest keep and change themes, in plain words.

Rules:
- Use only what the items say. Every claim must be backed by the item ids you cite.
- Never mention giver pseudonyms, or how many people said something; counts are added separately.
- Write about the work, not ${name}'s character. Neutral tone.`;
}

const CONFIDENCE_ORDER: Confidence[] = ["insufficient", "low", "medium", "high"];
function capConfidence(c: Confidence, voices: number, floor: number): Confidence {
  if (voices === 0) return "insufficient";
  if (voices < floor && CONFIDENCE_ORDER.indexOf(c) > CONFIDENCE_ORDER.indexOf("low")) return "low";
  return c;
}

export type SynthesisResult = { status: "held"; reason: string; totalGivers: number } | { status: "released"; report: Report };

export async function synthesiseReport(
  llm: StructuredLLM,
  agenda: Agenda,
  allItems: PooledItem[],
  floor = DEFAULT_FLOOR,
): Promise<SynthesisResult> {
  const items = allItems.filter((i) => i.approved);
  const decision = releaseDecision(items, floor);
  if (!decision.release) return { status: "held", reason: decision.reason, totalGivers: decision.totalGivers };

  // Pseudonymise givers for the model.
  const pseudonym = new Map<string, string>();
  for (const i of items) if (!pseudonym.has(i.giverId)) pseudonym.set(i.giverId, `G${pseudonym.size + 1}`);
  const input = JSON.stringify(
    items.map((i) => ({
      id: i.id,
      giver: pseudonym.get(i.giverId),
      polarity: i.polarity,
      agendaItemId: i.agendaItemId,
      theme: i.theme,
      behaviour: i.behaviour,
      example: i.example,
      impact: i.impact,
      ask: i.ask,
      recurrence: i.recurrence,
    })),
  );
  const draft = await llm({ name: "report_draft", schema: Draft, instructions: instructions(agenda), input, effort: "high" });
  return { status: "released", report: assemble(agenda, items, draft, decision.splitByRelationship, decision.totalGivers, floor) };
}

// Everything countable is computed here from cited item ids, never taken from the model.
export function assemble(
  agenda: Agenda,
  items: PooledItem[],
  draft: Draft,
  split: boolean,
  totalGivers: number,
  floor = DEFAULT_FLOOR,
): Report {
  const byId = new Map(items.map((i) => [i.id, i]));
  const cited = (ids: string[]) => [...new Set(ids)].map((id) => byId.get(id)).filter((i): i is PooledItem => !!i);
  const giversOf = (list: PooledItem[]) => new Set(list.map((i) => i.giverId));

  const themes: (Theme & { polarity: "keep" | "change" })[] = [];
  for (const t of draft.themes) {
    const support = cited(t.itemIds).filter((i) => i.polarity === t.polarity);
    if (support.length === 0) continue; // no orphan claims
    const givers = giversOf(support);
    const direct = giversOf(support.filter((i) => i.relationship === "direct_report")).size;
    themes.push({
      polarity: t.polarity,
      title: t.title,
      givers: givers.size,
      directReports: split ? direct : null,
      nonDirect: split ? givers.size - direct : null,
      examples: givers.size >= MIN_GIVERS_FOR_EXAMPLES ? t.examples.slice(0, 2) : [],
      whyItMattered: t.whyItMattered,
      asks: t.asks,
    });
  }
  themes.sort((a, b) => b.givers - a.givers);
  const strip = ({ polarity: _p, ...theme }: Theme & { polarity: string }): Theme => theme;

  const answers = new Map(draft.answers.map((a) => [a.agendaItemId, a]));
  const answerFor = (id: string) => {
    const a = answers.get(id);
    const voices = a ? giversOf(cited(a.itemIds)).size : 0;
    return {
      answer: a && voices > 0 ? a.answer : "Not enough feedback spoke to this.",
      voices,
      confidence: capConfidence(a?.confidence ?? "insufficient", voices, floor),
    };
  };

  const voicesOn = (agendaItemId: string) => giversOf(items.filter((i) => i.agendaItemId === agendaItemId)).size;

  return {
    receiverName: agenda.receiverName,
    totalGivers,
    questionsAnswered: agenda.items
      .filter((i) => i.source === "admin_question" || i.source === "receiver_objective")
      .map((i) => ({ agendaItemId: i.id, question: i.description, ...answerFor(i.id) })),
    summary: draft.summary,
    keepDoing: themes.filter((t) => t.polarity === "keep").map(strip),
    change: themes.filter((t) => t.polarity === "change").map(strip),
    byDimension: agenda.items
      .filter((i) => i.source === "dimension")
      .map((i) => ({ agendaItemId: i.id, title: i.title, averageRating: null, ratings: 0 })), // ratings not collected yet
    sinceLastTime: agenda.items
      .filter((i) => i.source === "committed_action")
      .map((i) => {
        const a = answerFor(i.id);
        return { agendaItemId: i.id, action: i.description, progress: a.answer, voices: a.voices };
      }),
    gaps: agenda.items
      .map((i) => ({ agendaItemId: i.id, title: i.title, voices: Math.max(voicesOn(i.id), answerFor(i.id).voices) }))
      .filter((g) => g.voices < floor),
  };
}
