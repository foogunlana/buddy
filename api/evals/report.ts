// Run the M2 pipeline on a saved eval run: each persona's conversation is one giver.
//   npm run report -- evals/runs/<run>.json [--floor 3]
// Extract → (auto-approve, standing in for the giver's share preview) → anonymise → synthesise.
// Writes the report and intermediate items to evals/reports/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { buildAgenda } from "../src/core/agenda.js";
import type { TranscriptTurn } from "../src/core/interviewer/interviewer.js";
import type { Usage } from "../src/core/interviewer/model.js";
import { openaiStructured } from "../src/core/llm.js";
import { anonymiseItems } from "../src/core/pipeline/anonymise.js";
import { extractItems } from "../src/core/pipeline/extract.js";
import { synthesiseReport, type PooledItem } from "../src/core/pipeline/synthesise.js";
import type { Report } from "../src/core/types.js";
import { PERSONAS, RECEIVER } from "./personas.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { floor: { type: "string", default: "3" } },
});
const runPath = positionals[0];
if (!runPath) throw new Error("Usage: npm run report -- evals/runs/<run>.json");

const run = JSON.parse(readFileSync(runPath, "utf8")) as {
  results: { persona: string; transcript: TranscriptTurn[] }[];
};
const usage: Usage = { inputTokens: 0, outputTokens: 0 };
const llm = await openaiStructured({
  onUsage: (u) => {
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
  },
});
const agenda = buildAgenda(RECEIVER);

console.log(`Extracting and anonymising ${run.results.length} conversation(s)...`);
const perGiver = await Promise.all(
  run.results.map(async (r, n) => {
    const persona = PERSONAS.find((p) => p.id === r.persona);
    if (!persona) throw new Error(`Unknown persona ${r.persona}`);
    const raw = await extractItems(llm, agenda, r.transcript, `c${n + 1}`);
    const approved = raw.map((i) => ({ ...i, approved: true }));
    const anon = await anonymiseItems(llm, approved);
    console.log(`  ${r.persona}: ${raw.length} item(s)`);
    return { persona: r.persona, raw, anon, relationship: persona.relationship };
  }),
);

const pooled: PooledItem[] = perGiver.flatMap((g) =>
  g.anon.map((i) => ({ ...i, giverId: g.persona, relationship: g.relationship })),
);
console.log("Synthesising...");
const result = await synthesiseReport(llm, agenda, pooled, Number(values.floor));

if (result.status === "held") {
  console.log(`\nReport HELD: ${result.reason}`);
} else {
  printReport(result.report);
}
console.log(`\nTokens: ${usage.inputTokens} in / ${usage.outputTokens} out`);

mkdirSync("evals/reports", { recursive: true });
const out = `evals/reports/${basename(runPath, ".json")}-report-${Date.now()}.json`;
writeFileSync(out, JSON.stringify({ run: runPath, floor: Number(values.floor), perGiver, result, usage }, null, 2), {
  flag: "wx",
});
console.log(`Saved ${out}`);

function printReport(r: Report) {
  const line = "-".repeat(70);
  console.log(`\n${line}\n360 FEEDBACK: ${r.receiverName}   (${r.totalGivers} people)\n${line}`);
  if (r.questionsAnswered.length) {
    console.log("\nYOUR QUESTIONS");
    for (const q of r.questionsAnswered) console.log(`- ${q.question}\n  ${q.answer} [${q.voices} voices, ${q.confidence}]`);
  }
  console.log(`\nSUMMARY\n${r.summary}`);
  const themes = (title: string, list: Report["keepDoing"]) => {
    console.log(`\n${title}`);
    for (const t of list) {
      const split = t.directReports === null ? "" : ` (${t.directReports} direct, ${t.nonDirect} other)`;
      console.log(`- ${t.title}: ${t.givers} of ${r.totalGivers}${split}${t.givers === 1 ? " [one voice]" : ""}`);
      console.log(`  Why it mattered: ${t.whyItMattered}`);
      for (const e of t.examples) console.log(`  e.g. ${e}`);
      for (const a of t.asks) console.log(`  Ask: ${a}`);
    }
  };
  themes("KEEP DOING", r.keepDoing);
  themes("CHANGE", r.change);
  if (r.sinceLastTime.length) {
    console.log("\nSINCE LAST TIME");
    for (const s of r.sinceLastTime) console.log(`- ${s.action}: ${s.progress} [${s.voices} voices]`);
  }
  console.log(`\nWHAT WE COULDN'T FIND OUT (fewer than ${values.floor} voices)`);
  console.log(r.gaps.map((g) => `${g.title} (${g.voices})`).join(", ") || "nothing");
}
