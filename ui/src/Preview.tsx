import { useEffect, useState } from "react";
import { getPreview, submitPreview, type Decision, type PreviewItem, type PreviewView } from "./api";

const FIELDS: { key: "behaviour" | "example" | "impact" | "ask"; label: string }[] = [
  { key: "behaviour", label: "What they did" },
  { key: "example", label: "Example" },
  { key: "impact", label: "Why it mattered" },
  { key: "ask", label: "What would help" },
];

const ACTIONS: { value: Decision["action"]; label: string }[] = [
  { value: "keep", label: "Share" },
  { value: "remove", label: "Remove" },
  { value: "too_identifying", label: "Too identifying" },
];

export function Preview({ assignmentId, receiverName }: { assignmentId: string; receiverName: string }) {
  const [preview, setPreview] = useState<PreviewView | null>(null);
  const [drafts, setDrafts] = useState<Decision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch; while another request is generating the summary, check again shortly.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const p = await getPreview(assignmentId);
        if (cancelled) return;
        setPreview(p);
        setDrafts(p.items.map((i) => ({ ...i, action: "keep" })));
        if (p.state === "preparing") timer = setTimeout(load, 2000);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [assignmentId]);

  const update = (id: string, patch: Partial<Decision>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  async function share() {
    setSubmitting(true);
    setError(null);
    try {
      setPreview(await submitPreview(assignmentId, drafts));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !preview) {
    return (
      <section className="preview">
        <p className="notice error">{error}</p>
        <button type="button" onClick={() => location.reload()}>
          Try again
        </button>
      </section>
    );
  }
  if (!preview || preview.state === "preparing") {
    return <p className="notice">Preparing a summary of what you said, reworded so it can't be traced to you…</p>;
  }
  if (preview.state === "none") return null;

  if (preview.state === "submitted") {
    return (
      <section className="preview">
        <h2>Thanks. Your feedback is in.</h2>
        <p className="muted">
          {receiverName} sees nothing until at least {preview.floor} people have taken part, and then only themes pooled
          across everyone.
        </p>
        {preview.items.length > 0 ? (
          <>
            <span className="eyebrow">What you shared</span>
            <ul className="shared">
              {preview.items.map((i) => (
                <ItemSummary key={i.id} item={i} />
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">You chose not to share anything this time.</p>
        )}
      </section>
    );
  }

  const sharing = drafts.filter((d) => d.action === "keep").length;
  return (
    <section className="preview">
      <div className="preview-head">
        <span className="eyebrow">Before anything is shared</span>
        <h2>Review what goes into the pool</h2>
        <p className="muted">
          This is everything that will be pooled from your conversation, reworded to remove your voice and details that
          point to you. Edit anything, remove it, or mark it too identifying. {receiverName} never sees the conversation
          itself.
        </p>
      </div>

      {drafts.length === 0 && <p className="notice">There's nothing from this conversation to share.</p>}

      <ol className="items">
        {drafts.map((d) => (
          <li key={d.id} className={`item ${d.action !== "keep" ? "dropped" : ""}`}>
            <div className="item-top">
              <span className={`tag ${d.polarity}`}>{d.polarity === "keep" ? "Keep doing" : "Change"}</span>
              <div className="segmented" role="radiogroup" aria-label="What to do with this item">
                {ACTIONS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    role="radio"
                    aria-checked={d.action === a.value}
                    className={d.action === a.value ? "on" : ""}
                    onClick={() => update(d.id, { action: a.value })}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Theme</span>
              <input
                id={`theme-${d.id}`}
                value={d.theme}
                disabled={d.action !== "keep"}
                onChange={(e) => update(d.id, { theme: e.target.value })}
              />
            </label>
            {FIELDS.map((f) => (
              <label key={f.key} className="field">
                <span>{f.label}</span>
                <textarea
                  id={`${f.key}-${d.id}`}
                  rows={2}
                  value={d[f.key] ?? ""}
                  placeholder="Not mentioned"
                  disabled={d.action !== "keep"}
                  onChange={(e) => update(d.id, { [f.key]: e.target.value })}
                />
              </label>
            ))}
          </li>
        ))}
      </ol>

      {error && <p className="notice error">{error}</p>}
      <div className="preview-actions">
        <span className="muted">
          {sharing} of {drafts.length} item{drafts.length === 1 ? "" : "s"} will be shared
        </span>
        <button type="button" onClick={share} disabled={submitting || drafts.some((d) => d.action === "keep" && !d.theme.trim())}>
          {submitting ? "Sharing…" : sharing ? "Share these" : "Finish without sharing"}
        </button>
      </div>
    </section>
  );
}

function ItemSummary({ item }: { item: PreviewItem }) {
  return (
    <li>
      <span className={`tag ${item.polarity}`}>{item.polarity === "keep" ? "Keep doing" : "Change"}</span> <b>{item.theme}</b>
      {FIELDS.filter((f) => item[f.key]).map((f) => (
        <p key={f.key}>
          <span className="muted">{f.label}: </span>
          {item[f.key]}
        </p>
      ))}
    </li>
  );
}
