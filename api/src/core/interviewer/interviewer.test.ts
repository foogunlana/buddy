import { describe, expect, it } from "vitest";
import { buildAgenda, DEFAULT_DIMENSIONS } from "../agenda.js";
import { Interviewer } from "./interviewer.js";
import type { TurnModel } from "./model.js";
import { buildSystemPrompt, type InterviewContext } from "./prompt.js";
import { activeMs, agendaCoverage, stopReason, type TurnOutput } from "./state.js";

const ctx: InterviewContext = {
  agenda: buildAgenda("Alex", [
    { id: "q1", source: "receiver_objective", title: "1:1s", description: "Are their 1:1s useful?" },
  ]),
  relationship: "direct_report",
  frequency: "daily",
  hrRoute: "HR",
};

function turn(overrides: Partial<TurnOutput> = {}): TurnOutput {
  return {
    reply: "What did that look like?",
    comments: [],
    agenda: [],
    identifying_detail: false,
    misconduct: false,
    done: false,
    ...overrides,
  };
}

function scripted(outputs: TurnOutput[]): TurnModel & { calls: Parameters<TurnModel>[] } {
  const calls: Parameters<TurnModel>[] = [];
  const fn = (async (...args: Parameters<TurnModel>) => {
    calls.push(args);
    const next = outputs.shift();
    if (!next) throw new Error("no more scripted outputs");
    return next;
  }) as TurnModel & { calls: Parameters<TurnModel>[] };
  fn.calls = calls;
  return fn;
}

describe("buildAgenda", () => {
  it("includes the six default dimensions plus extras", () => {
    expect(ctx.agenda.items).toHaveLength(DEFAULT_DIMENSIONS.length + 1);
  });

  it("rejects duplicate ids", () => {
    expect(() => buildAgenda("Alex", [{ ...DEFAULT_DIMENSIONS[0]! }])).toThrow(/Duplicate/);
  });
});

describe("buildSystemPrompt", () => {
  it("lists every agenda item id and the relationship", () => {
    const prompt = buildSystemPrompt(ctx);
    for (const item of ctx.agenda.items) expect(prompt).toContain(`[${item.id}]`);
    expect(prompt).toContain("reports directly to Alex");
  });
});

describe("stopReason", () => {
  it("misconduct wins over done", () => {
    expect(stopReason(turn({ misconduct: true, done: true }), 1, 0)).toBe("misconduct");
  });

  it("stops on turn and time limits", () => {
    const limits = { maxGiverTurns: 3, maxDurationMs: 1000 };
    expect(stopReason(turn(), 2, 0, limits)).toBeNull();
    expect(stopReason(turn(), 3, 0, limits)).toBe("turn_limit");
    expect(stopReason(turn(), 1, 1000, limits)).toBe("time_limit");
  });
});

describe("activeMs", () => {
  it("sums gaps, capping each one", () => {
    expect(activeMs([0, 60_000, 60_000 + 10 * 60_000, 60_000 + 10 * 60_000 + 30_000], 180_000)).toBe(60_000 + 180_000 + 30_000);
    expect(activeMs([5])).toBe(0);
  });
});

describe("agendaCoverage", () => {
  it("treats missing ids as open and ignores unknown ids", () => {
    const coverage = agendaCoverage(
      ctx.agenda,
      turn({
        agenda: [
          { id: "q1", status: "covered" },
          { id: "made_up", status: "covered" },
        ],
      }),
    );
    expect(coverage.q1).toBe("covered");
    expect(coverage.trust_morale).toBe("open");
    expect(coverage).not.toHaveProperty("made_up");
  });
});

describe("Interviewer", () => {
  it("opens with a privacy line and the first free-recall question", () => {
    const iv = new Interviewer(ctx, scripted([]));
    const opening = iv.start();
    expect(opening).toMatch(/confidential/);
    expect(opening).toMatch(/keep doing/);
  });

  it("sends the transcript as alternating messages, starting with a user placeholder", async () => {
    const model = scripted([turn({ reply: "What's one thing they could do differently?" })]);
    const iv = new Interviewer(ctx, model);
    iv.start();
    await iv.reply("They run great planning meetings.");

    const [, messages] = model.calls[0]!;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(iv.transcript.map((t) => t.role)).toEqual(["interviewer", "giver", "interviewer"]);
  });

  it("replaces the reply with the HR route on misconduct and ends", async () => {
    const iv = new Interviewer(ctx, scripted([turn({ misconduct: true, reply: "Tell me more?" })]));
    iv.start();
    const result = await iv.reply("Something happened that I think is harassment.");
    expect(result.stop).toBe("misconduct");
    expect(result.reply).toContain("HR");
    expect(result.reply).not.toContain("Tell me more");
    await expect(iv.reply("more")).rejects.toThrow(/ended/);
  });

  it("closes with the limit message when the turn cap is hit", async () => {
    const iv = new Interviewer(ctx, scripted([turn(), turn()]), { maxGiverTurns: 2, maxDurationMs: 1e9 });
    iv.start();
    expect((await iv.reply("a")).stop).toBeNull();
    const last = await iv.reply("b");
    expect(last.stop).toBe("turn_limit");
    expect(last.reply).toMatch(/summary of what will be shared/);
  });

  it("closes with the time limit on active time", async () => {
    let t = 0;
    const iv = new Interviewer(ctx, scripted([turn(), turn()]), { maxGiverTurns: 99, maxDurationMs: 200_000 }, () => t);
    iv.start();
    t = 120_000;
    expect((await iv.reply("a")).stop).toBeNull();
    t = 240_000;
    expect((await iv.reply("b")).stop).toBe("time_limit");
  });

  it("doesn't count a long pause against the time limit", async () => {
    let t = 0;
    const iv = new Interviewer(ctx, scripted([turn()]), { maxGiverTurns: 99, maxDurationMs: 600_000 }, () => t);
    iv.start();
    t = 5 * 60 * 60 * 1000; // came back five hours later
    expect((await iv.reply("a")).stop).toBeNull();
  });

  it("uses the model's own closing line when it says done", async () => {
    const iv = new Interviewer(ctx, scripted([turn({ done: true, reply: "Thanks, that's everything." })]));
    iv.start();
    const result = await iv.reply("Nothing else.");
    expect(result).toMatchObject({ stop: "complete", reply: "Thanks, that's everything." });
  });
});
