import { hc } from "hono/client";
import type { AppType, ChatView, PreviewItem, PreviewView } from "../../api/src/server/app";

// Typed client: routes, params and bodies are checked against the API's own definitions.
export const api = hc<AppType>("/");
export type { ChatView, PreviewItem, PreviewView };

async function unwrap<T = ChatView>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T | { error?: string };
  if (!res.ok) throw new Error((body as { error?: string }).error || `Something went wrong (${res.status}).`);
  return body as T;
}

export const openChat = async (assignmentId: string) =>
  unwrap(await api.api.chat[":assignmentId"].$get({ param: { assignmentId } }));

export const sendMessage = async (assignmentId: string, text: string) =>
  unwrap(await api.api.chat[":assignmentId"].messages.$post({ param: { assignmentId }, json: { text } }));

export const getPreview = async (assignmentId: string) =>
  unwrap<PreviewView>(await api.api.chat[":assignmentId"].preview.$get({ param: { assignmentId } }));

export type Decision = PreviewItem & { action: "keep" | "remove" | "too_identifying" };

export const submitPreview = async (assignmentId: string, items: Decision[]) =>
  unwrap<PreviewView>(await api.api.chat[":assignmentId"].preview.$post({ param: { assignmentId }, json: { items } }));
