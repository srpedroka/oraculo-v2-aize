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
import { classifyOracleIntent } from "../_shared/intent-router.ts";
import { callModel } from "../_shared/model.ts";
import { buildPlanContext, type PlanContextFocus } from "../_shared/plan-context.ts";
import { periodForPlanning } from "../_shared/periods.ts";
import { CONVERSATION_STYLE, guideForContext } from "../_shared/prompt-guides.ts";
import { startPlanningSession } from "../_shared/session-engine.ts";
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

function areaIdFromContext(context: string) {
  const match = context.match(/\/areas\/([^/?#]+)/);
  return match ? match[1] : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await getUser(req);
    const { orgId, areaId = null, message = "", context = "chat" } = await req.json();
    if (!orgId) return jsonResponse({ error: "Empresa obrigatória" }, 400);

    await assertOrgMember(user.id, orgId);
    const client = serviceClient();
    const resolvedAreaId = areaId ?? areaIdFromContext(String(context));
    const conversation = await getOrCreateConversation(client, {
      orgId,
      userId: user.id,
      channel: "web",
      areaId: resolvedAreaId,
    });
    await insertConversationMessage(client, {
      orgId,
      areaId: resolvedAreaId,
      userId: user.id,
      conversationId: conversation.id,
      author: "user",
      text: String(message),
      channel: "web",
    });
    await maybeSummarize(client, orgId, conversation);

    const intent = await classifyOracleIntent(client, {
      orgId,
      message: String(message),
      channel: "web",
      areaId: resolvedAreaId,
      conversationId: conversation.id,
    });

    if (intent.intent === "start_planning") {
      if (!intent.planning_type) {
        const answer = "Claro. Qual plano você quer montar agora: estratégico anual, trimestral ou mensal?";
        await insertConversationMessage(client, {
          orgId,
          areaId: resolvedAreaId,
          userId: user.id,
          conversationId: conversation.id,
          author: "oracle",
          text: answer,
          channel: "web",
        });
        return jsonResponse({ answer, conversationId: conversation.id });
      }

      const sessionResult = await startPlanningSession(client, {
        orgId,
        areaId: intent.planning_type === "strategic" ? null : resolvedAreaId,
        type: intent.planning_type,
        period: periodForPlanning(intent.planning_type, intent.period_hint, String(message)),
        userId: user.id,
        channel: "web",
      });
      return jsonResponse({ answer: sessionResult.reply, conversationId: conversation.id, session: sessionResult.session });
    }

    if (intent.intent === "close_period") {
      const answer = "O fechamento guiado entra na próxima fase do Oráculo. Por enquanto, posso fazer uma revisão estruturada do mês ou trimestre e apontar pendências. Quer que eu revise agora?";
      await insertConversationMessage(client, {
        orgId,
        areaId: resolvedAreaId,
        userId: user.id,
        conversationId: conversation.id,
        author: "oracle",
        text: answer,
        channel: "web",
      });
      return jsonResponse({ answer, conversationId: conversation.id });
    }

    const aiRoute = await resolveAiFunction(client, orgId, "daily");
    const [{ data: objectives }, history, planContext] =
      await Promise.all([
        client.from("objectives").select("*").eq("org_id", orgId).order("created_at"),
        loadConversationHistory(client, conversation.id),
        buildPlanContext(client, orgId, { areaId: resolvedAreaId, focus: focusForContext(String(context), resolvedAreaId) }),
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
          metadata: { context, areaId: resolvedAreaId, conversationId: conversation.id, aiFunction: "daily" },
        });
      } catch (modelError) {
        console.error("Erro ao chamar IA no chat web", modelError instanceof Error ? modelError.message : String(modelError));
        answer = fallbackReview(objectives ?? []);
      }
    }

    await insertConversationMessage(client, {
      orgId,
      areaId: resolvedAreaId,
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
