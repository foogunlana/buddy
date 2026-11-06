import { z } from "zod";
import type { StructuredLLM } from "../llm.js";
import type { FeedbackItem } from "../types.js";

const Rewritten = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      theme: z.string(),
      behaviour: z.string().nullable(),
      example: z.string().nullable(),
      impact: z.string().nullable(),
      ask: z.string().nullable(),
    }),
  ),
});

const INSTRUCTIONS = `You paraphrase 360 feedback items so the person receiving them cannot tell who wrote them.

For each item, rewrite theme, behaviour, example, impact and ask:
- Plain, neutral, third-person wording. Remove the writer's voice: slang, idioms, emphasis, emotional language, distinctive phrasing.
- Remove or generalise anything that points at the writer: their name or role, meetings only a few people attended, exact dates ("on 14 October" → "recently"), unique project or client names ("the Acme migration" → "a client project").
- Keep the substance: what happened, what it cost, what better looks like. Keep it specific enough to act on.
- Keep null fields null. Never add information.
Return every item with its original id.`;

export async function anonymiseItems(llm: StructuredLLM, items: FeedbackItem[]): Promise<FeedbackItem[]> {
  if (items.length === 0) return [];
  const input = JSON.stringify(
    items.map(({ id, theme, behaviour, example, impact, ask }) => ({ id, theme, behaviour, example, impact, ask })),
  );
  const out = await llm({ name: "anonymised_items", schema: Rewritten, instructions: INSTRUCTIONS, input });
  const byId = new Map(out.items.map((i) => [i.id, i]));
  return items.map((item) => {
    const r = byId.get(item.id);
    if (!r) throw new Error(`Anonymiser dropped item ${item.id}`);
    // Never let the rewrite fill a field the giver left empty.
    return {
      ...item,
      theme: r.theme,
      behaviour: item.behaviour === null ? null : r.behaviour,
      example: item.example === null ? null : r.example,
      impact: item.impact === null ? null : r.impact,
      ask: item.ask === null ? null : r.ask,
    };
  });
}
