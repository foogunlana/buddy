import type { ChatMessage, TurnModel } from "./model.js";
import { buildSystemPrompt, openingMessage, type InterviewContext } from "./prompt.js";
import {
  DEFAULT_LIMITS,
  LIMIT_MESSAGE,
  misconductMessage,
  stopReason,
  type Limits,
  type StopReason,
  type TurnOutput,
} from "./state.js";

export interface TranscriptTurn {
  role: "interviewer" | "giver";
  text: string;
  at: string; // ISO timestamp
}

export interface TurnResult {
  reply: string;
  state: TurnOutput;
  stop: StopReason | null;
}

// Placeholder user turn so the API conversation can start with the interviewer's opening.
const CHAT_OPENED = "[The giver has opened the chat.]";

export class Interviewer {
  readonly transcript: TranscriptTurn[] = [];
  private readonly system: string;
  private startedAt: number | null = null;
  private giverTurns = 0;
  private stopped: StopReason | null = null;
  lastState: TurnOutput | null = null;

  constructor(
    private readonly ctx: InterviewContext,
    private readonly model: TurnModel,
    private readonly limits: Limits = DEFAULT_LIMITS,
    private readonly now: () => number = Date.now,
  ) {
    this.system = buildSystemPrompt(ctx);
  }

  // Rebuild an in-progress interview from storage (the API is stateless between requests).
  static resume(
    ctx: InterviewContext,
    model: TurnModel,
    saved: { transcript: TranscriptTurn[]; startedAt: number; stop: StopReason | null; lastState: TurnOutput | null },
    limits: Limits = DEFAULT_LIMITS,
    now: () => number = Date.now,
  ): Interviewer {
    const iv = new Interviewer(ctx, model, limits, now);
    iv.transcript.push(...saved.transcript);
    iv.startedAt = saved.startedAt;
    iv.giverTurns = saved.transcript.filter((t) => t.role === "giver").length;
    iv.stopped = saved.stop;
    iv.lastState = saved.lastState;
    return iv;
  }

  get stopReason(): StopReason | null {
    return this.stopped;
  }

  start(): string {
    if (this.startedAt !== null) throw new Error("Interview already started");
    this.startedAt = this.now();
    const text = openingMessage(this.ctx);
    this.push("interviewer", text);
    return text;
  }

  async reply(giverText: string): Promise<TurnResult> {
    if (this.startedAt === null) throw new Error("Call start() first");
    if (this.stopped) throw new Error(`Interview has ended (${this.stopped})`);

    this.push("giver", giverText);
    this.giverTurns += 1;

    const state = await this.model(this.system, this.messages());
    this.lastState = state;
    const stop = stopReason(state, this.giverTurns, this.now() - this.startedAt, this.limits);

    let reply = state.reply;
    if (stop === "misconduct") reply = misconductMessage(this.ctx.hrRoute);
    else if (stop === "turn_limit" || stop === "time_limit") reply = LIMIT_MESSAGE;

    this.push("interviewer", reply);
    this.stopped = stop;
    return { reply, state, stop };
  }

  // Transcript as chat messages. The first user turn is a placeholder.
  messages(): ChatMessage[] {
    const out: ChatMessage[] = [{ role: "user", content: CHAT_OPENED }];
    for (const turn of this.transcript) {
      out.push({ role: turn.role === "interviewer" ? "assistant" : "user", content: turn.text });
    }
    return out;
  }

  private push(role: TranscriptTurn["role"], text: string) {
    this.transcript.push({ role, text, at: new Date(this.now()).toISOString() });
  }
}
