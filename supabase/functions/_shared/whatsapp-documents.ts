import { serviceClient } from "./auth.ts";
import { resolveAiFunction } from "./ai-router.ts";
import { callModelForFunction } from "./call-for-function.ts";
import { periodForClose, periodForPlanning } from "./periods.ts";
import { renderPlanForWhatsApp } from "./plan-render.ts";
import { recordAiUsage } from "./usage.ts";
import { resolveAreaFromMessage, wantsDocumentAttachment } from "./whatsapp-planning.ts";
import {
  prepareReadyMonthlyPlanProposal,
  prepareReadyQuarterlyPlanProposal,
  prepareReadyStrategicPlanProposal,
} from "./session-engine.ts";
import {
  assertSafeStructuredValue,
  formatUntrustedDocument,
  importedConversationReceipt,
  importedDocumentInsightReceipt,
  normalizeImportedDocumentInsight,
  type ImportedDocumentInsight,
  UNTRUSTED_CONTENT_RULES,
} from "./untrusted-content.ts";
import { documentExtractionFailureMessage, extractDocumentText, resolveDocumentFile } from "./whatsapp-media.ts";
import { normalizeWhatsAppText as normalizeText, whatsappFileExtension as fileExtension } from "./whatsapp-text.ts";
import { inferWhatsAppDocumentType, type WhatsAppPlanDocumentType } from "./whatsapp-document-routing.ts";
import { strategicReviewDocumentHandoff } from "./whatsapp-review-document.ts";

type DocumentTarget = "strategic" | "quarterly" | "monthly" | "evidence" | "unknown";

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (_error) {
    return null;
  }
}

function fallbackDocumentKind(text: string) {
  const normalized = normalizeText(text);
  if (/roteiro|locucao|locução|cena\s+\d|storyboard|video|vídeo/.test(normalized)) return "roteiro de vídeo";
  if (/ata de reuniao|ata de reunião|participantes|pauta da reuniao|pauta da reunião/.test(normalized)) return "ata de reunião";
  if (/procedimento|passo a passo|instrucao de trabalho|instrução de trabalho/.test(normalized)) return "procedimento operacional";
  if (/relatorio|relatório|analise|análise|resultados/.test(normalized)) return "relatório";
  if (/proposta comercial|orcamento|orçamento|condicoes comerciais|condições comerciais/.test(normalized)) return "proposta comercial";
  if (/contrato|contratante|contratada|clausula|cláusula/.test(normalized)) return "contrato";
  return "documento de apoio";
}

function classifyDocumentFallback(text: string) {
  const normalized = normalizeText(text);
  const insight: ImportedDocumentInsight = {
    documentKind: fallbackDocumentKind(text),
    summary: "O texto foi extraído, mas a leitura automática não conseguiu produzir um resumo confiável neste momento.",
    keyPoints: [],
    suggestedUse: "Posso tentar relacionar o conteúdo a um plano ou tratá-lo como memória histórica quando a IA de bastidores estiver disponível.",
  };
  if (/swot|missao|visao|valores|proposito|tema do ano|objetivos estrategicos|planejamento estrategico/.test(normalized)) {
    return { target: "strategic" as const, confidence: 0.72, reason: "Contém sinais de planejamento estratégico anual.", ...insight };
  }
  if (/trimestral|q1|q2|q3|q4|trimestre|entregas do trimestre|objetivo anual da area/.test(normalized)) {
    return { target: "quarterly" as const, confidence: 0.68, reason: "Contém sinais de plano trimestral.", ...insight };
  }
  if (/\b(?:mensal|mes|semana|checklist)\b|acao(?:es)?\s+chave|ate\s+dia/.test(normalized)) {
    return { target: "monthly" as const, confidence: 0.66, reason: "Contém sinais de plano mensal ou execução do mês.", ...insight };
  }
  if (/evidencia|comprovante|relatorio|foto|laudo|contrato assinado|nota fiscal/.test(normalized)) {
    return { target: "evidence" as const, confidence: 0.62, reason: "Parece comprovação ou evidência de avanço.", ...insight };
  }
  return { target: "unknown" as const, confidence: 0.35, reason: "Não encontrei sinais suficientes para classificar com segurança.", ...insight };
}

