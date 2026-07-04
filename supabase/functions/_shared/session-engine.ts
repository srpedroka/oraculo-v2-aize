import { resolveAiFunction } from "./ai-router.ts";
import { PERSONA_ORACULO, REGRAS_DE_SESSAO } from "./conductors/persona.ts";
import { MONTHLY_CONDUCTOR, MONTHLY_PHASES } from "./conductors/monthly.ts";
import { QUARTERLY_CONDUCTOR, QUARTERLY_PHASES } from "./conductors/quarterly.ts";
import { STRATEGIC_CONDUCTOR, STRATEGIC_PHASES } from "./conductors/strategic.ts";
import { parseJsonObject } from "./json.ts";
import { callModel } from "./model.ts";
import { applyProposal } from "./proposals.ts";
import { recordAiUsage } from "./usage.ts";

type Client = any;

export type PlanningSessionType = "strategic" | "quarterly" | "monthly" | "month_close" | "quarter_close";

const CONDUCTORS: Record<string, { phases: string[]; prompt: string; opening: string }> = {
  strategic: {
    phases: STRATEGIC_PHASES,
    prompt: STRATEGIC_CONDUCTOR,
    opening: "Vamos construir o Plano Estratégico anual com calma e método. Pelo contexto, vou considerar a empresa cadastrada no Oráculo. Qual é a principal dor da empresa hoje, em uma frase?",
  },
  quarterly: {
    phases: QUARTERLY_PHASES,
    prompt: QUARTERLY_CONDUCTOR,
    opening: "Vamos montar o plano do trimestre da área. Antes de começarmos: qual é o principal desafio da sua área hoje?",
  },
  monthly: {
    phases: MONTHLY_PHASES,
    prompt: MONTHLY_CONDUCTOR,
    opening: "Vamos montar um plano mensal enxuto e executável. Qual é o principal resultado que você quer enxergar, de forma concreta, até o fim deste mês na sua área?",
  },
};

function shallowMergeState(current: Record<string, unknown>, patch: Record<string, unknown>) {
  return { ...(current ?? {}), ...(patch ?? {}) };
}

function validNextPhase(type: string, nextPhase: unknown) {
  if (!nextPhase) return null;
  const text = String(nextPhase);
  return CONDUCTORS[type]?.phases.includes(text) ? text : null;
}

async function assertCanStartSession(client: Client, orgId: string, areaId: string | null, userId: string) {
  const { data: membership, error } = await client
    .from("memberships")
    .select("id, role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!membership) throw new Error("Sem acesso à empresa");
  if (membership.role === "owner" || !areaId) return membership;

  const { data: area, error: areaError } = await client
    .from("areas")
    .select("id")
    .eq("id", areaId)
    .eq("org_id", orgId)
    .eq("coordinator_id", membership.id)
    .maybeSingle();
  if (areaError) throw areaError;
  if (!area) throw new Error("Coordenador só pode iniciar sessão da própria área");
  return membership;
}

async function getOrCreateConversation(client: Client, orgId: string, userId: string, channel: "web" | "whatsapp", areaId: string | null) {
  const { data: existing, error } = await client
    .from("conversations")
    .select("*")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const { data, error: insertError } = await client
    .from("conversations")
    .insert({ org_id: orgId, user_id: userId, area_id: areaId, channel })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return data;
}

async function loadHistory(client: Client, conversationId: string) {
  const { data, error } = await client
    .from("chat_messages")
    .select("author, text")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []).reverse();
}

