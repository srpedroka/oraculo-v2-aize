import { resolveAiFunction } from "./ai-router.ts";
import { callModelForFunction } from "./call-for-function.ts";
import { parseJsonObject } from "./json.ts";
import { buildPlanContext } from "./plan-context.ts";
import { currentMonthPeriod, normalizeTextForRouting } from "./periods.ts";
import { recordAiUsage } from "./usage.ts";

type Client = any;

type CandidateKind = "action" | "objective";
type QuickOperation = "mark_done" | "set_progress" | "set_status" | "add_evidence" | "none";

interface QuickCandidate {
  code: string;
  kind: CandidateKind;
  id: string;
  label: string;
  objectiveId: string;
  objectiveTitle: string;
  areaId: string | null;
  status: string;
  progress?: number | null;
}

interface ExtractedUpdate {
  target_code: string | null;
  operation: QuickOperation;
  progress: number | null;
  status: "on_track" | "at_risk" | "late" | "done" | null;
  evidence_text: string | null;
  confidence: number;
}

function text(value: unknown, fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

async function assertQuickUpdatePermission(client: Client, orgId: string, userId: string, areaId: string | null) {
  const { data: membership, error } = await client
    .from("memberships")
    .select("id, role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!membership) throw new Error("Sem acesso à empresa");
  if (!areaId) {
    if (membership.role === "owner") return membership;
    throw new Error("Coordenador só pode atualizar a própria área");
  }

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
    throw new Error("Coordenador só pode atualizar a própria área");
  }
  return membership;
}

function words(value: string) {
  return normalizeTextForRouting(value)
    .split(/\W+/)
    .filter((word) => word.length >= 3);
}

function similarity(message: string, candidate: QuickCandidate) {
  const source = new Set(words(message));
  if (!source.size) return 0;
  const target = words(`${candidate.label} ${candidate.objectiveTitle}`);
  const hits = target.filter((word) => source.has(word)).length;
  return hits / Math.max(1, Math.min(source.size, target.length));
}

function fallbackExtract(message: string, candidates: QuickCandidate[]): ExtractedUpdate {
  const normalized = normalizeTextForRouting(message);
  const ranked = candidates
    .map((candidate) => ({ candidate, score: similarity(message, candidate) }))
    .sort((a, b) => b.score - a.score);
  const operation: QuickOperation = /(conclu|finaliz|terminei|feito|pronto)/.test(normalized)
    ? "mark_done"
    : /(evidencia|comprov|prova|registro)/.test(normalized)
      ? "add_evidence"
      : /(progresso|avanc|%)|(\b\d{1,3}\s*%)/.test(normalized)
        ? "set_progress"
        : "none";
  const progressMatch = normalized.match(/\b(\d{1,3})\s*%/);
  const progress = progressMatch ? Math.min(100, Math.max(0, Number(progressMatch[1]))) : null;
  return {
    target_code: ranked[0]?.score ? ranked[0].candidate.code : null,
    operation,
    progress,
    status: operation === "mark_done" ? "done" : null,
    evidence_text: operation === "add_evidence" ? message : null,
    confidence: ranked[0]?.score ?? 0,
  };
}

function formatCandidate(candidate: QuickCandidate) {
  return `${candidate.code}: [${candidate.kind === "action" ? "Ação" : "Objetivo"}] ${candidate.label} | objetivo: ${candidate.objectiveTitle} | status: ${candidate.status}${candidate.progress != null ? ` | progresso: ${candidate.progress}%` : ""}`;
}

async function loadCandidates(client: Client, orgId: string, areaId: string | null): Promise<QuickCandidate[]> {
  const [{ data: objectives }, { data: keyActions }, { data: areas }] = await Promise.all([
    client.from("objectives").select("*").eq("org_id", orgId).order("created_at"),
    client.from("key_actions").select("*").eq("org_id", orgId).order("created_at"),
    client.from("areas").select("id").eq("org_id", orgId).is("archived_at", null),
  ]);

  const activeAreaIds = new Set((areas ?? []).map((area: any) => area.id));
  const scopedObjectives = (objectives ?? []).filter((objective: any) => {
    if (objective.area_id && !activeAreaIds.has(objective.area_id)) return false;
    return !areaId || objective.area_id === areaId;
  });
  const month = currentMonthPeriod();
  let monthlyObjectives = scopedObjectives.filter((objective: any) => objective.level === "monthly" && String(objective.period ?? "").toLowerCase() === month.toLowerCase());
  if (!monthlyObjectives.length) monthlyObjectives = scopedObjectives.filter((objective: any) => objective.level === "monthly");
  if (!monthlyObjectives.length) monthlyObjectives = scopedObjectives;

  const objectiveById = new Map(scopedObjectives.map((objective: any) => [objective.id, objective]));
  const monthlyIds = new Set(monthlyObjectives.map((objective: any) => objective.id));
  const candidates: QuickCandidate[] = [];

  let actionIndex = 1;
  for (const action of keyActions ?? []) {
    const objective = objectiveById.get(action.objective_id);
    if (!objective || (monthlyIds.size && !monthlyIds.has(action.objective_id))) continue;
    candidates.push({
      code: `A${actionIndex++}`,
      kind: "action",
      id: action.id,
      label: text(action.description, "Ação sem descrição"),
      objectiveId: action.objective_id,
      objectiveTitle: text(objective.title, "Objetivo sem título"),
      areaId: objective.area_id ?? null,
      status: text(action.status, "on_track"),
      progress: null,
    });
  }

  let objectiveIndex = 1;
  for (const objective of monthlyObjectives) {
    candidates.push({
      code: `O${objectiveIndex++}`,
      kind: "objective",
      id: objective.id,
      label: text(objective.title, "Objetivo sem título"),
      objectiveId: objective.id,
      objectiveTitle: text(objective.title, "Objetivo sem título"),
      areaId: objective.area_id ?? null,
      status: text(objective.status, "on_track"),
      progress: Number(objective.progress ?? 0),
    });
  }

  return candidates.slice(0, 60);
}

async function extractUpdateWithAi(
  client: Client,
  params: { orgId: string; areaId: string | null; message: string; candidates: QuickCandidate[]; channel: "web" | "whatsapp"; conversationId?: string | null },
) {
  const aiRoute = await resolveAiFunction(client, params.orgId, "background");
  if (!aiRoute) return fallbackExtract(params.message, params.candidates);

  const context = await buildPlanContext(client, params.orgId, { areaId: params.areaId, focus: "monthly" });
  const systemPrompt = [
    "Você extrai uma atualização curta enviada ao Oráculo.",
    'Responda somente JSON válido no formato: {"target_code":"A1|O1|null","operation":"mark_done|set_progress|set_status|add_evidence|none","progress":0,"status":"on_track|at_risk|late|done|null","evidence_text":"string|null","confidence":0.0}',
    "Use target_code apenas da lista de candidatos. Se houver dúvida entre dois ou mais candidatos, use target_code null e confidence baixa.",
    "mark_done significa marcar ação ou objetivo como concluído. set_progress usa progress de 0 a 100. add_evidence insere uma evidência curta.",
    "Não invente alvo. Não invente número de progresso.",
    "Contexto do plano:",
    context,
    "Candidatos:",
    params.candidates.map(formatCandidate).join("\n") || "Nenhum candidato disponível.",
  ].join("\n\n");

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
      metadata: { aiFunction: "background", action: "quick_update_extract", areaId: params.areaId, conversationId: params.conversationId ?? null },
    });
    const parsed = parseJsonObject(result.text) as any;
    return {
      target_code: parsed?.target_code ? String(parsed.target_code) : null,
      operation: ["mark_done", "set_progress", "set_status", "add_evidence", "none"].includes(parsed?.operation) ? parsed.operation as QuickOperation : "none",
      progress: parsed?.progress == null ? null : Math.min(100, Math.max(0, Number(parsed.progress))),
      status: ["on_track", "at_risk", "late", "done"].includes(parsed?.status) ? parsed.status : null,
      evidence_text: parsed?.evidence_text ? String(parsed.evidence_text) : null,
      confidence: Math.max(0, Math.min(1, Number(parsed?.confidence ?? 0))),
    } satisfies ExtractedUpdate;
  } catch (error) {
    console.error("Erro ao extrair atualização rápida", error instanceof Error ? error.message : String(error));
    return fallbackExtract(params.message, params.candidates);
  }
}

