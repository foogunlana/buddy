import { describe, expect, it } from "vitest";
import { buildAgenda } from "../agenda.js";
import type { StructuredLLM } from "../llm.js";
import type { Relationship } from "../types.js";
import { anonymiseItems } from "./anonymise.js";
import { extractItems, specificity } from "./extract.js";
import { assemble, synthesiseReport, type PooledItem } from "./synthesise.js";
import { releaseDecision } from "./threshold.js";

const agenda = buildAgenda("Alex", [
  { id: "q1", source: "receiver_objective", title: "1:1s", description: "Are my 1:1s useful?" },
  { id: "a1", source: "committed_action", title: "Dates", description: "Give dates with a range" },
]);

const givers = (direct: number, nonDirect: number) => [
  ...Array.from({ length: direct }, (_, n) => ({ giverId: `d${n}`, relationship: "direct_report" as Relationship })),
  ...Array.from({ length: nonDirect }, (_, n) => ({ giverId: `n${n}`, relationship: "non_direct" as Relationship })),
];

function item(id: string, giverId: string, overrides: Partial<PooledItem> = {}): PooledItem {
  return {
    id,
    giverId,
    relationship: giverId.startsWith("d") ? "direct_report" : "non_direct",
    polarity: "change",
    agendaItemId: null,
    theme: "Deadlines",
    behaviour: "Says 'soon' when asked for dates",
    example: "A feature slipped two weeks",
    impact: "Client found out first",
    ask: "Give a date with a range",
    recurrence: "pattern",
    specificity: 3,
    approved: true,
    ...overrides,
  };
}

const fakeLLM = (response: unknown): StructuredLLM & { inputs: string[] } => {
  const inputs: string[] = [];
  const fn = (async (req: { input: string }) => {
    inputs.push(req.input);
    return response;
  }) as unknown as StructuredLLM & { inputs: string[] };
  fn.inputs = inputs;
  return fn;
};

describe("releaseDecision", () => {
  it("holds below the floor", () => {
    expect(releaseDecision(givers(2, 0))).toMatchObject({ release: false, totalGivers: 2 });
  });
  it("counts unique givers, not items", () => {
    expect(releaseDecision([...givers(2, 0), ...givers(2, 0)]).release).toBe(false);
  });
  it("releases without the split when one group is small", () => {
    expect(releaseDecision(givers(2, 5))).toMatchObject({ release: true, splitByRelationship: false });
    expect(releaseDecision(givers(5, 1))).toMatchObject({ release: true, splitByRelationship: false });
  });
  it("shows the split when both groups clear the floor", () => {
    expect(releaseDecision(givers(3, 3))).toMatchObject({ release: true, splitByRelationship: true });
  });
});

describe("specificity", () => {
  it("scores 0–3 from which parts are present", () => {
    expect(specificity({ behaviour: null, example: "x", ask: "x" })).toBe(0);
    expect(specificity({ behaviour: "b", example: null, ask: "a" })).toBe(1);
    expect(specificity({ behaviour: "b", example: "e", ask: null })).toBe(2);
    expect(specificity({ behaviour: "b", example: "e", ask: "a" })).toBe(3);
  });
});

describe("extractItems", () => {
  it("assigns ids, computes specificity, drops unknown agenda ids, starts unapproved", async () => {
    const llm = fakeLLM({
      items: [
        { polarity: "change", agendaItemId: "made_up", theme: "t", behaviour: "b", example: null, impact: null, ask: null, recurrence: "unknown" },
        { polarity: "keep", agendaItemId: "q1", theme: "t", behaviour: "b", example: "e", impact: "i", ask: "a", recurrence: "pattern" },
      ],
    });
    const items = await extractItems(llm, agenda, [{ role: "giver", text: "hi", at: "" }], "c1");
    expect(items.map((i) => [i.id, i.agendaItemId, i.specificity, i.approved])).toEqual([
      ["c1-1", null, 1, false],
      ["c1-2", "q1", 3, false],
    ]);
  });
});

