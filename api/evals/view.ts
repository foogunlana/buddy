// Render a saved pipeline report as an HTML page you can open in a browser.
//   npm run view -- evals/reports/<report>.json
// Writes evals/reports/<report>.html next to it. No API calls.
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseDecision } from "../src/core/pipeline/threshold.js";
import { RECEIVER } from "./personas.js";

const reportPath = process.argv[2];
if (!reportPath) throw new Error("Usage: npm run view -- evals/reports/<report>.json");

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const run = JSON.parse(readFileSync(report.run, "utf8"));

type Giver = { persona: string; relationship: "direct_report" | "non_direct"; raw: unknown[] };
const givers = (report.perGiver as Giver[]).filter((g) => g.raw.length > 0);
const decision = releaseDecision(givers.map((g) => ({ giverId: g.persona, relationship: g.relationship })), report.floor);
const direct = givers.filter((g) => g.relationship === "direct_report").length;

const data = {
  receiver: RECEIVER,
  runName: basename(report.run, ".json"),
  floor: report.floor,
  usage: report.usage,
  perGiver: report.perGiver,
  result: report.result,
  decision: {
    totalGivers: givers.length,
    direct,
    nonDirect: givers.length - direct,
    split: decision.release ? decision.splitByRelationship : false,
  },
  conversations: run.results.map((r: { persona: string; stop: string; transcript: unknown[] }) => ({
    persona: r.persona,
    stop: r.stop,
    transcript: r.transcript,
  })),
};

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(join(here, "view-template.html"), "utf8");
// Escape "<" so transcript text can't close the <script> tag.
const html = template.replace("/*__DATA__*/", () => JSON.stringify(data).replace(/</g, "\\u003c"));
const out = reportPath.replace(/\.json$/, ".html");
writeFileSync(out, html);
console.log(`Wrote ${out}`);
