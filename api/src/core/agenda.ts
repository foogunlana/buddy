import type { Agenda, AgendaItem } from "./types.js";

export const DEFAULT_DIMENSIONS: AgendaItem[] = [
  {
    id: "trust_morale",
    source: "dimension",
    title: "Trust & Morale",
    description: "Whether people feel safe to speak up, ask questions and raise concerns with them.",
  },
  {
    id: "listening_respect",
    source: "dimension",
    title: "Listening & Respect",
    description: "How well they listen, value other viewpoints and read the room.",
  },
  {
    id: "execution_delivery",
    source: "dimension",
    title: "Execution & Delivery",
    description: "Whether they set clear expectations, follow through, and avoid being a bottleneck.",
  },
  {
    id: "commercial_strategy",
    source: "dimension",
    title: "Commercial & Strategy Alignment",
    description: "How well they connect the team's work to company priorities.",
  },
  {
    id: "standards_excellence",
    source: "dimension",
    title: "Standards & Excellence",
    description: "Whether they hold a high quality bar and help the team meet it.",
  },
  {
    id: "feedback_coaching",
    source: "dimension",
    title: "Feedback & Coaching",
    description: "Whether their feedback to others is clear, constructive and timely.",
  },
];

export function buildAgenda(receiverName: string, extra: AgendaItem[] = [], dimensions = DEFAULT_DIMENSIONS): Agenda {
  const items = [...dimensions, ...extra];
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Duplicate agenda item id: ${item.id}`);
    ids.add(item.id);
  }
  return { receiverName, items };
}