describe("anonymiseItems", () => {
  it("never fills a field the giver left empty, and fails if an item is dropped", async () => {
    const base = item("i1", "d0", { example: null });
    const llm = fakeLLM({ items: [{ id: "i1", theme: "T", behaviour: "B", example: "invented", impact: "I", ask: "A" }] });
    const [out] = await anonymiseItems(llm, [base]);
    expect(out).toMatchObject({ theme: "T", behaviour: "B", example: null });
    await expect(anonymiseItems(fakeLLM({ items: [] }), [base])).rejects.toThrow(/dropped/);
  });
});

describe("synthesiseReport", () => {
  it("holds without calling the model when below the floor", async () => {
    const llm = fakeLLM({});
    const result = await synthesiseReport(llm, agenda, [item("a", "d0"), item("b", "d1")]);
    expect(result.status).toBe("held");
    expect(llm.inputs).toHaveLength(0);
  });

  it("ignores unapproved items for the floor", async () => {
    const result = await synthesiseReport(fakeLLM({}), agenda, [
      item("a", "d0"),
      item("b", "d1"),
      item("c", "d2", { approved: false }),
    ]);
    expect(result.status).toBe("held");
  });

  it("pseudonymises givers in the model input", async () => {
    const llm = fakeLLM({ summary: "", themes: [], answers: [] });
    await synthesiseReport(llm, agenda, [item("a", "real-id-1"), item("b", "real-id-2"), item("c", "real-id-3")]);
    expect(llm.inputs[0]).not.toContain("real-id");
    expect(llm.inputs[0]).toContain('"giver":"G1"');
  });
});

describe("assemble", () => {
  const items = [
    item("a", "d0"),
    item("b", "d1"),
    item("c", "d0"), // same giver twice
    item("k", "n0", { polarity: "keep", theme: "1:1s", agendaItemId: "q1" }),
  ];
  const draft = {
    summary: "s",
    themes: [
      { title: "Deadlines", polarity: "change" as const, itemIds: ["a", "b", "c", "ghost"], whyItMattered: "w", asks: ["x"], examples: ["e1", "e2", "e3"] },
      { title: "1:1s", polarity: "keep" as const, itemIds: ["k"], whyItMattered: "w", asks: [], examples: ["only one voice"] },
      { title: "Orphan", polarity: "change" as const, itemIds: ["ghost"], whyItMattered: "w", asks: [], examples: [] },
      { title: "Wrong polarity", polarity: "keep" as const, itemIds: ["a"], whyItMattered: "w", asks: [], examples: [] },
    ],
    answers: [{ agendaItemId: "q1", answer: "Yes, useful", itemIds: ["k"], confidence: "high" as const }],
  };
  const report = assemble(agenda, items, draft, false, 3);

  it("counts givers from cited items and drops orphan or mismatched themes", () => {
    expect(report.change.map((t) => [t.title, t.givers])).toEqual([["Deadlines", 2]]);
    expect(report.keepDoing.map((t) => [t.title, t.givers])).toEqual([["1:1s", 1]]);
  });

  it("hides the relationship split when not allowed", () => {
    expect(report.change[0]).toMatchObject({ directReports: null, nonDirect: null });
  });

  it("shows examples only for themes with 2+ givers, at most 2", () => {
    expect(report.change[0]!.examples).toEqual(["e1", "e2"]);
    expect(report.keepDoing[0]!.examples).toEqual([]);
  });

  it("caps confidence when few voices answer a question", () => {
    expect(report.questionsAnswered).toEqual([
      { agendaItemId: "q1", question: "Are my 1:1s useful?", answer: "Yes, useful", voices: 1, confidence: "low" },
    ]);
  });

  it("reports unanswered committed actions and gaps", () => {
    expect(report.sinceLastTime).toEqual([
      { agendaItemId: "a1", action: "Give dates with a range", progress: "Not enough feedback spoke to this.", voices: 0 },
    ]);
    expect(report.gaps.map((g) => g.agendaItemId)).toContain("trust_morale");
    expect(report.gaps.map((g) => g.agendaItemId)).toContain("q1");
  });

  it("splits by relationship when allowed", () => {
    const r = assemble(agenda, items, draft, true, 3);
    expect(r.change[0]).toMatchObject({ directReports: 2, nonDirect: 0 });
  });
});
