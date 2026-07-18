import { normalizeQuarterlySharedActions } from "./quarterly-actions.ts";
import { normalizeQuarterlyKpiLink, normalizeQuarterlyKpiLinks, quarterlyKpiKey, quarterlyKpiLabel } from "./quarterly-kpis.ts";
import { normalizeMonthlyContinuity } from "./monthly-continuity.ts";

type Client = any;

type PlanDocumentType = "strategic" | "quarterly" | "monthly" | "month_close" | "quarter_close";

type PlanDocumentPreviewInput = {
  organizationName: string;
  areaName?: string | null;
  managerName: string;
  sessionId?: string;
  sessionType: string;
  period: string;
};

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asObjectiveType(value: unknown) {
  const text = asText(value).toLowerCase();
  if (text === "seed" || text.includes("plantio") || text.includes("evolu")) return "evolucao";
  return "resultado";
}

function yearFromPeriod(period: string) {
  const match = period.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function quarterKey(period: string) {
  const normalized = period.toLowerCase();
  if (normalized.includes("1") || normalized.includes("q1") || normalized.includes("t1")) return "q1";
  if (normalized.includes("2") || normalized.includes("q2") || normalized.includes("t2")) return "q2";
  if (normalized.includes("4") || normalized.includes("q4") || normalized.includes("t4")) return "q4";
  return "q3";
}

function firstFilledArray<T = any>(...values: unknown[]) {
  for (const value of values) {
    const list = asArray<T>(value).filter((item) => String(item ?? "").trim());
    if (list.length) return list;
    if (typeof value === "string" || typeof value === "number") {
      const text = asText(value);
      if (text) return [text as T];
    }
  }
  return [];
}

function compactLines(values: unknown[]) {
  return values.map((value) => asText(value)).filter(Boolean);
}

function normalizeActions(actions: unknown, objectiveNumber: number | string) {
  return asArray<any>(actions).map((action, index) => ({
    codigo: `${objectiveNumber}.${index + 1}`,
    descricao: asText(action.description ?? action.descricao, "Ação-chave"),
    prazo: asText(action.deadline ?? action.prazo),
    responsavel: asText(action.owner ?? action.responsavel),
    criterio: asText(action.completionCriterion ?? action.completion_criterion ?? action.criterio),
    status: asText(action.status),
  }));
}

function normalizeObjective(objective: any, index: number, fallbackTitle: string) {
  const number = index + 1;
  const kpiLinks = asArray(objective.kpiLinks ?? objective.kpi_links)
    .map(normalizeQuarterlyKpiLink)
    .map((link) => typeof link === "string" ? { kpiKey: link } : link as Record<string, unknown>)
    .filter((link) => quarterlyKpiKey(link.kpiKey ?? link.kpi_key))
    .map((link) => ({
      chave: quarterlyKpiKey(link.kpiKey ?? link.kpi_key),
      nome: quarterlyKpiLabel(link.kpiKey ?? link.kpi_key),
      justificativa: asText(link.rationale ?? link.justificativa),
    }));
  return {
    origem_id: asText(objective.id ?? objective.objectiveId ?? objective.objective_id),
    numero: number,
    titulo: asText(objective.title ?? objective.titulo, fallbackTitle),
    vinculo: asText(objective.parentTitle ?? objective.vinculo ?? objective.linkedObjectiveTitle ?? objective.objetivo_anual),
    vinculo_id: asText(
      objective.parentId
        ?? objective.parent_id
        ?? objective.linkedStrategicObjectiveId
        ?? objective.linked_strategic_objective_id
        ?? objective.linkedQuarterlyObjectiveId
        ?? objective.linked_quarterly_objective_id,
    ),
    tipo: asObjectiveType(objective.type ?? objective.tipo),
    resultado: asText(objective.result ?? objective.resultado),
    indicador: asText(objective.metric ?? objective.indicador),
    meta: asText(objective.target ?? objective.meta),
    atual: asText(objective.current ?? objective.valor_atual),
    fonte: asText(objective.source ?? objective.fonte ?? objective.evidencePlan ?? objective.evidence_plan),
    responsavel: asText(objective.owner ?? objective.responsavel),
    prazo: asText(objective.deadline ?? objective.prazo),
    entregas: firstFilledArray<string>(objective.deliverables, objective.entregas),
    estrategias: firstFilledArray<string>(objective.strategies, objective.estrategias),
    acoes: normalizeActions(objective.actions ?? objective.acoes, number),
    vinculos_kpi: kpiLinks,
    status_final: asText(objective.statusFinal ?? objective.status_final ?? objective.status),
    progresso_final: objective.progressFinal ?? objective.progress_final ?? objective.progress ?? null,
    evidencia: asText(objective.evidence ?? objective.evidencia),
    decisao: asText(objective.decision ?? objective.decisao),
  };
}

async function loadDocumentBase(client: Client, session: any, documentType: PlanDocumentType, proposal: any) {
  const [{ data: organization, error: orgError }, profileResult] = await Promise.all([
    client.from("organizations").select("name").eq("id", session.org_id).maybeSingle(),
    client.from("profiles").select("full_name, email").eq("id", session.user_id).maybeSingle(),
  ]);
  if (orgError) throw orgError;
  if (profileResult.error) throw profileResult.error;

  let area = null;
  if (session.area_id) {
    const { data, error } = await client.from("areas").select("name").eq("id", session.area_id).eq("org_id", session.org_id).maybeSingle();
    if (error) throw error;
    area = data;
  }

  return {
    empresa: asText(organization?.name, "Empresa"),
    area: area?.name ?? null,
    tipo: documentType,
    periodo: asText(proposal.period ?? proposal.periodo, session.period),
    gestor: asText(profileResult.data?.full_name ?? profileResult.data?.email),
    rastreabilidade: {
      schema_version: 1,
      origem: "proposta_confirmada",
      sessao_id: asText(session.id),
      tipo_sessao: asText(session.type),
    },
    contexto_rapido: firstFilledArray<string>(proposal.context, proposal.contexto, proposal.contexto_rapido),
  };
}

function buildStrategicContent(base: Record<string, unknown>, proposal: any) {
  const year = Number(proposal.year ?? yearFromPeriod(String(base.periodo ?? "")));
  const drivers = proposal.drivers ?? {};
  const swot = proposal.swot ?? {};
  const themes = firstFilledArray<string>(proposal.themes, proposal.temas, [proposal.theme, proposal.tema_do_ano]);
  const objectives = asArray<any>(proposal.objectives).map((objective, index) => normalizeObjective(objective, index, "Objetivo estratégico"));
  const projects = asArray<any>(proposal.projects).map((project) => ({
    nome: asText(project.name ?? project.nome, "Projeto estratégico"),
    responsavel: asText(project.owner ?? project.responsavel),
    prazo: asText(project.deadline ?? project.prazo),
    vinculo: asText(project.linkedObjectiveTitle ?? project.vinculo),
  }));

  return {
    ...base,
    periodo: String(year),
    contexto_rapido: compactLines([
      proposal.executiveSummary ?? proposal.executive_summary,
      themes[0] ? `Tema do ano: ${themes[0]}` : "",
      objectives.length ? `${objectives.length} objetivo(s) estratégico(s) priorizado(s).` : "",
    ]),
    referencia: {
      objetivo_anual: "Plano anual da empresa",
      objetivos_trimestre: [],
    },
    objetivos: objectives,
    foco_aprendizado: firstFilledArray<string>(proposal.learningFocus, proposal.foco_aprendizado),
    checagem_realismo: { cabe: true, primeira_a_sair: "" },
    frase_de_foco: themes[0] ? `${year} é o ano de ${themes[0]}.` : `${year} é o ano de executar o essencial com cadência.`,
    strategic: {
      perfil: proposal.profile ?? {},
      direcionadores: {
        proposito: asText(drivers.purpose ?? drivers.proposito),
        visao: asText(drivers.vision ?? drivers.visao),
        valores: firstFilledArray<string>(drivers.values, drivers.valores),
      },
      swot: {
        forcas: firstFilledArray<string>(swot.strengths, swot.forcas),
        fraquezas: firstFilledArray<string>(swot.weaknesses, swot.fraquezas),
        oportunidades: firstFilledArray<string>(swot.opportunities, swot.oportunidades),
        ameacas: firstFilledArray<string>(swot.threats, swot.ameacas),
      },
      temas: themes,
      renuncias: firstFilledArray<string>(proposal.renunciations, proposal.renuncias),
      riscos: firstFilledArray<string>(proposal.risks, proposal.riscos, proposal.riscos_estrategicos),
      decisoes_pendentes: firstFilledArray<string>(proposal.pendingDecisions, proposal.pending_decisions, proposal.decisoes_pendentes),
      aprendizados_historicos: firstFilledArray<string>(proposal.historicalLessons, proposal.historical_lessons, proposal.aprendizados_historicos),
      projetos: projects,
      rituais: firstFilledArray<string>(proposal.rituals, proposal.rituais),
      resumo_executivo: asText(proposal.executiveSummary ?? proposal.executive_summary),
    },
  };
}

function buildQuarterlyContent(base: Record<string, unknown>, proposal: any, period: string) {
  proposal = normalizeQuarterlyKpiLinks(normalizeQuarterlySharedActions(proposal));
  const areaRole = proposal.areaRole ?? proposal.papel_area ?? {};
  const diagnosis = proposal.diagnosis ?? proposal.diagnostico ?? {};
  const annualObjectives = asArray<any>(proposal.annualObjectives ?? proposal.objetivos_anuais);
  const quarterlyObjectives = asArray<any>(proposal.quarterlyObjectives ?? proposal.objetivos_trimestre);
  const learningFocus = firstFilledArray<string>(proposal.learningFocus, proposal.foco_aprendizado);
  const annualAlignment = proposal.annualAlignment ?? proposal.alinhamento_anual ?? {};
  const annualException = asText(annualAlignment.status).toLowerCase() === "exception";
  const risks = firstFilledArray<string>(proposal.risks, proposal.riscos);
  const tradeOffs = firstFilledArray<string>(proposal.tradeOffs, proposal.trade_offs, proposal.renuncias);
  const cadence = asText(proposal.cadence ?? proposal.cadencia);
  const sharedActions = normalizeActions(proposal.sharedActions ?? proposal.acoesTransversais, "T");
  const annualReference = annualException
    ? `Exceção confirmada: ${asText(annualAlignment.rationale ?? annualAlignment.justificativa)}`
    : asText(annualAlignment.strategicObjectiveTitle ?? annualObjectives[0]?.title ?? annualObjectives[0]?.titulo);

  return {
    ...base,
    contexto_rapido: compactLines([
      asText(areaRole.mission ?? areaRole.missao),
      quarterlyObjectives.length ? `${quarterlyObjectives.length} objetivo(s) trimestral(is) para ${period}.` : "",
      learningFocus.length ? `Foco de aprendizado: ${learningFocus.join("; ")}` : "",
      risks.length ? `Riscos: ${risks.join("; ")}` : "",
      cadence ? `Acompanhamento: ${cadence}` : "",
    ]),
    referencia: {
      objetivo_anual: annualReference,
      objetivos_trimestre: quarterlyObjectives.map((objective) => asText(objective.title ?? objective.titulo)).filter(Boolean),
    },
    objetivos: quarterlyObjectives.map((objective, index) => normalizeObjective(objective, index, "Objetivo trimestral")),
    foco_aprendizado: learningFocus,
    checagem_realismo: { cabe: quarterlyObjectives.length <= 3, primeira_a_sair: tradeOffs[0] ?? "" },
    frase_de_foco: `No ${period}, o foco é transformar prioridade em entrega visível.`,
    quarterly: {
      papel_area: {
        missao: asText(areaRole.mission ?? areaRole.missao),
        contribuicao: firstFilledArray<string>(areaRole.contribution, areaRole.contribuicao),
      },
      diagnostico: {
        forcas: firstFilledArray<string>(diagnosis.strengths, diagnosis.forcas),
        gargalos: firstFilledArray<string>(diagnosis.weaknesses, diagnosis.gargalos, diagnosis.fraquezas),
      },
      alinhamento_anual: {
        status: asText(annualAlignment.status),
        objetivo: asText(annualAlignment.strategicObjectiveTitle),
        justificativa: asText(annualAlignment.rationale ?? annualAlignment.justificativa),
      },
      objetivos_anuais: annualObjectives.map((objective, index) => normalizeObjective(objective, index, "Objetivo anual da área")),
      riscos: risks,
      trade_offs: tradeOffs,
      cadencia: cadence,
      acoes_transversais: sharedActions,
    },
  };
}

function buildMonthlyContent(base: Record<string, unknown>, proposal: any, period: string) {
  proposal = normalizeMonthlyContinuity(proposal);
  const objectives = asArray<any>(proposal.objectives ?? proposal.objetivos_mes);
  const learningFocus = firstFilledArray<string>(proposal.learningFocus, proposal.foco_aprendizado);
  const quarterlyAlignment = proposal.quarterlyAlignment ?? proposal.alinhamento_trimestral ?? {};
  const quarterlyException = asText(quarterlyAlignment.status).toLowerCase() === "exception";
  const quarterlyReferences = firstFilledArray<string>(
    quarterlyException
      ? [`Exceção confirmada: ${asText(quarterlyAlignment.rationale ?? quarterlyAlignment.justificativa)}`]
      : [],
    quarterlyAlignment.quarterlyObjectiveTitle,
    proposal.objetivos_trimestre,
    asArray<any>(proposal.quarterlyObjectives).map((objective) => asText(objective.title ?? objective.titulo ?? objective)),
    objectives.map((objective) => objective.parentTitle ?? objective.vinculo),
  );
  const backlog = firstFilledArray<string>(proposal.backlog, proposal.tradeOffs, proposal.trade_offs, proposal.renuncias);
  const risks = firstFilledArray<string>(proposal.risks, proposal.riscos);
  const blockers = firstFilledArray<string>(proposal.blockers, proposal.bloqueios);
  const cadence = asText(proposal.cadence ?? proposal.cadencia);
  const confidence = asText(proposal.confidence ?? proposal.confianca);
  const nextCommitment = asText(proposal.nextCommitment ?? proposal.proximo_compromisso);
  const pendingDecisions = asArray<any>(proposal.pendingDecisions ?? proposal.decisoes_pendentes).map((decision) => ({
    item: asText(decision.item ?? decision.pendencia),
    origem: asText(decision.origin ?? decision.origem),
    motivo: asText(decision.reason ?? decision.motivo),
    decisao: asText(decision.decision ?? decision.decisao),
  }));
  const totalActions = objectives.reduce(
    (total, objective) => total + asArray(objective.actions ?? objective.acoes).length,
    0,
  );
  const maxCommittedActions = Number(proposal.capacity?.maxCommittedActions ?? proposal.capacidade?.maximo_acoes ?? 5);

  return {
    ...base,
    contexto_rapido: compactLines([
      objectives.length ? `${objectives.length} resultado(s) mensal(is) para ${period}.` : "",
      risks.length ? `Riscos: ${risks.join("; ")}` : "",
      blockers.length ? `Bloqueios: ${blockers.join("; ")}` : "",
      cadence ? `Acompanhamento: ${cadence}` : "",
      confidence ? `Confiança: ${confidence}` : "",
      nextCommitment ? `Próximo compromisso: ${nextCommitment}` : "",
    ]),
    referencia: {
      objetivo_anual: asText(proposal.annualObjective ?? proposal.objetivo_anual),
      objetivos_trimestre: quarterlyReferences,
    },
    objetivos: objectives.map((objective, index) => normalizeObjective(objective, index, "Objetivo mensal")),
    foco_aprendizado: learningFocus,
    checagem_realismo: {
      cabe: totalActions <= maxCommittedActions,
      primeira_a_sair: backlog[0] ?? asText(proposal.realism?.firstToRemove ?? proposal.realismo?.primeira_a_sair),
    },
    frase_de_foco: asText(proposal.focusPhrase ?? proposal.frase_de_foco, `${period} é o mês de executar poucas coisas muito bem.`),
    monthly: {
      alinhamento_trimestral: {
        status: asText(quarterlyAlignment.status),
        objetivo_id: asText(quarterlyAlignment.quarterlyObjectiveId ?? quarterlyAlignment.quarterly_objective_id),
        objetivo: asText(quarterlyAlignment.quarterlyObjectiveTitle ?? quarterlyAlignment.quarterly_objective_title),
        justificativa: asText(quarterlyAlignment.rationale ?? quarterlyAlignment.justificativa),
      },
      capacidade: {
        maximo_acoes_comprometidas: maxCommittedActions,
        acoes_comprometidas: totalActions,
      },
      decisoes_pendentes: pendingDecisions,
      backlog,
      riscos: risks,
      bloqueios: blockers,
      cadencia: cadence,
      confianca: confidence,
      proximo_compromisso: nextCommitment,
    },
  };
}

function buildCloseContent(base: Record<string, unknown>, proposal: any, period: string, documentType: PlanDocumentType) {
  const reviews = asArray<any>(proposal.reviews ?? proposal.revisao ?? proposal.revisao_tri);
  const completionRate = proposal.completionRate ?? proposal.completion_rate ?? null;
  const learning = firstFilledArray<string>(proposal.learnings, proposal.aprendizados, proposal.learningBalance, proposal.learning_balance);
  const pendencies = firstFilledArray<string>(
    proposal.pendencies,
    proposal.pendencias,
    reviews.filter((review) => asText(review.decision ?? review.decisao)).map((review) => `${asText(review.title ?? review.titulo ?? review.objectiveTitle)}: ${asText(review.decision ?? review.decisao)}`),
  );

  return {
    ...base,
    referencia: {
      objetivo_anual: "",
      objetivos_trimestre: [],
    },
    objetivos: reviews.map((review, index) => normalizeObjective(review, index, documentType === "month_close" ? "Objetivo mensal revisado" : "Objetivo trimestral revisado")),
    foco_aprendizado: firstFilledArray<string>(proposal.nextLearningFocus, proposal.next_learning_focus),
    checagem_realismo: { cabe: true, primeira_a_sair: "" },
    frase_de_foco: asText(proposal.focusPhrase ?? proposal.frase_de_foco, `Fechamento de ${period}: aprender, decidir e seguir leve.`),
    fechamento: {
      resumo: asText(proposal.summary ?? proposal.resumo, `Fechamento de ${period}`),
      percentual: completionRate,
      aprendizados: learning,
      pendencias: pendencies,
      decisoes: reviews.map((review) => asText(review.decision ?? review.decisao)).filter(Boolean),
      proximo_periodo: asText(proposal.nextPeriod ?? proposal.next_period),
    },
  };
}

export function buildPlanDocumentPreview(proposal: any, input: PlanDocumentPreviewInput) {
  const proposalType = asText(proposal?.type);
  const documentType = documentTypeFromProposalType(proposalType);
  if (!documentType) return null;
  const period = asText(proposal.period ?? proposal.periodo, input.period);
  const base = {
    empresa: asText(input.organizationName, "Empresa"),
    area: input.areaName ?? null,
    tipo: documentType,
    periodo: period,
    gestor: asText(input.managerName),
    rastreabilidade: {
      schema_version: 1,
      origem: "proposta_confirmada",
      sessao_id: asText(input.sessionId, "SESSION_FIXTURE"),
      tipo_sessao: asText(input.sessionType),
    },
    contexto_rapido: firstFilledArray<string>(proposal.context, proposal.contexto, proposal.contexto_rapido),
  };

  if (proposalType === "save_strategic_plan") return buildStrategicContent(base, proposal);
  if (proposalType === "save_quarterly_plan") return buildQuarterlyContent(base, proposal, period);
  if (proposalType === "save_monthly_plan") return buildMonthlyContent(base, proposal, period);
  if (proposalType === "month_close" || proposalType === "quarter_close") {
    return buildCloseContent(base, proposal, period, documentType);
  }
  return null;
}

async function savePlanDocument(
  client: Client,
  session: any,
  userId: string,
  documentType: PlanDocumentType,
  period: string,
  title: string,
  content: Record<string, unknown>,
) {
  let query = client
    .from("plan_documents")
    .select("version")
    .eq("org_id", session.org_id)
    .eq("type", documentType)
    .eq("period", period)
    .order("version", { ascending: false })
    .limit(1);
  query = session.area_id ? query.eq("area_id", session.area_id) : query.is("area_id", null);

  const { data: latest, error: latestError } = await query.maybeSingle();
  if (latestError) throw latestError;

  const version = Number(latest?.version ?? 0) + 1;
  const { data, error } = await client
    .from("plan_documents")
    .insert({
      org_id: session.org_id,
      area_id: session.area_id ?? null,
      session_id: session.id,
      type: documentType,
      origin: "session",
      period,
      title,
      content,
      version,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function createDocumentForProposal(client: Client, session: any, proposal: any, userId: string) {
  const proposalType = asText(proposal?.type);
  const period = asText(proposal.period ?? proposal.periodo, session.period);

  if (proposalType === "save_strategic_plan") {
    const documentType = "strategic";
    const base = await loadDocumentBase(client, session, documentType, proposal);
    const year = String(proposal.year ?? yearFromPeriod(period));
    return await savePlanDocument(client, session, userId, documentType, year, `Plano Estratégico ${year}`, buildStrategicContent(base, proposal));
  }

  if (proposalType === "save_quarterly_plan") {
    const documentType = "quarterly";
    const base = await loadDocumentBase(client, session, documentType, proposal);
    return await savePlanDocument(client, session, userId, documentType, period, `Plano Trimestral ${base.area ?? "Área"} · ${period}`, buildQuarterlyContent(base, proposal, period));
  }

  if (proposalType === "save_monthly_plan") {
    const documentType = "monthly";
    const base = await loadDocumentBase(client, session, documentType, proposal);
    return await savePlanDocument(client, session, userId, documentType, period, `Plano Mensal ${base.area ?? "Área"} · ${period}`, buildMonthlyContent(base, proposal, period));
  }

  if (proposalType === "month_close") {
    const documentType = "month_close";
    const base = await loadDocumentBase(client, session, documentType, proposal);
    return await savePlanDocument(client, session, userId, documentType, period, `Fechamento Mensal ${base.area ?? "Área"} · ${period}`, buildCloseContent(base, proposal, period, documentType));
  }

  if (proposalType === "quarter_close") {
    const documentType = "quarter_close";
    const base = await loadDocumentBase(client, session, documentType, proposal);
    return await savePlanDocument(client, session, userId, documentType, period, `Fechamento Trimestral ${base.area ?? "Área"} · ${period}`, buildCloseContent(base, proposal, period, documentType));
  }

  return null;
}

export function documentTypeFromProposalType(proposalType: string): PlanDocumentType | null {
  if (proposalType === "save_strategic_plan") return "strategic";
  if (proposalType === "save_quarterly_plan") return "quarterly";
  if (proposalType === "save_monthly_plan") return "monthly";
  if (proposalType === "month_close") return "month_close";
  if (proposalType === "quarter_close") return "quarter_close";
  return null;
}
