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
import { callModelForFunction } from "../_shared/call-for-function.ts";
import { buildPlanContext, type PlanContextFocus } from "../_shared/plan-context.ts";
import { periodForClose, periodForPlanning } from "../_shared/periods.ts";
import { CONVERSATION_STYLE, conversationGuideForContext } from "../_shared/conductors/persona.ts";
import { loadOrgTone, toneDirective } from "../_shared/conductors/tone.ts";
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
      const closeType = intent.planning_type === "quarterly" ? "quarter_close" : "month_close";
      if (!resolvedAreaId) {
        const answer = closeType === "quarter_close"
          ? "Claro. De qual departamento você quer fechar o trimestre?"
          : "Claro. De qual departamento você quer fechar o mês?";
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
        areaId: resolvedAreaId,
        type: closeType,
        period: periodForClose(closeType === "quarter_close" ? "quarterly" : "monthly", intent.period_hint, String(message)),
        userId: user.id,
        channel: "web",
      });
      return jsonResponse({ answer: sessionResult.reply, conversationId: conversation.id, session: sessionResult.session });
    }

    const aiRoute = await resolveAiFunction(client, orgId, "daily");
    const [{ data: objectives }, { data: areas }, history, planContext, orgTone] =
      await Promise.all([
        client.from("objectives").select("*").eq("org_id", orgId).is("archived_at", null).order("created_at"),
        client.from("areas").select("id").eq("org_id", orgId).is("archived_at", null),
        loadConversationHistory(client, conversation.id),
        buildPlanContext(client, orgId, { areaId: resolvedAreaId, focus: focusForContext(String(context), resolvedAreaId) }),
        loadOrgTone(client, orgId),
      ]);
    const activeAreaIds = new Set((areas ?? []).map((area: any) => area.id));
    const activeObjectives = (objectives ?? []).filter((objective: any) =>
      !objective.area_id || activeAreaIds.has(objective.area_id)
    );

    let answer = "";
    if (!aiRoute) {
      answer = fallbackReview(activeObjectives);
    } else {
      const guide = conversationGuideForContext(String(context));
      const systemPrompt = [
        "Você é o Oráculo, a IA Estratégica da empresa. Responda em português do Brasil.",
        "Conduza o usuário com perguntas curtas e mantenha a lógica de Resultado e Evolução sem soar mecânico.",
        "Se a pergunta for ambígua, peça esclarecimento antes de analisar dados.",
        "Nunca diga que salvou algo se a ação não foi gravada pelo sistema.",
        conversation.previous_conversation_id
          ? "Este é um novo episódio após inatividade. Preserve contexto e memória, mas não retome pergunta ou fluxo anterior sem pedido explícito do usuário."
          : "",
        toneDirective(orgTone),
        CONVERSATION_STYLE,
        guide,
        formatConversationMemory(history),
        "Contexto atual do plano:",
        planContext,
      ].filter(Boolean).join("\n\n");

      try {
        const result = await callModelForFunction(client, orgId, "daily", aiRoute, systemPrompt, conversationMessagesForModel(history), aiRoute.limits);
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
