export const CONVERSATION_IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000;

interface SessionConversationCandidate {
  org_id?: string | null;
  user_id?: string | null;
  channel?: string | null;
  status?: string | null;
  last_message_at?: string | null;
}

interface SessionConversationScope {
  orgId: string;
  userId: string;
  channel: "web" | "whatsapp";
}

interface EpisodeMessage {
  author: "oracle" | "user";
  text: string;
  created_at: string;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function conversationIdleExpired(
  lastMessageAt: string | null | undefined,
  now = new Date(),
  timeoutMs = CONVERSATION_IDLE_TIMEOUT_MS,
) {
  if (!lastMessageAt) return false;
  const last = new Date(lastMessageAt).getTime();
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last >= timeoutMs;
}

export function shouldRebindSessionConversation(
  conversation: SessionConversationCandidate | null | undefined,
  scope: SessionConversationScope,
  now = new Date(),
) {
  if (!conversation || conversation.status !== "active") return true;
  if (
    conversation.org_id !== scope.orgId ||
    conversation.user_id !== scope.userId ||
    conversation.channel !== scope.channel
  ) return true;
  return conversationIdleExpired(conversation.last_message_at, now);
}

export function isExplicitPlanningResume(value: unknown) {
  const message = normalize(value);
  if (!message) return false;
  return /\b(retomar|retome|continuar|continue|continuamos|prosseguir|prossegue|seguir|voltamos|voltar)\b/.test(message) &&
    /\b(plano|planejamento|sessao|conversa|onde paramos|de onde paramos)\b/.test(message);
}

export function buildEpisodeBridgeSummary(
  previousSummary: string | null | undefined,
  messages: EpisodeMessage[],
  maxChars = 4000,
) {
  const transcript = messages
    .map((message) => `${message.created_at} - ${message.author === "oracle" ? "Oraculo" : "Usuario"}: ${message.text}`)
    .join("\n");
  const parts = [
    previousSummary?.trim() ? `Memoria anterior:\n${previousSummary.trim()}` : "",
    transcript ? `Final do episodio anterior:\n${transcript}` : "",
  ].filter(Boolean);
  if (!parts.length) return null;
  const combined = parts.join("\n\n");
  return combined.length <= maxChars ? combined : `…${combined.slice(-(maxChars - 1))}`;
}
