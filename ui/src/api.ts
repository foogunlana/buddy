import { hc } from "hono/client";
import type { AppType, ChatView } from "../../api/src/server/app";

// Typed client: routes, params and bodies are checked against the API's own definitions.
export const api = hc<AppType>("/");
export type { ChatView };

async function unwrap(res: Response): Promise<ChatView> {
  const body = (await res.json().catch(() => ({}))) as ChatView | { error?: string };
  if (!res.ok) throw new Error(("error" in body && body.error) || `Something went wrong (${res.status}).`);
  return body as ChatView;
}

export const openChat = async (assignmentId: string) =>
  unwrap(await api.api.chat[":assignmentId"].$get({ param: { assignmentId } }));

export const sendMessage = async (assignmentId: string, text: string) =>
  unwrap(await api.api.chat[":assignmentId"].messages.$post({ param: { assignmentId }, json: { text } }));