function targetLabel(target: DocumentTarget) {
  const labels: Record<DocumentTarget, string> = {
    strategic: "Plano Estratégico",
    quarterly: "Planos Trimestrais",
    monthly: "Plano Mensal",
    evidence: "Evidência",
    unknown: "classificação indefinida",
  };
  return labels[target];
}

function formatImportedDocumentInsight(
  classification: ImportedDocumentInsight & { target: DocumentTarget; confidence: number; areaName?: string | null; period?: string | null; nextQuestion?: string | null },
) {
  const points = classification.keyPoints.length
    ? `\n\n*Pontos principais*\n${classification.keyPoints.map((point) => `- ${point}`).join("\n")}`
    : "";
  const category = classification.target === "unknown"
    ? "Ele não parece ser um plano formal nem uma evidência pronta para registro; é um material de apoio."
    : `No Oráculo, ele se aproxima de *${targetLabel(classification.target)}*.`;
  const question = classification.nextQuestion || classification.suggestedUse || "Você quer que eu aprofunde a análise ou use esse conteúdo como referência de um plano?";

  return [
    "*O que encontrei no conteúdo*",
    `É ${classification.documentKind}.`,
    classification.summary,
    points,
    category,
    question,
  ].filter(Boolean).join("\n\n");
}

type PlanDocumentType = WhatsAppPlanDocumentType;

function periodForDocument(type: PlanDocumentType, hint: string | null | undefined, message: string) {
  if (type === "strategic") return periodForPlanning("strategic", hint, message);
  if (type === "strategic_review") return periodForPlanning("strategic_review", hint, message);
  if (type === "quarterly") return periodForPlanning("quarterly", hint, message);
  if (type === "monthly") return periodForPlanning("monthly", hint, message);
  if (type === "quarter_close") return periodForClose("quarterly", hint, message);
  return periodForClose("monthly", hint, message);
}

export async function loadActiveAreas(client: ReturnType<typeof serviceClient>, orgId: string) {
  const { data: areas, error } = await client
    .from("areas")
    .select("id, name")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("created_at");
  if (error) throw error;
  return areas ?? [];
}

async function resolveDocumentAreaId(client: ReturnType<typeof serviceClient>, orgId: string, message: string, currentAreaId: string | null) {
  const areas = await loadActiveAreas(client, orgId);
  return resolveAreaFromMessage(message, areas).area?.id ?? currentAreaId;
}

