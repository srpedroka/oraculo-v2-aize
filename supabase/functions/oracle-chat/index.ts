import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { assertOrgMember, getUser, serviceClient } from "../_shared/auth.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { resolveAiFunction } from "../_shared/ai-router.ts";
import {
  conversationMessagesForModel,
  formatConversationMemory,
  getOrCreateConversation,
  insertConversationMessage,
  loadConversationHistory,
  maybeSummarize,
} from "../_shared/conversations.ts";
import { callModel } from "../_shared/model.ts";
import { buildPlanContext, type PlanContextFocus } from "../_shared/plan-context.ts";
import { CONVERSATION_STYLE, guideForContext } from "../_shared/prompt-guides.ts";
import { recordAiUsage } from "../_shared/usage.ts";

function fallbackReview(objectives: any[]) {
  const risk = objectives.filter((objective) => ["at_risk", "late"].includes(objective.status));
  if (!objectives.length) {
    return "Ainda não encontrei um plano estruturado por aqui. Quer começar pelo Plano Estratégico ou por um plano trimestral?";
  }
  if (risk.length) {
    return `Tem um ponto que merece atenção: ${risk[0].title}. Quer que eu abra esse assunto com calma ou prefere um resumo geral?`;
  }
  return "No geral, não vejo ponto crítico agora. Quer um resumo rápido ou quer olhar uma área específica?";
}

function focusForContext(context: string, areaId: string | null): PlanContextFocus {
  const normalized = context.toLowerCase();
  if (normalized.includes("execucao") || normalized.includes("mensal")) return "monthly";
  if (normalized.includes("planos-trimestrais") || normalized.includes("trimestral")) return "quarterly";
  if (areaId || normalized.includes("areas")) return "area";
  return "org";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const { orgId, areaId = null, message = "", context = "chat" } = await req.json();
    if (!orgId) return jsonResponse({ error: "Empresa obrigatória" }, 400);

    await assertOrgMember(user.id, orgId);
    const client = serviceClient();
    const conversation = await getOrCreateConversation(client, {
      orgId,
      userId: user.id,
      channel: "web",
      areaId,
    });
    await insertConversationMessage(client, {
      orgId,
      areaId,
      userId: user.id,
      conversationId: conversation.id,
      author: "user",
      text: String(message),
      channel: "web",
    });
    await maybeSummarize(client, orgId, conversation);

    const aiRoute = await resolveAiFunction(client, orgId, "daily");
    const [{ data: objectives }, history, planContext] =
      await Promise.all([
        client.from("objectives").select("*").eq("org_id", orgId).order("created_at"),
        loadConversationHistory(client, conversation.id),
        buildPlanContext(client, orgId, { areaId, focus: focusForContext(String(context), areaId) }),
    ]);

    let answer = "";
    if (!aiRoute) {
      answer = fallbackReview(objectives ?? []);
    } else {
      const guide = guideForContext(String(context));
      const systemPrompt = [
        "Você é o Oráculo, a IA Estratégica da empresa. Responda em português do Brasil.",
        "Conduza o usuário com perguntas curtas e mantenha a lógica de Resultado e Evolução sem soar mecânico.",
        "Se a pergunta for ambígua, peça esclarecimento antes de analisar dados.",
        "Nunca diga que salvou algo se a ação não foi gravada pelo sistema.",
        CONVERSATION_STYLE,
        guide,
        formatConversationMemory(history),
        "Contexto atual do plano:",
        planContext,
      ].filter(Boolean).join("\n\n");

      try {
        const result = await callModel(aiRoute.provider, aiRoute.model, aiRoute.apiKey, systemPrompt, conversationMessagesForModel(history), aiRoute.limits);
        answer = result.text;
        await recordAiUsage({
          client,
          orgId,
          provider: aiRoute.provider,
          model: aiRoute.model,
          channel: "web",
          usage: result.usage,
          settings: aiRoute.legacySettings,
          metadata: { context, areaId, conversationId: conversation.id, aiFunction: "daily" },
        });
      } catch (modelError) {
        console.error("Erro ao chamar IA no chat web", modelError instanceof Error ? modelError.message : String(modelError));
        answer = fallbackReview(objectives ?? []);
      }
    }

    await insertConversationMessage(client, {
      orgId,
      areaId,
      userId: user.id,
      conversationId: conversation.id,
      author: "oracle",
      text: answer,
      channel: "web",
    });

    return jsonResponse({ answer, conversationId: conversation.id });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro no Oráculo" }, 400);
  }
});
