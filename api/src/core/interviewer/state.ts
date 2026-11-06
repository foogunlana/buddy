import { z } from "zod";
import type { Agenda } from "../types.js";

// What the model returns on every turn (structured output).
export const TurnOutput = z.object({
  reply: z.string(),
  comments: z.array(
    z.object({
      summary: z.string(),
      polarity: z.enum(["keep", "change"]),
      behaviour: z.boolean(),
      example: z.boolean(),
      impact: z.boolean(),
      ask: z.boolean(),
      probes: z.number(),
    }),
  ),
  agenda: z.array(
    z.object({
      id: z.string(),
      status: z.enum(["open", "covered", "no_context"]),
    }),
  ),
  identifying_detail: z.boolean(),
  misconduct: z.boolean(),
  done: z.boolean(),
});
export type TurnOutput = z.infer<typeof TurnOutput>;

export interface Limits {
  maxGiverTurns: number;
  maxDurationMs: number;
}

export const DEFAULT_LIMITS: Limits = { maxGiverTurns: 30, maxDurationMs: 10 * 60 * 1000 };

export type StopReason = "complete" | "misconduct" | "turn_limit" | "time_limit";

export function stopReason(
  out: TurnOutput,
  giverTurns: number,
  elapsedMs: number,
  limits: Limits = DEFAULT_LIMITS,
): StopReason | null {
  if (out.misconduct) return "misconduct";
  if (out.done) return "complete";
  if (giverTurns >= limits.maxGiverTurns) return "turn_limit";
  if (elapsedMs >= limits.maxDurationMs) return "time_limit";
  return null;
}

// Agenda statuses the model reported, with any ids it dropped or invented fixed up:
// missing ids count as open; unknown ids are ignored.
export function agendaCoverage(agenda: Agenda, out: TurnOutput): Record<string, "open" | "covered" | "no_context"> {
  const reported = new Map(out.agenda.map((a) => [a.id, a.status]));
  return Object.fromEntries(agenda.items.map((item) => [item.id, reported.get(item.id) ?? "open"]));
}

export function misconductMessage(hrRoute: string): string {
  return (
    "Thank you for telling me. This isn't something I can take as feedback, and it won't go into the report. " +
    `Please raise it through the formal route: ${hrRoute}. We can stop here.`
  );
}

export const LIMIT_MESSAGE =
  "Thanks, that's all the time we have. Next you'll see a summary of what will be shared, and you can edit or remove anything.";