async function buildPlanContext(client: Client, orgId: string, areaId: string | null) {
  const [{ data: organization }, { data: areas }, { data: strategicPlan }, { data: areaPlans }, { data: objectives }, { data: keyActions }] =
    await Promise.all([
      client.from("organizations").select("name, subtitle").eq("id", orgId).maybeSingle(),
      client.from("areas").select("id, name, coordinator_id").eq("org_id", orgId).order("created_at"),
      client.from("strategic_plans").select("*").eq("org_id", orgId).order("year", { ascending: false }).limit(1).maybeSingle(),
      client.from("area_plans").select("*").eq("org_id", orgId),
      client.from("objectives").select("*").eq("org_id", orgId).order("created_at"),
      client.from("key_actions").select("*").eq("org_id", orgId).order("created_at"),
    ]);

  const area = areaId ? (areas ?? []).find((item: any) => item.id === areaId) : null;
  const relevantObjectives = areaId ? (objectives ?? []).filter((objective: any) => !objective.area_id || objective.area_id === areaId) : objectives ?? [];
  const lines = [
    `EMPRESA: ${organization?.name ?? "Empresa"}${organization?.subtitle ? ` (${organization.subtitle})` : ""}`,
    `PLANO ESTRATÉGICO: ${strategicPlan ? `ano ${strategicPlan.year}; temas ${JSON.stringify(strategicPlan.themes ?? [])}` : "ainda não cadastrado"}`,
    area ? `ÁREA EM FOCO: ${area.name}` : "ÁREA EM FOCO: organização inteira",
    "OBJETIVOS:",
    ...relevantObjectives.map((objective: any) => {
      const actions = (keyActions ?? []).filter((action: any) => action.objective_id === objective.id);
      const actionText = actions.length
        ? ` | ações: ${actions.map((action: any) => `[${action.status}] ${action.description} (${action.owner || "sem dono"}; ${action.deadline || "sem prazo"})`).join("; ")}`
        : "";
      return `- [${objective.level}/${objective.status}/${objective.progress}%] ${objective.title} | período ${objective.period} | dono ${objective.owner || "sem dono"} | meta ${objective.target || "sem meta"}${actionText}`;
    }),
    "PLANOS DA ÁREA:",
    ...((areaId ? (areaPlans ?? []).filter((plan: any) => plan.area_id === areaId) : areaPlans ?? []).map((plan: any) =>
      `- ano ${plan.year}; missão ${plan.role?.mission ?? ""}; foco ${JSON.stringify(plan.learning_focus ?? {})}`,
    )),
  ];
  return lines.join("\n");
}

function conductorPrompt(type: string, phase: string) {
  const conductor = CONDUCTORS[type];
  return [
    `ROTEIRO ATIVO: ${type}`,
    `Fase atual: ${phase}`,
    `Fases na ordem: ${conductor.phases.join(", ")}`,
    conductor.prompt,
  ].join("\n\n");
}

async function insertMessage(client: Client, session: any, author: "user" | "oracle", text: string, channel: "web" | "whatsapp") {
  const { error } = await client.from("chat_messages").insert({
    org_id: session.org_id,
    area_id: session.area_id,
    user_id: session.user_id,
    conversation_id: session.conversation_id,
    author,
    text,
    channel,
  });
  if (error) throw error;

  if (session.conversation_id) {
    await client.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", session.conversation_id);
  }
}

export async function startPlanningSession(
  client: Client,
  params: { orgId: string; areaId: string | null; type: PlanningSessionType; period: string; userId: string; channel?: "web" | "whatsapp" },
) {
  const conductor = CONDUCTORS[params.type];
  if (!conductor) throw new Error("Tipo de sessão ainda não disponível nesta fase");
  await assertCanStartSession(client, params.orgId, params.areaId, params.userId);

  const { data: existing, error: existingError } = await client
    .from("planning_sessions")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("user_id", params.userId)
    .eq("type", params.type)
    .eq("period", params.period)
    .eq("status", "active")
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { session: existing, reply: "Retomei sua sessão em andamento. Pode continuar de onde paramos." };

  const conversation = await getOrCreateConversation(client, params.orgId, params.userId, params.channel ?? "web", params.areaId);
  const { data: session, error } = await client
    .from("planning_sessions")
    .insert({
      org_id: params.orgId,
      area_id: params.areaId,
      user_id: params.userId,
      conversation_id: conversation.id,
      type: params.type,
      period: params.period,
      phase: conductor.phases[0],
      state: { periodo: params.period },
    })
    .select("*")
    .single();
  if (error) throw error;

  await insertMessage(client, session, "oracle", conductor.opening, params.channel ?? "web");
  return { session, reply: conductor.opening };
}

