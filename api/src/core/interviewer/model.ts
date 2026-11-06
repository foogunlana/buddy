import { TurnOutput } from "./state.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// A single interviewer turn: system prompt + conversation so far → structured output.
// Injected into the Interviewer so tests, evals and providers can be swapped.
export type TurnModel = (system: string, messages: ChatMessage[]) => Promise<TurnOutput>;

export class RefusalError extends Error {
  constructor(public detail: string | null | undefined) {
    super(`Model declined the turn: ${detail ?? "no detail"}`);
  }
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface TurnModelOptions {
  model?: string;
  effort?: "low" | "medium" | "high";
  onUsage?: (usage: Usage) => void; // for cost tracking in evals
}

export async function openaiTurnModel(opts: TurnModelOptions = {}): Promise<TurnModel> {
  const { default: OpenAI } = await import("openai");
  const { zodTextFormat } = await import("openai/helpers/zod");
  const client = new OpenAI(); // reads OPENAI_API_KEY
  const model = opts.model ?? process.env.OPENAI_MODEL ?? "gpt-5.5";
  const effort = opts.effort ?? "medium";

  return async (system, messages) => {
    const response = await client.responses.parse({
      model,
      instructions: system,
      input: messages,
      reasoning: { effort },
      text: { format: zodTextFormat(TurnOutput, "interviewer_turn") },
    });
    if (response.usage) {
      opts.onUsage?.({ inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens });
    }
    if (response.incomplete_details) {
      throw new Error(`Interviewer turn incomplete: ${response.incomplete_details.reason}`);
    }
    for (const item of response.output) {
      if (item.type !== "message") continue;
      for (const part of item.content) {
        if (part.type === "refusal") throw new RefusalError(part.refusal);
      }
    }
    if (!response.output_parsed) throw new Error("Interviewer turn did not return valid structured output");
    return response.output_parsed;
  };
}

export async function claudeTurnModel(opts: TurnModelOptions = {}): Promise<TurnModel> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
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
