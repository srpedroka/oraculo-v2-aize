import { resolveAiFunction } from "./ai-router.ts";
import { callModelForFunction } from "./call-for-function.ts";
import { recordAiUsage } from "./usage.ts";
import { buildEpisodeBridgeSummary, conversationIdleExpired } from "./conversation-policy.ts";
import { formatForWhatsApp, splitWhatsAppBlocks } from "./whatsapp.ts";
import { scheduleWhatsAppSenderWake } from "./whatsapp-outbox.ts";

type Client = any;

export type ConversationChannel = "web" | "whatsapp";

export interface ConversationRecord {
  id: string;
  org_id: string;
  user_id: string;
  area_id: string | null;
  channel: ConversationChannel;
  status: "active" | "archived";
  summary: string | null;
  summary_upto: string | null;
  pending_context?: Record<string, unknown> | null;
  last_message_at: string | null;
  created_at: string;
  episode_started?: boolean;
  previous_conversation_id?: string | null;
}

export interface ConversationMessage {
  id: string;
  author: "oracle" | "user";
  text: string;
  created_at: string;
}

export interface ConversationHistory {
  summary: string | null;
  messages: ConversationMessage[];
}

export async function getConversationById(client: Client, conversationId: string) {
  const { data, error } = await client
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw error;
  return data as ConversationRecord | null;
}

export async function getOrCreateConversation(
  client: Client,
  params: { orgId: string; userId: string; channel: ConversationChannel; areaId?: string | null },
) {
  const { data: existing, error } = await client
    .from("conversations")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("user_id", params.userId)
    .eq("channel", params.channel)
    .eq("status", "active")
    .order("last_message_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (existing) {
    if (conversationIdleExpired(existing.last_message_at)) {
      const { data: recentMessages, error: recentMessagesError } = await client
        .from("chat_messages")
        .select("id, author, text, created_at")
        .eq("conversation_id", existing.id)
        .order("created_at", { ascending: false })
        .limit(8);
      if (recentMessagesError) throw recentMessagesError;
      const bridgeSummary = buildEpisodeBridgeSummary(
        existing.summary,
        ((recentMessages ?? []) as ConversationMessage[]).reverse(),
      );

      const { error: archiveError } = await client
        .from("conversations")
        .update({ status: "archived", pending_context: {} })
        .eq("id", existing.id);
      if (archiveError) throw archiveError;

      const { data: fresh, error: freshError } = await client
        .from("conversations")
        .insert({
          org_id: params.orgId,
          user_id: params.userId,
          area_id: params.areaId ?? existing.area_id ?? null,
          channel: params.channel,
          summary: bridgeSummary,
        })
        .select("*")
        .single();
      if (freshError) throw freshError;
      return {
        ...(fresh as ConversationRecord),
        episode_started: true,
        previous_conversation_id: existing.id,
      };
    }
    if (!existing.area_id && params.areaId) {
      const { data: updated, error: updateError } = await client
        .from("conversations")
        .update({ area_id: params.areaId })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      return { ...(updated as ConversationRecord), episode_started: false };
    }
    return { ...(existing as ConversationRecord), episode_started: false };
  }

  const { data, error: insertError } = await client
    .from("conversations")
    .insert({
      org_id: params.orgId,
      user_id: params.userId,
      area_id: params.areaId ?? null,
      channel: params.channel,
    })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return { ...(data as ConversationRecord), episode_started: true, previous_conversation_id: null };
}

export async function touchConversation(client: Client, conversationId: string) {
  const { error } = await client
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) throw error;
}

