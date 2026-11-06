// Chat with the interviewer in the terminal.
//   npm run chat -- --name Alex --relationship direct_report --frequency daily
// Needs OPENAI_API_KEY (default) or ANTHROPIC_API_KEY with --provider claude,
// in the environment or in api/.env (gitignored). Set OPENAI_MODEL to override the model.
// Transcripts are saved to api/transcripts/ (gitignored).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { buildAgenda } from "../core/agenda.js";
import { Interviewer } from "../core/interviewer/interviewer.js";
import { claudeTurnModel, openaiTurnModel } from "../core/interviewer/model.js";
import { InteractionFrequency, Relationship } from "../core/types.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const { values } = parseArgs({
  options: {
    name: { type: "string", default: "Alex" },
    relationship: { type: "string", default: "direct_report" },
    frequency: { type: "string", default: "daily" },
    provider: { type: "string", default: "openai" },
    model: { type: "string" },
    debug: { type: "boolean", default: false },
  },
});

const agenda = buildAgenda(values.name, [
  {
    id: "q_deadlines",
    source: "admin_question",
    title: "Deadline communication",
    description: "Has the way they communicate delivery dates and deadlines improved recently?",
  },
]);

const interviewer = new Interviewer(
  {
    agenda,
    relationship: Relationship.parse(values.relationship),
    frequency: InteractionFrequency.parse(values.frequency),
    hrRoute: "your People & Culture lead or the formal grievance process",
  },
  values.provider === "claude"
    ? await claudeTurnModel({ model: values.model })
    : await openaiTurnModel({ model: values.model }),
);

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log(`\nbuddy: ${interviewer.start()}\n`);

try {
  while (!interviewer.stopReason) {
    const text = (await rl.question("you: ")).trim();
    if (!text) continue;
    if (text === "/quit") break;
    const { reply, state, stop } = await interviewer.reply(text);
    console.log(`\nbuddy: ${reply}\n`);
    if (values.debug) console.log(JSON.stringify({ ...state, reply: undefined }, null, 2), "\n");
    if (stop) console.log(`[ended: ${stop}]`);
  }
} finally {
  rl.close();
  mkdirSync("transcripts", { recursive: true });
  const path = `transcripts/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(
    path,
    JSON.stringify(
      { agenda, stop: interviewer.stopReason, finalState: interviewer.lastState, transcript: interviewer.transcript },
      null,
      2,
    ),
  );
  console.log(`Saved ${path}`);
}
