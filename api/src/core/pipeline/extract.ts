import { z } from "zod";
import type { TranscriptTurn } from "../interviewer/interviewer.js";
import type { StructuredLLM } from "../llm.js";
import type { Agenda, FeedbackItem } from "../types.js";

const Extracted = z.object({
  items: z.array(
    z.object({
      polarity: z.enum(["keep", "change"]),
      agendaItemId: z.string().nullable(),
      theme: z.string(),
      behaviour: z.string().nullable(),
      example: z.string().nullable(),
      impact: z.string().nullable(),
      ask: z.string().nullable(),
      recurrence: z.enum(["one_off", "pattern", "unknown"]),
    }),
  ),
});

export function specificity(item: Pick<FeedbackItem, "behaviour" | "example" | "ask">): number {
  if (!item.behaviour) return 0;
  if (!item.example) return 1;
  if (!item.ask) return 2;
  return 3;
}

function instructions(agenda: Agenda): string {
  return `You extract 360 feedback items about ${agenda.receiverName} from one interview transcript.

An item is one distinct point the GIVER made. Use only what the giver said; the interviewer's questions are context, not content. Never add detail the giver didn't give. If a part is missing, use null.

- polarity: "keep" (something to keep doing) or "change".
- agendaItemId: the agenda item it speaks to, or null. Agenda:
${agenda.items.map((i) => `  - ${i.id}: ${i.title}`).join("\n")}
- theme: a short neutral label that would group similar points from other people, e.g. "Deadline communication".
- behaviour: what ${agenda.receiverName} did or didn't do, as an action (not a trait).
- example: the specific instance, if one was given.
- impact: what it cost or enabled.
- ask: what better would look like, or what to keep doing.
- recurrence: "pattern", "one_off", or "unknown".

If the giver chose to generalise or drop a detail when asked, respect that choice.
Do not extract disclosures of harassment, discrimination, safety issues or other misconduct.
Do not extract "I have no context" answers.`;
}

export async function extractItems(
  llm: StructuredLLM,
  agenda: Agenda,
  transcript: TranscriptTurn[],
  idPrefix: string,
): Promise<FeedbackItem[]> {
  const text = transcript.map((t) => `${t.role === "interviewer" ? "INTERVIEWER" : "GIVER"}: ${t.text}`).join("\n\n");
  const out = await llm({ name: "extracted_items", schema: Extracted, instructions: instructions(agenda), input: text });
  const validAgenda = new Set(agenda.items.map((i) => i.id));
  return out.items.map((item, n) => ({
    ...item,
    id: `${idPrefix}-${n + 1}`,
    agendaItemId: item.agendaItemId && validAgenda.has(item.agendaItemId) ? item.agendaItemId : null,
    specificity: specificity(item),
    approved: false, // set at the giver's share preview
  }));
}