async function latestDocumentByQuery(client: ReturnType<typeof serviceClient>, orgId: string, type: PlanDocumentType, areaId: string | null, period: string | null) {
  let query = client.from("plan_documents").select("*").eq("org_id", orgId).eq("type", type).is("archived_at", null).order("created_at", { ascending: false }).limit(1);
  query = areaId ? query.eq("area_id", areaId) : query.is("area_id", null);
  if (period) query = query.eq("period", period);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function answerDocumentQuestion(
  client: ReturnType<typeof serviceClient>,
  params: {
    orgId: string;
    areaId: string | null;
    message: string;
    conversationId: string;
  },
) {
  const { data: contextSession, error: contextError } = await client
    .from("planning_sessions")
    .select("type, period, area_id")
    .eq("org_id", params.orgId)
    .eq("conversation_id", params.conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (contextError) throw contextError;

  const explicitType = inferWhatsAppDocumentType(params.message);
  const sessionType = ["strategic", "strategic_review", "quarterly", "monthly", "month_close", "quarter_close"].includes(contextSession?.type)
    ? contextSession.type as PlanDocumentType
    : null;
  const type = explicitType ?? sessionType;
  if (!type) {
    return {
      reply: "Qual documento você quer receber: *Plano Estratégico*, *Plano Trimestral* ou *Plano Mensal*? Diga também a área e o período.",
      document: null,
      sendAsAttachment: false,
    };
  }

  const companyWide = type === "strategic" || type === "strategic_review";
  const areaId = companyWide
    ? null
    : await resolveDocumentAreaId(client, params.orgId, params.message, contextSession?.area_id ?? params.areaId);
  if (!companyWide && !areaId) {
    return {
      reply: "De qual área é esse documento? Preciso da área para não te entregar um plano de outro departamento.",
      document: null,
      sendAsAttachment: false,
    };
  }

  const period = explicitType
    ? periodForDocument(type, null, params.message)
    : String(contextSession?.period ?? "") || periodForDocument(type, null, params.message);
  const document = await latestDocumentByQuery(client, params.orgId, type, areaId, period);

  if (!document) {
    const typeText = type === "strategic_review"
      ? "Revisão Semestral"
      : targetLabel(type === "strategic" ? "strategic" : type === "quarterly" || type === "quarter_close" ? "quarterly" : "monthly");
    const areas = await loadActiveAreas(client, params.orgId);
    const areaName = areas.find((area: any) => area.id === areaId)?.name;
    const scope = [typeText, areaName, period].filter(Boolean).join(" · ");
    return {
      reply: `Ainda não existe um documento salvo para *${scope}*. Não vou substituir por um arquivo de outra área ou período. Posso continuar a condução desse plano até gerar o documento correto.`,
      document: null,
      sendAsAttachment: false,
    };
  }

  const rendered = renderPlanForWhatsApp(document.content ?? {}, document);
  const versionLine = `Documento: ${document.title} · v${document.version}`;
  const sendAsAttachment = wantsDocumentAttachment(params.message);
  return {
    reply: sendAsAttachment ? `${versionLine}\n\nVou enviar o arquivo PDF deste documento.` : `${versionLine}\n\n${rendered}`,
    document,
    sendAsAttachment,
  };
}

async function classifyImportedDocument(
  client: ReturnType<typeof serviceClient>,
  orgId: string,
  areaId: string | null,
  fileName: string,
  extractedText: string,
  profile: any,
) {
  const aiRoute = await resolveAiFunction(client, orgId, "background");
  const [{ data: areas }, { data: strategicPlan }, { data: areaPlans }, { data: objectives }] =
    await Promise.all([
      client.from("areas").select("id, name").eq("org_id", orgId).is("archived_at", null).order("created_at"),
      client.from("strategic_plans").select("year").eq("org_id", orgId).order("year", { ascending: false }).limit(1).maybeSingle(),
      client.from("area_plans").select("area_id, year").eq("org_id", orgId),
      client.from("objectives").select("title, level, area_id, period").eq("org_id", orgId).is("archived_at", null).order("created_at"),
    ]);

  const activeAreaIds = new Set((areas ?? []).map((area: any) => area.id));
  const activeAreaPlans = (areaPlans ?? []).filter((plan: any) => activeAreaIds.has(plan.area_id));
  const activeObjectives = (objectives ?? []).filter((objective: any) =>
    !objective.area_id || activeAreaIds.has(objective.area_id)
  );
  const areaNames = new Map((areas ?? []).map((area: any) => [area.id, area.name]));
  const classifierContext = {
    areas: (areas ?? []).map((area: any) => area.name),
    latestStrategicPlanYear: strategicPlan?.year ?? null,
    areaPlans: activeAreaPlans.map((plan: any) => ({ area: areaNames.get(plan.area_id) ?? null, year: plan.year })),
    objectives: activeObjectives.slice(0, 80).map((objective: any) => ({
      title: String(objective.title ?? "").slice(0, 240),
      level: objective.level,
      area: objective.area_id ? areaNames.get(objective.area_id) ?? null : "Empresa",
      period: objective.period,
    })),
    currentArea: areaId ? areaNames.get(areaId) ?? null : null,
  };

  if (!aiRoute) return classifyDocumentFallback(extractedText);

  const systemPrompt = [
    "Você classifica documentos enviados por WhatsApp para o sistema Oráculo.",
    UNTRUSTED_CONTENT_RULES,
    "Responda somente JSON válido, sem markdown.",
    "Targets possíveis: strategic, quarterly, monthly, evidence, unknown.",
    "Use strategic para planejamento anual da empresa, SWOT, propósito, visão, temas do ano, objetivos estratégicos e projetos prioritários.",
    "Use quarterly para plano de área/departamento, objetivos trimestrais, Q1/Q2/Q3/Q4, entregas trimestrais ou desdobramento do anual.",
    "Use monthly para objetivos do mês, ações-chave, execução mensal, prazos dentro do mês ou check-in mensal.",
    "Use evidence para comprovantes de avanço: laudo, contrato, relatório, foto descrita, medição, nota, resultado entregue.",
    "Roteiro de vídeo, ata, contrato, procedimento, apresentação ou outro material de apoio deve ser unknown quando não for ele próprio um plano estruturado ou uma evidência pronta, mesmo que cite objetivos, estratégia ou resultados.",
    "Se não houver segurança, use unknown.",
    "Analise o CONTEÚDO do arquivo. O nome é apenas uma pista secundária; se houver conflito, o conteúdo sempre vence.",
    "Mesmo quando target for unknown, identifique a natureza literal do material e explique seu conteúdo. Unknown significa fora das categorias operacionais do Oráculo, não arquivo não lido.",
    "O resumo deve ter de 2 a 4 frases concretas, e os pontos principais devem provar que o conteúdo foi analisado. Não invente informação ausente.",
    "Formato obrigatório: {\"target\":\"strategic|quarterly|monthly|evidence|unknown\",\"confidence\":0.0,\"reason\":\"curto\",\"areaName\":\"ou null\",\"period\":\"ou null\",\"documentKind\":\"natureza literal do material\",\"summary\":\"resumo concreto de 2 a 4 frases\",\"keyPoints\":[\"até 5 pontos\"],\"suggestedUse\":\"uso concreto no Oráculo ou null\",\"nextQuestion\":\"uma pergunta curta e concreta\"}",
    "Contexto mínimo confiável do Oráculo:",
    JSON.stringify(classifierContext, null, 2),
  ].join("\n\n");

  const result = await callModelForFunction(
    client,
    orgId,
    "background",
    aiRoute,
    systemPrompt,
    [
      {
        role: "user",
        content: formatUntrustedDocument({ content: extractedText, fileName }),
      },
    ],
    aiRoute.limits,
    { userId: profile?.id ?? null },
  );

  await recordAiUsage({
    client,
    orgId,
    provider: aiRoute.provider,
    model: aiRoute.model,
    channel: "whatsapp",
    usage: result.usage,
    settings: aiRoute.legacySettings,
    metadata: { areaId, fileName, action: "document_classification", aiFunction: "background" },
  });

  const parsed = parseJsonObject(result.text) as any;
  assertSafeStructuredValue(parsed, { maxDepth: 4, maxNodes: 60, maxArrayLength: 10, maxStringLength: 1_200, maxTotalStringChars: 5_000 });
  const fallback = classifyDocumentFallback(extractedText);
  const insight = normalizeImportedDocumentInsight(parsed, fallback);
  const target = ["strategic", "quarterly", "monthly", "evidence", "unknown"].includes(parsed?.target) ? parsed.target as DocumentTarget : "unknown";
  const confidence = Number(parsed?.confidence ?? 0.5);
  const rawPeriod = parsed?.period ? String(parsed.period).trim().slice(0, 80) : "";
  const safePeriod = target === "quarterly"
    ? (/^[TQ][1-4]\s+20\d{2}$/i.test(rawPeriod) ? rawPeriod.replace(/^Q/i, "T") : null)
    : target === "monthly"
      ? (/^(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)\s+20\d{2}$/i.test(rawPeriod) ? rawPeriod : null)
      : target === "strategic"
        ? (/^20\d{2}$/.test(rawPeriod) ? rawPeriod : null)
        : null;
  return {
    target,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    reason: String(parsed?.reason ?? "Classificação feita pela IA.").slice(0, 500),
    areaName: parsed?.areaName ? String(parsed.areaName).slice(0, 180) : null,
    period: safePeriod,
    nextQuestion: parsed?.nextQuestion ? String(parsed.nextQuestion).slice(0, 500) : null,
    ...insight,
  };
}

export async function processIncomingDocument(
  client: ReturnType<typeof serviceClient>,
  orgId: string,
  areaId: string | null,
  whatsappSettings: any,
  whatsappKeyRow: any,
  payload: any,
  profile: any,
  conversationId?: string | null,
) {
  const diagnostics: string[] = [];
  const file = await resolveDocumentFile(whatsappSettings, whatsappKeyRow, payload, diagnostics);
  if (!file) {
    const diagnosticCode = diagnostics.slice(-6).join(" | ") || "sem-diagnostico";
    console.error("Falha final ao baixar documento do WhatsApp", { diagnosticCode });
    return {
      userText: "[Arquivo recebido sem leitura]",
      answer: "Recebi o arquivo, mas não consegui baixá-lo desta vez. Pode reenviar o mesmo documento? Se continuar, tente enviar como PDF, TXT ou Markdown.",
    };
  }

  let extractedText: string | null = null;
  try {
    extractedText = await extractDocumentText(file);
    console.info("Documento do WhatsApp extraído", {
      mimeType: file.mimeType,
      extension: fileExtension(file.fileName),
      byteLength: file.bytes.byteLength,
      textLength: extractedText.length,
    });
    const { data: reviewSession, error: reviewSessionError } = conversationId
      ? await client.from("planning_sessions")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", profile.id)
        .eq("conversation_id", conversationId)
        .eq("type", "strategic_review")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      : { data: null, error: null };
    if (reviewSessionError) throw reviewSessionError;
    if (reviewSession) {
      return strategicReviewDocumentHandoff({
        sessionId: reviewSession.id,
        fileName: file.fileName,
        extractedText,
      });
    }
    const classification = await classifyImportedDocument(client, orgId, areaId, file.fileName, extractedText, profile);
    if (classification.target === "strategic") {
      const year = classification.period?.match(/\b(20\d{2})\b/)?.[1] ?? String(new Date().getFullYear());
      const prepared = await prepareReadyStrategicPlanProposal(client, {
        orgId,
        areaId: null,
        period: year,
        planText: extractedText,
        fileName: file.fileName,
        userId: profile.id,
        channel: "whatsapp",
      });
      return {
        userText: importedConversationReceipt(file.fileName, targetLabel(classification.target)),
        answer: `${prepared.reply}\n\nSe estiver coerente, responda *confirmar* que eu gravo no módulo.`,
        skipHistory: true,
      };
    }

    if (classification.target === "quarterly" || classification.target === "monthly") {
      const matchedAreaId = await resolveDocumentAreaId(
        client,
        orgId,
        `${classification.areaName ?? ""}\n${extractedText.slice(0, 3000)}`,
        areaId,
      );
      if (!matchedAreaId) {
        return {
          userText: importedDocumentInsightReceipt(classification),
          answer: `${formatImportedDocumentInsight(classification)}\n\nAntes de montar a proposta, preciso saber de qual área ele é. Qual área devo usar?`,
          skipHistory: false,
        };
      }

      const period = classification.period ?? periodForPlanning(classification.target === "quarterly" ? "quarterly" : "monthly", null, extractedText);
      const prepared = classification.target === "quarterly"
        ? await prepareReadyQuarterlyPlanProposal(client, {
          orgId,
          areaId: matchedAreaId,
          period,
          planText: extractedText,
          fileName: file.fileName,
          userId: profile.id,
          channel: "whatsapp",
        })
        : await prepareReadyMonthlyPlanProposal(client, {
          orgId,
          areaId: matchedAreaId,
          period,
          planText: extractedText,
          fileName: file.fileName,
          userId: profile.id,
          channel: "whatsapp",
        });

      return {
        userText: importedConversationReceipt(file.fileName, targetLabel(classification.target)),
        answer: `${prepared.reply}\n\nSe estiver coerente, responda *confirmar* que eu gravo no módulo e gero o documento padrão.`,
        skipHistory: true,
      };
    }

    const answer = formatImportedDocumentInsight(classification);

    return {
      userText: importedDocumentInsightReceipt(classification),
      answer,
      skipHistory: false,
    };
  } catch (error) {
    console.error(extractedText ? "Falha após extrair documento do WhatsApp" : "Falha ao extrair documento do WhatsApp", {
      mimeType: file.mimeType,
      extension: fileExtension(file.fileName),
      byteLength: file.bytes.byteLength,
      error: error instanceof Error ? error.message : "erro-desconhecido",
    });
    if (extractedText) {
      const fallback = classifyDocumentFallback(extractedText);
      return {
        userText: importedDocumentInsightReceipt(fallback),
        answer: `${formatImportedDocumentInsight(fallback)}\n\nLi o arquivo, mas não consegui preparar a ação automática agora. Posso continuar usando o conteúdo como contexto nesta conversa.`,
        skipHistory: false,
      };
    }
    return {
      userText: "[Arquivo recebido sem extração]",
      answer: `Recebi o arquivo "${file.fileName}", mas não consegui extrair texto suficiente. ${documentExtractionFailureMessage(error)}`,
      skipHistory: false,
    };
  }
}
