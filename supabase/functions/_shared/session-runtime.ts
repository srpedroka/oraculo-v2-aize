import { insertConversationMessage } from "./conversations.ts";

type Client = any;

export function shallowMergeState(current: Record<string, unknown>, patch: Record<string, unknown>) {
  return { ...(current ?? {}), ...(patch ?? {}) };
}

export async function assertCanStartSession(client: Client, orgId: string, areaId: string | null, userId: string) {
  const { data: membership, error } = await client
    .from("memberships")
    .select("id, role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!membership) throw new Error("Sem acesso à empresa");
  if (!areaId) return membership;

  const { data: area, error: areaError } = await client
    .from("areas")
    .select("id, coordinator_id")
    .eq("id", areaId)
    .eq("org_id", orgId)
    .is("archived_at", null)
    .maybeSingle();
  if (areaError) throw areaError;
  if (!area) throw new Error("Área arquivada ou não encontrada");
  if (membership.role !== "owner" && area.coordinator_id !== membership.id) {
    throw new Error("Coordenador só pode iniciar sessão da própria área");
  }
  return membership;
}

export async function insertSessionMessage(
  client: Client,
  session: any,
  author: "user" | "oracle",
  text: string,
  channel: "web" | "whatsapp",
) {
  if (!session.conversation_id) throw new Error("Sessão sem conversa vinculada");
  await insertConversationMessage(client, {
    orgId: session.org_id,
    areaId: session.area_id,
    userId: session.user_id,
    conversationId: session.conversation_id,
    author,
    text,
    channel,
  });
}
