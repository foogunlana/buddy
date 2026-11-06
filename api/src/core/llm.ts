import type { z } from "zod";
import type { Usage } from "./interviewer/model.js";

export type Effort = "low" | "medium" | "high";

export interface StructuredRequest<S extends z.ZodType> {
  name: string; // schema name, snake_case
  schema: S;
  instructions: string;
  input: string;
  effort?: Effort;
}

// One structured-output call. Injected into pipeline stages so tests can use fakes.
export type StructuredLLM = <S extends z.ZodType>(req: StructuredRequest<S>) => Promise<z.infer<S>>;

export async function openaiStructured(
  opts: { model?: string; onUsage?: (u: Usage) => void } = {},
): Promise<StructuredLLM> {
  const { default: OpenAI } = await import("openai");
  const { zodTextFormat } = await import("openai/helpers/zod");
  const client = new OpenAI();
  const model = opts.model ?? process.env.OPENAI_MODEL ?? "gpt-5.5";

  return async (req) => {
    const res = await client.responses.parse({
      model,
      instructions: req.instructions,
      input: [{ role: "user", content: req.input }],
      reasoning: { effort: req.effort ?? "medium" },
      text: { format: zodTextFormat(req.schema, req.name) },
    });
    if (res.usage) opts.onUsage?.({ inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens });
    if (res.incomplete_details) throw new Error(`${req.name}: incomplete (${res.incomplete_details.reason})`);
    if (res.output_parsed == null) throw new Error(`${req.name}: no parseable output`);
    return res.output_parsed as z.infer<typeof req.schema>; // SDK's inferred type differs nominally from zod's
  };
}