function operationFromAmbiguousReply(text: string): QuickOperation {
  const normalized = normalizeTextForRouting(text);
  if (normalized.includes("atualizar progresso")) return "set_progress";
  if (normalized.includes("registrar evidencia")) return "add_evidence";
  if (normalized.includes("marcar como concluida")) return "mark_done";
  return "mark_done";
}

async function previousAmbiguousChoice(client: Client, conversationId: string, message: string, candidates: QuickCandidate[]) {
  const choiceMatch = normalizeTextForRouting(message).match(/^([1-3])(?:\s+(.+))?$/);
  const choice = choiceMatch?.[1];
  if (!choice) return null;

  const { data, error } = await client
    .from("chat_messages")
    .select("text")
    .eq("conversation_id", conversationId)
    .eq("author", "oracle")
    .ilike("text", "%Escolha uma opção%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.text) return null;

  const lines = String(data.text).split("\n");
  const selected = lines
    .map((line) => line.match(/^(\d+)\.\s+\[(Ação|Objetivo)\]\s+(.+)$/))
    .find((match) => match?.[1] === choice);
  const label = selected?.[3]?.trim();
  if (!label) return null;
  const candidate = candidates.find((item) => item.label === label);
  if (!candidate) return null;
  const operation = operationFromAmbiguousReply(data.text);
  const detail = choiceMatch?.[2]?.trim() ?? "";
  const progressMatch = detail.match(/\b(\d{1,3})\s*%?/);
  return {
    target_code: candidate.code,
    operation,
    progress: operation === "set_progress" && progressMatch ? Math.min(100, Math.max(0, Number(progressMatch[1]))) : null,
    status: operation === "mark_done" ? "done" as const : null,
    evidence_text: operation === "add_evidence" && detail ? detail : null,
    confidence: 1,
  };
}

function ambiguousReply(candidates: QuickCandidate[], operation: QuickOperation) {
  const visible = candidates.slice(0, 3);
  const actionLabel = operation === "mark_done" ? "marcar como concluída" : operation === "set_progress" ? "atualizar progresso" : "registrar evidência";
  const instruction = operation === "mark_done"
    ? "Escolha uma opção respondendo só o número:"
    : operation === "set_progress"
      ? "Escolha uma opção respondendo o número e o percentual. Exemplo: 1 60%"
      : "Escolha uma opção respondendo o número e a evidência. Exemplo: 1 contrato assinado hoje";
  return [
    `Encontrei mais de uma possibilidade. ${instruction}`,
    ...visible.map((candidate, index) => `${index + 1}. [${candidate.kind === "action" ? "Ação" : "Objetivo"}] ${candidate.label}`),
    `Quando escolher, vou aplicar: ${actionLabel}.`,
  ].join("\n");
}

async function applyUpdate(
  client: Client,
  params: { orgId: string; userId: string; candidate: QuickCandidate; extracted: ExtractedUpdate },
) {
  const operation = params.extracted.operation;
  const evidenceText = text(params.extracted.evidence_text);

  if (params.candidate.kind === "action") {
    const updates: Record<string, unknown> = {};
    if (operation === "mark_done") updates.status = "done";
    if (operation === "set_status" && params.extracted.status) updates.status = params.extracted.status;
    if (Object.keys(updates).length) {
      const { error } = await client.from("key_actions").update(updates).eq("id", params.candidate.id).eq("org_id", params.orgId);
      if (error) throw error;
    }
    if (evidenceText) {
      const { error } = await client.from("evidences").insert({
        org_id: params.orgId,
        objective_id: params.candidate.objectiveId,
        text: evidenceText,
        created_by: params.userId,
      });
      if (error) throw error;
    }
    const suffix = evidenceText ? " Também registrei a evidência." : "";
    return operation === "add_evidence"
      ? `Registrei a evidência em "${params.candidate.objectiveTitle}".`
      : `Feito, atualizei a ação "${params.candidate.label}".${suffix}`;
  }

  const updates: Record<string, unknown> = {};
  if (operation === "mark_done") {
    updates.status = "done";
    updates.progress = 100;
  }
  if (operation === "set_progress" && params.extracted.progress != null) {
    updates.progress = params.extracted.progress;
    if (params.extracted.progress >= 100) updates.status = "done";
  }
  if (operation === "set_status" && params.extracted.status) updates.status = params.extracted.status;
  if (Object.keys(updates).length) {
    const { error } = await client.from("objectives").update(updates).eq("id", params.candidate.id).eq("org_id", params.orgId);
    if (error) throw error;
  }
  if (evidenceText) {
    const { error } = await client.from("evidences").insert({
      org_id: params.orgId,
      objective_id: params.candidate.objectiveId,
      text: evidenceText,
      created_by: params.userId,
    });
    if (error) throw error;
  }
  const suffix = evidenceText ? " Também registrei a evidência." : "";
  return operation === "add_evidence"
    ? `Registrei a evidência no objetivo "${params.candidate.label}".`
    : `Feito, atualizei o objetivo "${params.candidate.label}".${suffix}`;
}

export async function handleQuickUpdate(
  client: Client,
  params: { orgId: string; areaId: string | null; userId: string; conversationId: string; message: string; channel: "web" | "whatsapp" },
) {
  const candidates = await loadCandidates(client, params.orgId, params.areaId);
  if (!candidates.length) {
    return {
      handled: true,
      reply: "Ainda não encontrei objetivos ou ações do mês para atualizar. Crie o plano mensal primeiro, ou me diga o nome exato do objetivo que recebeu avanço.",
    };
  }

  const selectedFromPrevious = await previousAmbiguousChoice(client, params.conversationId, params.message, candidates);
  const extracted = selectedFromPrevious ?? await extractUpdateWithAi(client, {
    orgId: params.orgId,
    areaId: params.areaId,
    message: params.message,
    candidates,
    channel: params.channel,
    conversationId: params.conversationId,
  });

  const target = candidates.find((candidate) => candidate.code === extracted.target_code) ?? null;
  const ranked = candidates
    .map((candidate) => ({ candidate, score: similarity(params.message, candidate) }))
    .sort((a, b) => b.score - a.score);
  const operation = extracted.operation === "none" ? fallbackExtract(params.message, candidates).operation : extracted.operation;

  if (!target || extracted.confidence < 0.72 || (ranked[1] && ranked[0].score > 0 && ranked[0].score - ranked[1].score < 0.12 && !selectedFromPrevious)) {
    return { handled: true, reply: ambiguousReply(ranked.map((item) => item.candidate), operation) };
  }

  if (operation === "none") {
    return {
      handled: true,
      reply: "Entendi que há uma atualização, mas ainda não ficou claro o que mudou. Foi conclusão, progresso em percentual ou evidência?",
    };
  }
  if (operation === "set_progress" && extracted.progress == null) {
    return {
      handled: true,
      reply: `Qual percentual devo registrar para "${target.label}"? Responda, por exemplo: 60%.`,
    };
  }
  if (operation === "set_progress" && target.kind === "action") {
    return {
      handled: true,
      reply: `A ação "${target.label}" não tem percentual próprio. Posso marcar como concluída ou registrar uma evidência nela. O progresso percentual fica no objetivo mensal.`,
    };
  }
  if (operation === "add_evidence" && !text(extracted.evidence_text)) {
    return {
      handled: true,
      reply: `Qual evidência devo registrar em "${target.label}"? Me mande o fato concreto em uma frase.`,
    };
  }

  await assertQuickUpdatePermission(client, params.orgId, params.userId, target.areaId);
  const reply = await applyUpdate(client, {
    orgId: params.orgId,
    userId: params.userId,
    candidate: target,
    extracted: { ...extracted, operation },
  });
  return { handled: true, reply };
}
