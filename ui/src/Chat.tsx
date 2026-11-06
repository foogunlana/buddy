import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { openChat, sendMessage, type ChatView } from "./api";

const ENDED_COPY: Record<string, string> = {
  complete: "That's everything. Next you'll review exactly what will be shared before it's pooled.",
  turn_limit: "We've reached the end of the time. Next you'll review exactly what will be shared before it's pooled.",
  time_limit: "We've reached the end of the time. Next you'll review exactly what will be shared before it's pooled.",
  misconduct: "This conversation has stopped. Nothing from it will go into the report.",
};

export function Chat({ assignmentId }: { assignmentId: string }) {
  const [chat, setChat] = useState<ChatView | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    openChat(assignmentId).then(setChat, (e: Error) => setError(e.message));
  }, [assignmentId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat?.messages.length, sending]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    // Show the giver's message straight away; the server's copy replaces it.
    setChat((c) => c && { ...c, messages: [...c.messages, { role: "giver", text }] });
    setDraft("");
    try {
      setChat(await sendMessage(assignmentId, text));
    } catch (err) {
      // Nothing was saved: take the optimistic message back and restore the draft.
      setChat((c) => c && { ...c, messages: c.messages.slice(0, -1) });
      setDraft(text);
      setError((err as Error).message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  if (!chat) {
    return (
      <main className="page">
        {error ? <p className="notice error">{error}</p> : <p className="muted">Opening your conversation…</p>}
      </main>
    );
  }

  const ended = chat.status === "ended";
  return (
    <main className="page chat">
      <header className="chat-head">
        <span className="eyebrow">Confidential feedback</span>
        <h1>Working with {chat.receiverName}</h1>
        <p className="muted">
          {chat.receiverName} only sees themes pooled from several people, reworded so they can't be traced to you.
        </p>
      </header>

      <ol className="messages" aria-live="polite">
        {chat.messages.map((m, i) => (
          <li key={i} className={`msg ${m.role}`}>
            <span className="sr-only">{m.role === "giver" ? "You" : "Interviewer"}: </span>
            {m.text}
          </li>
        ))}
        {sending && (
          <li className="msg interviewer thinking" aria-label="Interviewer is thinking">
            <span />
            <span />
            <span />
          </li>
        )}
      </ol>
      <div ref={endRef} />

      {ended ? (
        <p className="notice">{ENDED_COPY[chat.stopReason ?? "complete"] ?? ENDED_COPY.complete}</p>
      ) : (
        <form className="composer" onSubmit={submit}>
          {error && <p className="notice error">{error}</p>}
          <label htmlFor="reply" className="sr-only">
            Your reply
          </label>
          <textarea
            id="reply"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type your answer. Enter to send, Shift+Enter for a new line."
            rows={3}
            maxLength={4000}
            disabled={sending}
            autoFocus
          />
          <button type="submit" disabled={sending || !draft.trim()}>
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      )}
    </main>
  );
}
