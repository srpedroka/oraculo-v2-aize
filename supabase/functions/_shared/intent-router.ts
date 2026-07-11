import { resolveAiFunction } from "./ai-router.ts";
import { callModelForFunction } from "./call-for-function.ts";
import { parseJsonObject } from "./json.ts";
import { inferPlanningType, normalizeTextForRouting } from "./periods.ts";
import { recordAiUsage } from "./usage.ts";

type Client = any;

export type OracleIntent =
  | "smalltalk"
  | "status"
  | "quick_update"
  | "start_planning"
  | "close_period"
  | "document_question"
  | "other";

export interface IntentClassification {
  intent: OracleIntent;
  planning_type: "strategic" | "quarterly" | "monthly" | null;
  period_hint: string | null;
  confidence: number;
}

const VALID_INTENTS = new Set(["smalltalk", "status", "quick_update", "start_planning", "close_period", "document_question", "other"]);

function fallbackIntent(message: string): IntentClassification {
  const normalized = normalizeTextForRouting(message);
  const planningType = inferPlanningType(message);

  if (/^(oi|ola|bom dia|boa tarde|boa noite|teste|obrigad)/.test(normalized) && normalized.length < 60) {
    return { intent: "smalltalk", planning_type: null, period_hint: null, confidence: 0.72 };
  }
  if (/(fechar|fechamento|check-?in|encerrar|virada).*(mes|mensal|tri|trimestre)|balanco do mes|balanco do trimestre/.test(normalized)) {
    return { intent: "close_period", planning_type: planningType, period_hint: null, confidence: 0.7 };
  }
  if (/(planej|criar|montar|revisar).*(plano|mensal|trimestral|estrateg)|quero planejar/.test(normalized)) {
    return { intent: "start_planning", planning_type: planningType, period_hint: null, confidence: 0.74 };
  }
  if (/(conclu|finaliz|terminei|feito|avancei|atualiz|progresso|evidencia|comprov)/.test(normalized)) {
    return { intent: "quick_update", planning_type: null, period_hint: null, confidence: 0.7 };
  }
  if (/(documento|pdf|arquivo|apresentacao|plano gravado|me envie|mandar o plano|resumir o documento)/.test(normalized)) {
    return { intent: "document_question", planning_type: null, period_hint: null, confidence: 0.65 };
  }
  if (/(como esta|status|andamento|situacao|resultado|meta|indicador|objetivo|plano|area|mes|trimestre)/.test(normalized)) {
    return { intent: "status", planning_type: planningType, period_hint: null, confidence: 0.7 };
  }
  return { intent: "other", planning_type: planningType, period_hint: null, confidence: 0.5 };
}

export async function classifyOracleIntent(
  client: Client,
  params: { orgId: string; message: string; channel: "web" | "whatsapp"; areaId?: string | null; conversationId?: string | null },
): Promise<IntentClassification> {
  const aiRoute = await resolveAiFunction(client, params.orgId, "background");
  if (!aiRoute) return fallbackIntent(params.message);

  const systemPrompt = [
    'Você classifica a intenção de uma mensagem enviada ao Oráculo, assistente estratégico, pelo WhatsApp. Responda somente JSON válido: {"intent": "smalltalk|status|quick_update|start_planning|close_period|document_question|other", "planning_type": "strategic|quarterly|monthly|null", "period_hint": "string|null", "confidence": 0.0}',
    "Definições:",
    "- smalltalk: saudação, teste, agradecimento, papo leve.",
    "- status: pergunta sobre andamento de plano, objetivos, metas, indicadores, área ou empresa.",
    "- quick_update: a pessoa informa claramente um avanço pontual (concluiu uma ação, atualizou um número, quer registrar uma evidência curta).",
    "- start_planning: pede para criar ou revisar plano (do ano, do trimestre ou do mês).",
    "- close_period: quer fazer o fechamento ou check-in do mês ou do trimestre.",
    "- document_question: pergunta sobre um documento ou plano gravado (quer receber, resumir).",
    "- other: nada acima.",
  ].join("\n");

  try {
    const result = await callModelForFunction(
      client,
      params.orgId,
      "background",
      aiRoute,
      systemPrompt,
      [{ role: "user", content: params.message }],
      aiRoute.limits,
    );

    await recordAiUsage({
      client,
      orgId: params.orgId,
      provider: aiRoute.provider,
      model: aiRoute.model,
      channel: params.channel,
      usage: result.usage,
      settings: aiRoute.legacySettings,
      metadata: { aiFunction: "background", action: "intent_classification", areaId: params.areaId ?? null, conversationId: params.conversationId ?? null },
    });

    const parsed = parseJsonObject(result.text) as any;
    const fallback = fallbackIntent(params.message);
    const intent = VALID_INTENTS.has(parsed?.intent) ? parsed.intent as OracleIntent : fallback.intent;
    const planningType = ["strategic", "quarterly", "monthly"].includes(parsed?.planning_type)
      ? parsed.planning_type as "strategic" | "quarterly" | "monthly"
      : fallback.planning_type;
    return {
      intent,
      planning_type: planningType,
      period_hint: parsed?.period_hint ? String(parsed.period_hint) : null,
      confidence: Math.max(0, Math.min(1, Number(parsed?.confidence ?? fallback.confidence))),
    };
  } catch (error) {
    console.error("Erro ao classificar intenção", error instanceof Error ? error.message : String(error));
    return fallbackIntent(params.message);
  }
}
