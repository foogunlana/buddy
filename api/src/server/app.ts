import { zValidator } from "@hono/zod-validator";
import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { z } from "zod";
import { buildAgenda } from "../core/agenda.js";
import { Interviewer } from "../core/interviewer/interviewer.js";
import type { TurnModel } from "../core/interviewer/model.js";
import type { InterviewContext } from "../core/interviewer/prompt.js";
import type { StopReason } from "../core/interviewer/state.js";
import type { DB } from "../db/client.js";
import * as t from "../db/schema.js";

export interface Deps {
  db: DB;
  model: TurnModel;
  now?: () => number;
}

const Params = z.object({ assignmentId: z.uuid() });
const Reply = z.object({ text: z.string().trim().min(1).max(4000) });

// What the giver's browser sees. Never includes the interviewer's internal state.
export interface ChatView {
  receiverName: string;
  status: "active" | "ended";
  stopReason: StopReason | null;
  messages: { role: "interviewer" | "giver"; text: string }[];
}

export function createApp({ db, model, now = Date.now }: Deps) {
  const receiver = alias(t.person, "receiver");

  async function loadContext(assignmentId: string): Promise<InterviewContext | null> {
    const [row] = await db
      .select({ a: t.assignment, receiverName: receiver.name, hrRoute: t.programme.hrRoute })
      .from(t.assignment)
      .innerJoin(receiver, eq(receiver.id, t.assignment.receiverId))
      .innerJoin(t.programme, eq(t.programme.id, t.assignment.programmeId))
      .where(eq(t.assignment.id, assignmentId));
    if (!row) return null;
    const extras = await db
      .select()
      .from(t.agendaItem)
      .where(and(eq(t.agendaItem.programmeId, row.a.programmeId), eq(t.agendaItem.receiverId, row.a.receiverId)));
    return {
      agenda: buildAgenda(
        row.receiverName,
        extras.map((e) => ({ id: e.key, source: e.source, title: e.title, description: e.description })),
      ),
      relationship: row.a.relationship,
      frequency: row.a.frequency,
      hrRoute: row.hrRoute,
    };
  }

  async function loadConversation(assignmentId: string) {
    const [conv] = await db.select().from(t.conversation).where(eq(t.conversation.assignmentId, assignmentId));
    if (!conv) return null;
    const messages = await db
      .select()
      .from(t.message)
      .where(eq(t.message.conversationId, conv.id))
      .orderBy(asc(t.message.seq));
    return { conv, messages };
  }

  function view(ctx: InterviewContext, loaded: NonNullable<Awaited<ReturnType<typeof loadConversation>>>): ChatView {
    return {
      receiverName: ctx.agenda.receiverName,
      status: loaded.conv.status,
      stopReason: (loaded.conv.stopReason as StopReason | null) ?? null,
      messages: loaded.messages.map((m) => ({ role: m.role, text: m.text })),
    };
  }

  const app = new Hono()
    .basePath("/api")
    // Open (or resume) the chat. Starts the conversation with the opening message on first visit.
    .get("/chat/:assignmentId", zValidator("param", Params), async (c) => {
      const { assignmentId } = c.req.valid("param");
      const ctx = await loadContext(assignmentId);
      if (!ctx) return c.json({ error: "This feedback link isn't valid." }, 404);

      let loaded = await loadConversation(assignmentId);
      if (!loaded) {
        const startedAt = now();
        const opening = new Interviewer(ctx, model, undefined, () => startedAt).start();
        await db.transaction(async (tx) => {
          const [conv] = await tx
            .insert(t.conversation)
            .values({ assignmentId, startedAt: new Date(startedAt) })
            .onConflictDoNothing()
            .returning();
          if (conv) await tx.insert(t.message).values({ conversationId: conv.id, seq: 0, role: "interviewer", text: opening });
        });
        loaded = (await loadConversation(assignmentId))!;
      }
      return c.json(view(ctx, loaded));
    })
    // Send the giver's message; returns the updated chat.
    .post("/chat/:assignmentId/messages", zValidator("param", Params), zValidator("json", Reply), async (c) => {
      const { assignmentId } = c.req.valid("param");
      const { text } = c.req.valid("json");
      const ctx = await loadContext(assignmentId);
      if (!ctx) return c.json({ error: "This feedback link isn't valid." }, 404);
      const loaded = await loadConversation(assignmentId);
      if (!loaded) return c.json({ error: "Open the chat before replying." }, 409);
      if (loaded.conv.status === "ended") return c.json({ error: "This conversation has ended." }, 409);

      const iv = Interviewer.resume(
        ctx,
        model,
        {
          transcript: loaded.messages.map((m) => ({ role: m.role, text: m.text, at: m.at.toISOString() })),
          startedAt: loaded.conv.startedAt.getTime(),
          stop: null,
          lastState: loaded.conv.state ?? null,
        },
        undefined,
        now,
      );

      let result;
      try {
        result = await iv.reply(text);
      } catch (err) {
        console.error("Interviewer turn failed:", err);
        return c.json({ error: "The interviewer couldn't respond. Please send your message again." }, 502);
      }

      const seq = loaded.messages.length;
      try {
        await db.transaction(async (tx) => {
          await tx.insert(t.message).values([
            { conversationId: loaded.conv.id, seq, role: "giver", text },
            { conversationId: loaded.conv.id, seq: seq + 1, role: "interviewer", text: result.reply },
          ]);
          await tx
            .update(t.conversation)
            .set({
              state: result.state,
              ...(result.stop ? { status: "ended", stopReason: result.stop, endedAt: new Date(now()) } : {}),
            })
            .where(eq(t.conversation.id, loaded.conv.id));
        });
      } catch {
        // Unique (conversation, seq) violation: another reply landed first (e.g. a double submit).
        return c.json({ error: "That message was already sent." }, 409);
      }
      return c.json(view(ctx, (await loadConversation(assignmentId))!));
    });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
