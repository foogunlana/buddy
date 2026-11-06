import { beforeEach, describe, expect, it } from "vitest";
import type { TurnModel } from "../core/interviewer/model.js";
import type { TurnOutput } from "../core/interviewer/state.js";
import { testDb, type DB } from "../db/client.js";
import { seedDemo } from "../db/seed.js";
import { createApp, type ChatView } from "./app.js";

function turn(overrides: Partial<TurnOutput> = {}): TurnOutput {
  return { reply: "When did that last happen?", comments: [], agenda: [], identifying_detail: false, misconduct: false, done: false, ...overrides };
}

let db: DB;
let assignmentId: string;
let outputs: (TurnOutput | Error)[];
let seenMessages: number[];
const model: TurnModel = async (_system, messages) => {
  seenMessages.push(messages.length);
  const next = outputs.shift();
  if (!next) throw new Error("no scripted output");
  if (next instanceof Error) throw next;
  return next;
};

beforeEach(async () => {
  db = await testDb();
  assignmentId = await seedDemo(db);
  outputs = [];
  seenMessages = [];
});

const app = () => createApp({ db, model });
const get = (id = assignmentId) => app().request(`/api/chat/${id}`);
const send = (text: string, a = app()) =>
  a.request(`/api/chat/${assignmentId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

describe("chat API", () => {
  it("starts the conversation with the opening message, once", async () => {
    const first = (await (await get()).json()) as ChatView;
    expect(first.receiverName).toBe("Alex");
    expect(first.status).toBe("active");
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0]!.text).toMatch(/confidential/);
    const again = (await (await get()).json()) as ChatView;
    expect(again.messages).toHaveLength(1);
  });

  it("rejects unknown and malformed links", async () => {
    expect((await get("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await get("not-a-uuid")).status).toBe(400);
  });

  it("stores each turn and resumes from the database on the next request", async () => {
    await get();
    outputs.push(turn({ reply: "What's one thing they could do differently?" }), turn({ reply: "When was the last time?" }));
    const r1 = (await (await send("Great 1:1s")).json()) as ChatView;
    expect(r1.messages.map((m) => m.role)).toEqual(["interviewer", "giver", "interviewer"]);
    // A fresh app instance must rebuild the conversation from storage.
    const r2 = (await (await send("Deadlines slip", app())).json()) as ChatView;
    expect(r2.messages).toHaveLength(5);
    expect(r2.messages.at(-1)!.text).toBe("When was the last time?");
    // Model saw: placeholder + opening + giver (3), then placeholder + 4 messages (5).
    expect(seenMessages).toEqual([3, 5]);
  });

  it("ends the conversation and refuses further messages", async () => {
    await get();
    outputs.push(turn({ done: true, reply: "Thanks, that's everything." }));
    const r = (await (await send("Nothing else")).json()) as ChatView;
    expect(r).toMatchObject({ status: "ended", stopReason: "complete" });
    expect((await send("one more")).status).toBe(409);
  });

  it("routes misconduct to HR and ends", async () => {
    await get();
    outputs.push(turn({ misconduct: true }));
    const r = (await (await send("Something serious happened")).json()) as ChatView;
    expect(r.stopReason).toBe("misconduct");
    expect(r.messages.at(-1)!.text).toContain("People & Culture");
  });

  it("saves nothing when the model fails, so the giver can resend", async () => {
    await get();
    outputs.push(new Error("upstream down"), turn());
    const failed = await send("hello");
    expect(failed.status).toBe(502);
    const view = (await (await get()).json()) as ChatView;
    expect(view.messages).toHaveLength(1);
    expect((await send("hello")).status).toBe(200);
  });

  it("rejects empty messages and replies before the chat is opened", async () => {
    expect((await send("hi")).status).toBe(409);
    await get();
    expect((await send("   ")).status).toBe(400);
  });

  it("never returns the interviewer's internal state", async () => {
    await get();
    outputs.push(turn({ comments: [{ summary: "secret", polarity: "keep", behaviour: true, example: false, impact: false, ask: false, probes: 0 }] }));
    const body = await (await send("hi")).text();
    expect(body).not.toContain("secret");
    expect(body).not.toContain("comments");
  });
});
