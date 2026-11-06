import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { TurnOutput } from "./state.js";

// A single interviewer turn: system prompt + conversation so far → structured output.
// Injected into the Interviewer so tests and evals can swap in fakes.
export type TurnModel = (system: string, messages: Anthropic.MessageParam[]) => Promise<TurnOutput>;

export interface ClaudeTurnModelOptions {
  model?: string;
  effort?: "low" | "medium" | "high";
  client?: Anthropic;
}

export class RefusalError extends Error {
  constructor(public category: string | null | undefined) {
    super(`Model declined the turn (category: ${category ?? "unknown"})`);
  }
}

export function claudeTurnModel(opts: ClaudeTurnModelOptions = {}): TurnModel {
  const client = opts.client ?? new Anthropic();
  const model = opts.model ?? "claude-sonnet-5-5";
  const effort = opts.effort ?? "medium";

  return async (system, messages) => {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system,
      messages,
      output_config: { effort, format: zodOutputFormat(TurnOutput) },
      // On a safety decline, re-run on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (response.stop_reason === "refusal") throw new RefusalError(response.stop_details?.category);
    if (response.stop_reason === "max_tokens") throw new Error("Interviewer turn hit max_tokens");
    if (!response.parsed_output) throw new Error("Interviewer turn did not return valid structured output");
    return response.parsed_output;
  };
}
