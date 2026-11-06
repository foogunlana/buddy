// Simulated-giver eval: each persona has a real conversation with the interviewer,
// then a grader scores the transcript against the persona's hidden truth.
//   npm run eval                          # all personas
//   npm run eval -- --personas vague,terse --max-turns 12 --quiet
// Writes one immutable JSON per run to api/evals/runs/.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { buildAgenda } from "../src/core/agenda.js";
import { Interviewer } from "../src/core/interviewer/interviewer.js";
import { openaiTurnModel, type ChatMessage, type Usage } from "../src/core/interviewer/model.js";
import { buildSystemPrompt, type InterviewContext } from "../src/core/interviewer/prompt.js";
import { Grade, graderPrompt, renderTranscript, score } from "./grade.js";
import { PERSONAS, RECEIVER, type Persona } from "./personas.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const { values } = parseArgs({
  options: {
    personas: { type: "string" },
    "max-turns": { type: "string", default: "14" },
    model: { type: "string" },
    quiet: { type: "boolean", default: false },
  },
});

const MODEL = values.model ?? process.env.OPENAI_MODEL ?? "gpt-5.5";
const config = {
  interviewer: { model: MODEL, effort: "medium" as const },
  giver: { model: MODEL, effort: "low" as const },
  grader: { model: MODEL, effort: "high" as const },
  limits: { maxGiverTurns: Number(values["max-turns"]), maxDurationMs: Number.POSITIVE_INFINITY },
};

const selected = values.personas
  ? PERSONAS.filter((p) => values.personas!.split(",").includes(p.id))
  : PERSONAS;
if (selected.length === 0) throw new Error(`No personas match ${values.personas}`);

const client = new OpenAI();
const usage: Usage = { inputTokens: 0, outputTokens: 0 };
const addUsage = (u: Usage) => {
  usage.inputTokens += u.inputTokens;
  usage.outputTokens += u.outputTokens;
};

function giverInstructions(p: Persona): string {
  return `You are role-playing an employee giving confidential 360 feedback about your manager-level colleague ${RECEIVER} to an AI interviewer. Stay in character for the whole conversation. Reply only with what you would type in the chat.

Your relationship: you ${p.relationship === "direct_report" ? "report directly to" : "work with but don't report to"} ${RECEIVER} and interact ${p.frequency.replace("_", " ")}.

How you talk: ${p.style}

What you actually know (reveal it naturally, in your style; never invent other events):
${p.truth.map((t) => `- ${t}`).join("\n")}

${p.noContextOn.length ? `You genuinely have no context on: ${p.noContextOn.join("; ")}. Say so if asked.` : ""}
When you have nothing more to add, say so plainly.`;
}

async function giverTurn(p: Persona, iv: Interviewer): Promise<string> {
  // The giver sees the conversation from their side: interviewer = user, giver = assistant.
  const input: ChatMessage[] = iv.transcript.map((t) => ({
    role: t.role === "interviewer" ? "user" : "assistant",
    content: t.text,
  }));
  const res = await client.responses.create({
    model: config.giver.model,
    instructions: giverInstructions(p),
    input,
    reasoning: { effort: config.giver.effort },
  });
  if (res.usage) addUsage({ inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens });
  return res.output_text.trim();
}

async function grade(p: Persona, iv: Interviewer): Promise<Grade> {
  const res = await client.responses.parse({
    model: config.grader.model,
    instructions: graderPrompt(p, RECEIVER),
    input: [{ role: "user", content: renderTranscript(iv.transcript) }],
    reasoning: { effort: config.grader.effort },
    text: { format: zodTextFormat(Grade, "grade") },
  });
  if (res.usage) addUsage({ inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens });
  if (!res.output_parsed) throw new Error(`Grader returned no parseable output for ${p.id}`);
  return res.output_parsed;
}

async function runPersona(p: Persona) {
  const ctx: InterviewContext = {
    agenda: buildAgenda(RECEIVER),
    relationship: p.relationship,
    frequency: p.frequency,
    hrRoute: "your People & Culture lead",
  };
  const model = await openaiTurnModel({ ...config.interviewer, onUsage: addUsage });
  const iv = new Interviewer(ctx, model, config.limits);
  iv.start();
  while (!iv.stopReason) {
    await iv.reply(await giverTurn(p, iv));
  }
  const g = await grade(p, iv);
  return {
    persona: p.id,
    stop: iv.stopReason,
    giverTurns: iv.transcript.filter((t) => t.role === "giver").length,
    scored: score(p, g, iv.stopReason),
    grade: g,
    finalState: iv.lastState,
    transcript: iv.transcript,
  };
}

const startedAt = new Date();
const results = await Promise.all(selected.map(runPersona));

// --- Print ---
for (const r of results) {
  if (!values.quiet) {
    console.log(`\n${"=".repeat(70)}\n${r.persona.toUpperCase()}  (ended: ${r.stop}, ${r.giverTurns} giver turns)\n${"=".repeat(70)}`);
    console.log(renderTranscript(r.transcript));
  }
  console.log(`\n-- ${r.persona} grader notes: ${r.grade.interviewer.notes}`);
}

console.log("\nSUMMARY");
console.table(
  results.map((r) => ({
    persona: r.persona,
    ended: r.stop,
    turns: r.giverTurns,
    items: r.grade.items.length,
    usable: r.scored.usableItems,
    unfaithful: r.scored.unfaithfulItems,
    truth: `${r.grade.truth_surfaced}/${PERSONAS.find((p) => p.id === r.persona)!.truth.length}`,
    leading: r.grade.interviewer.leading_questions,
    multiQ: r.grade.interviewer.multi_question_turns,
    nonNeutral: r.grade.interviewer.non_neutral_turns,
    expected: r.scored.expectedBehaviourMet === null ? "-" : r.scored.expectedBehaviourMet ? "PASS" : "FAIL",
  })),
);
console.log(`Tokens: ${usage.inputTokens} in / ${usage.outputTokens} out`);

// --- Save ---
const promptHash = createHash("sha256")
  .update(buildSystemPrompt({ agenda: buildAgenda(RECEIVER), relationship: "direct_report", frequency: "daily", hrRoute: "x" }))
  .digest("hex")
  .slice(0, 12);
mkdirSync("evals/runs", { recursive: true });
const path = `evals/runs/${startedAt.toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(
  path,
  JSON.stringify({ startedAt, config, promptHash, personas: selected.map((p) => p.id), usage, results }, null, 2),
  { flag: "wx" },
);
console.log(`Saved ${path}`);