export async function insertConversationMessage(
  client: Client,
  params: {
    orgId: string;
    areaId?: string | null;
    userId: string;
    conversationId: string;
    author: "oracle" | "user";
    text: string;
    channel: ConversationChannel;
    queueWhatsAppDelivery?: boolean;
    correlationId?: string | null;
  },
) {
  if (params.author === "oracle" && params.channel === "whatsapp") {
    const contents = splitWhatsAppBlocks(formatForWhatsApp(params.text));
    const { data, error } = await client.rpc("insert_whatsapp_oracle_message", {
      p_org_id: params.orgId,
      p_area_id: params.areaId ?? null,
      p_user_id: params.userId,
      p_conversation_id: params.conversationId,
      p_text: params.text,
      p_contents: contents,
      p_queue_delivery: params.queueWhatsAppDelivery !== false,
      p_correlation_id: params.correlationId ?? null,
    });
    if (error) throw error;
    const inserted = data?.[0];
    if (!inserted?.message_id) throw new Error("Falha ao gravar resposta do Oráculo");
    if (inserted.queued === true) {
      scheduleWhatsAppSenderWake(client, params.orgId, inserted.correlation_id);
    }
    return {
      id: inserted.message_id,
      author: inserted.message_author,
      text: inserted.message_text,
      created_at: inserted.message_created_at,
    } as ConversationMessage;
  }

  const { data, error } = await client
    .from("chat_messages")
    .insert({
      org_id: params.orgId,
      area_id: params.areaId ?? null,
      user_id: params.userId,
      conversation_id: params.conversationId,
      author: params.author,
      text: params.text,
      channel: params.channel,
    })
    .select("id, author, text, created_at")
    .single();
  if (error) throw error;

  await touchConversation(client, params.conversationId);
  return data as ConversationMessage;
}

export async function loadConversationHistory(client: Client, conversationId: string, limit = 30): Promise<ConversationHistory> {
  const conversation = await getConversationById(client, conversationId);
  if (!conversation) return { summary: null, messages: [] };

  const messageLimit = conversation.summary ? Math.min(limit, 15) : limit;
  const { data, error } = await client
    .from("chat_messages")
    .select("id, author, text, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(messageLimit);
  if (error) throw error;

  return {
    summary: conversation.summary ?? null,
    messages: ((data ?? []) as ConversationMessage[]).reverse(),
  };
}

function formatTranscript(messages: ConversationMessage[]) {
  return messages
    .map((message) => {
      const author = message.author === "oracle" ? "Oráculo" : "Usuário";
      return `${message.created_at} - ${author}: ${message.text}`;
    })
    .join("\n");
}

export async function maybeSummarize(client: Client, orgId: string, conversation: ConversationRecord | null) {
  if (!conversation) return conversation;

  let query = client
    .from("chat_messages")
    .select("id, author, text, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });

  if (conversation.summary_upto) {
    query = query.gt("created_at", conversation.summary_upto);
  }

  const { data, error } = await query;
  if (error) throw error;

  const messages = (data ?? []) as ConversationMessage[];
  if (messages.length <= 40) return conversation;

  const messagesToKeep = 15;
  const messagesToSummarize = messages.slice(0, Math.max(1, messages.length - messagesToKeep));
  const lastSummarized = messagesToSummarize[messagesToSummarize.length - 1];
  const aiRoute = await resolveAiFunction(client, orgId, "background");
  if (!aiRoute || !lastSummarized) return conversation;

  const systemPrompt =
    "Resuma a conversa abaixo em até 15 linhas, em português, preservando: decisões tomadas, números citados, compromissos e pendências, e o assunto em andamento. Escreva como notas objetivas, sem floreio.";
  const userContent = [
    conversation.summary ? `Resumo anterior:\n${conversation.summary}` : "Resumo anterior: nenhum.",
    "Mensagens novas:",
    formatTranscript(messagesToSummarize),
  ].join("\n\n");

  try {
    const result = await callModelForFunction(
      client,
      orgId,
      "background",
      aiRoute,
      systemPrompt,
      [{ role: "user", content: userContent }],
      aiRoute.limits,
    );

    await recordAiUsage({
      client,
      orgId,
      provider: aiRoute.provider,
      model: aiRoute.model,
      channel: "system",
      usage: result.usage,
      settings: aiRoute.legacySettings,
      metadata: { aiFunction: "background", action: "conversation_summary", conversationId: conversation.id },
    });

    const { data: updated, error: updateError } = await client
      .from("conversations")
      .update({
        summary: result.text.trim(),
        summary_upto: lastSummarized.created_at,
      })
      .eq("id", conversation.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return updated as ConversationRecord;
  } catch (error) {
    console.error("Erro ao resumir conversa", error instanceof Error ? error.message : String(error));
    return conversation;
  }
}

export function formatConversationMemory(history: ConversationHistory) {
  if (!history.summary) return "";
  return [
    "Memória resumida da conversa até aqui:",
    history.summary,
    "Use esse resumo como memória, mas priorize as últimas mensagens quando houver conflito.",
  ].join("\n");
}

export function conversationMessagesForModel(history: ConversationHistory) {
  return history.messages.map((message) => ({
    role: message.author === "oracle" ? "assistant" as const : "user" as const,
    content: message.text,
  }));
}
