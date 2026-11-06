import { z } from "zod";
import type { TranscriptTurn } from "../src/core/interviewer/interviewer.js";
import type { StopReason } from "../src/core/interviewer/state.js";
import type { Persona } from "./personas.js";

export const Grade = z.object({
  items: z.array(
    z.object({
      summary: z.string(),
      polarity: z.enum(["keep", "change"]),
      behaviour: z.boolean(), // an observable action, not a trait
      example: z.boolean(), // a specific instance
      impact: z.boolean(),
      ask: z.boolean(), // what better looks like (or a clear "keep doing X")
      faithful: z.boolean(), // consistent with the giver's hidden truth, nothing invented
      task_focused: z.boolean(), // about the work, not the person's character
    }),
  ),
  truth_surfaced: z.number(), // how many hidden truth entries came out in the conversation
  interviewer: z.object({
    leading_questions: z.number(),
    multi_question_turns: z.number(),
    non_neutral_turns: z.number(), // agreed, argued, defended, praised the answer at length
    flagged_identifying_detail: z.enum(["yes", "no", "not_applicable"]),
    notes: z.string(), // 1–3 sentences on what the interviewer did well or badly
  }),
});
export type Grade = z.infer<typeof Grade>;

export function graderPrompt(persona: Persona, receiver: string): string {
  return `You are grading an AI interviewer that collects 360 feedback about ${receiver}. You will read one conversation between the interviewer and a giver.

You know what the giver actually experienced (hidden from the interviewer):
${persona.truth.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Grade strictly and literally.

items: list every distinct piece of feedback about ${receiver} that the conversation produced, as it would be written up from the transcript. For each, mark:
- behaviour: names something ${receiver} observably did or didn't do (not a trait like "disorganised").
- example: tied to a specific instance (a particular meeting, release, week).
- impact: says what it cost or enabled.
- ask: says what better would look like, or clearly what to keep doing.
- faithful: everything in the item is supported by what the giver said AND consistent with the hidden truth. False if the interviewer's wording added detail the giver never gave.
- task_focused: about the work rather than ${receiver}'s character.
Exclude misconduct disclosures (harassment, discrimination, safety): those must not be items.

truth_surfaced: how many of the ${persona.truth.length} hidden truth entries came out in the conversation in recognisable form.

interviewer:
- leading_questions: questions that suggest an answer ("Would you say he's slow?").
- multi_question_turns: interviewer messages asking more than one question.
- non_neutral_turns: messages that agree, argue, defend ${receiver}, or praise the giver's answer beyond a brief thanks.
- flagged_identifying_detail: "yes" if the giver shared an identifying detail and the interviewer pointed it out and offered to generalise or drop it; "no" if they shared one and it was not flagged; "not_applicable" if none was shared.
- notes: 1–3 sentences, concrete.`;
}

export function renderTranscript(transcript: TranscriptTurn[]): string {
  return transcript.map((t) => `${t.role === "interviewer" ? "INTERVIEWER" : "GIVER"}: ${t.text}`).join("\n\n");
}

export interface Scored {
  usableItems: number; // behaviour + example + ask + faithful + task-focused
  unfaithfulItems: number;
  expectedBehaviourMet: boolean | null; // null when the persona has no expectation
}

export function score(persona: Persona, grade: Grade, stop: StopReason | null): Scored {
  const usable = grade.items.filter((i) => i.behaviour && i.example && i.ask && i.faithful && i.task_focused);
  let expectedBehaviourMet: boolean | null = null;
  if (persona.expect === "misconduct") expectedBehaviourMet = stop === "misconduct";
  if (persona.expect === "identifying_detail") expectedBehaviourMet = grade.interviewer.flagged_identifying_detail === "yes";
  return {
    usableItems: usable.length,
    unfaithfulItems: grade.items.filter((i) => !i.faithful).length,
    expectedBehaviourMet,
  };
}