export async function processPlanningMessage(
  client: Client,
  params: { sessionId: string; message: string; userId: string; channel?: "web" | "whatsapp" },
) {
  const { data: session, error } = await client.from("planning_sessions").select("*").eq("id", params.sessionId).maybeSingle();
  if (error) throw error;
  if (!session) throw new Error("Sessão não encontrada");
  if (session.user_id !== params.userId) throw new Error("Sessão pertence a outro usuário");
  if (session.status !== "active") throw new Error("Sessão não está ativa");

  const aiRoute = await resolveAiFunction(client, session.org_id, "planning");
  if (!aiRoute) throw new Error("IA de planejamento não configurada");

  await insertMessage(client, session, "user", params.message, params.channel ?? "web");
  const [history, context] = await Promise.all([
    loadHistory(client, session.conversation_id),
    buildPlanContext(client, session.org_id, session.area_id),
  ]);

  const systemPrompt = [
    PERSONA_ORACULO,
    REGRAS_DE_SESSAO,
    conductorPrompt(session.type, session.phase),
    "Estado já coletado:",
    JSON.stringify(session.state ?? {}, null, 2),
    "Contexto atual do plano:",
    context,
  ].join("\n\n");

  const result = await callModel(
    aiRoute.provider,
    aiRoute.model,
    aiRoute.apiKey,
    systemPrompt,
    history.map((item: any) => ({ role: item.author === "oracle" ? "assistant" : "user", content: item.text })),
    aiRoute.limits,
  );

  await recordAiUsage({
    client,
    orgId: session.org_id,
    provider: aiRoute.provider,
    model: aiRoute.model,
    channel: params.channel ?? "web",
    usage: result.usage,
    settings: aiRoute.legacySettings,
    metadata: { aiFunction: "planning", sessionId: session.id, sessionType: session.type, phase: session.phase },
  });

  const parsed = parseJsonObject(result.text) as any;
  const reply = typeof parsed?.reply === "string" ? parsed.reply : result.text;
  const statePatch = parsed?.state_patch && typeof parsed.state_patch === "object" ? parsed.state_patch : {};
  const nextPhase = validNextPhase(session.type, parsed?.next_phase) ?? session.phase;
  const pendingProposal = parsed?.proposal ?? null;
  const nextState = shallowMergeState(session.state ?? {}, statePatch);

  const { data: updated, error: updateError } = await client
    .from("planning_sessions")
    .update({
      phase: nextPhase,
      state: nextState,
      pending_proposal: pendingProposal,
      status: parsed?.done === true ? "completed" : "active",
      completed_at: parsed?.done === true ? new Date().toISOString() : null,
    })
    .eq("id", session.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await insertMessage(client, updated, "oracle", reply, params.channel ?? "web");
  return { session: updated, reply, pendingProposal };
}

export async function confirmPlanningProposal(client: Client, params: { sessionId: string; userId: string; channel?: "web" | "whatsapp" }) {
  const { data: session, error } = await client.from("planning_sessions").select("*").eq("id", params.sessionId).maybeSingle();
  if (error) throw error;
  if (!session) throw new Error("Sessão não encontrada");
  if (session.user_id !== params.userId) throw new Error("Sessão pertence a outro usuário");
  if (!session.pending_proposal) throw new Error("Não há proposta pendente para confirmar");

  const summary = await applyProposal(client, session, session.pending_proposal, params.userId);
  const reply = `${summary} O plano já está salvo no sistema.`;
  const { data: updated, error: updateError } = await client
    .from("planning_sessions")
    .update({
      pending_proposal: null,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", session.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await insertMessage(client, updated, "oracle", reply, params.channel ?? "web");
  return { session: updated, reply };
}

export async function abandonPlanningSession(client: Client, params: { sessionId: string; userId: string }) {
  const { data: session, error } = await client
    .from("planning_sessions")
    .update({ status: "abandoned" })
    .eq("id", params.sessionId)
    .eq("user_id", params.userId)
    .select("*")
    .single();
  if (error) throw error;
  return { session, reply: "Sessão pausada. Quando quiser, você pode iniciar uma nova condução." };
}
