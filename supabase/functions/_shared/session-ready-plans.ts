import { PERSONA_ORACULO } from "./conductors/persona.ts";
import { MONTHLY_GUIDANCE_RULES } from "./monthly-guidance.ts";
import { UNTRUSTED_CONTENT_RULES } from "./untrusted-content.ts";

export function currentYearFromPeriod(period: string) {
  const match = period.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asTextArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => asText(item)).filter(Boolean);
  const text = asText(value);
  return text ? [text] : [];
}

function normalizeKpiLinks(value: unknown) {
  const allowed = new Set(["revenue", "operating_margin", "production", "cash"]);
  return asArray<any>(value)
    .map((item) => typeof item === "string" ? { kpiKey: asText(item), rationale: "" } : {
      kpiKey: asText(item?.kpiKey ?? item?.kpi_key),
      rationale: asText(item?.rationale ?? item?.justificativa),
    })
    .filter((item) => allowed.has(item.kpiKey))
    .slice(0, 2);
}

function kpiLinkLabels(value: unknown) {
  const labels: Record<string, string> = {
    revenue: "Faturamento",
    operating_margin: "Margem operacional",
    production: "Produção",
    cash: "Caixa",
  };
  return normalizeKpiLinks(value).map((item) => labels[item.kpiKey]).filter(Boolean);
}

export function normalizeReadyStrategicProposal(
  rawProposal: any,
  period: string,
  options: { fillMissingLabels?: boolean } = {},
) {
  const year = Number(rawProposal?.year ?? currentYearFromPeriod(period));
  const fillMissingLabels = options.fillMissingLabels ?? true;
  const drivers = rawProposal?.drivers && typeof rawProposal.drivers === "object" ? rawProposal.drivers : {};
  const swot = rawProposal?.swot && typeof rawProposal.swot === "object" ? rawProposal.swot : {};

  return {
    type: "save_strategic_plan",
    year,
    profile: rawProposal?.profile && typeof rawProposal.profile === "object" ? rawProposal.profile : {},
    drivers: {
      purpose: asText(drivers.purpose ?? drivers.proposito),
      vision: asText(drivers.vision ?? drivers.visao),
      values: asTextArray(drivers.values ?? drivers.valores).slice(0, 7),
    },
    swot: {
      strengths: asTextArray(swot.strengths ?? swot.forcas).slice(0, 8),
      weaknesses: asTextArray(swot.weaknesses ?? swot.fraquezas).slice(0, 8),
      opportunities: asTextArray(swot.opportunities ?? swot.oportunidades).slice(0, 8),
      threats: asTextArray(swot.threats ?? swot.ameacas).slice(0, 8),
    },
    themes: asTextArray(rawProposal?.themes ?? rawProposal?.temas ?? rawProposal?.theme ?? rawProposal?.tema_do_ano).slice(0, 4),
    renunciations: asTextArray(rawProposal?.renunciations ?? rawProposal?.renuncias).slice(0, 8),
    risks: asTextArray(rawProposal?.risks ?? rawProposal?.riscos ?? rawProposal?.riscos_estrategicos).slice(0, 8),
    pendingDecisions: asTextArray(rawProposal?.pendingDecisions ?? rawProposal?.pending_decisions ?? rawProposal?.decisoes_pendentes).slice(0, 8),
    historicalLessons: asTextArray(rawProposal?.historicalLessons ?? rawProposal?.historical_lessons ?? rawProposal?.aprendizados_historicos).slice(0, 8),
    rituals: asTextArray(rawProposal?.rituals ?? rawProposal?.rituais).slice(0, 8),
    executiveSummary: asText(rawProposal?.executiveSummary ?? rawProposal?.executive_summary ?? rawProposal?.resumoExecutivo),
    objectives: asArray<any>(rawProposal?.objectives ?? rawProposal?.objetivos)
      .map((objective) => ({
        title: asText(objective?.title ?? objective?.titulo, fillMissingLabels ? "Objetivo estratégico" : ""),
        type: asText(objective?.type ?? objective?.tipo).toLowerCase().includes("seed") || asText(objective?.type ?? objective?.tipo).toLowerCase().includes("plantio") ? "seed" : "harvest",
        result: asText(objective?.result ?? objective?.resultado, asText(objective?.target ?? objective?.meta)),
        current: asText(objective?.current ?? objective?.baseline ?? objective?.valor_atual ?? objective?.atual),
        metric: asText(objective?.metric ?? objective?.metrica ?? objective?.indicador),
        target: asText(objective?.target ?? objective?.meta),
        deadline: asText(objective?.deadline ?? objective?.prazo),
        source: asText(objective?.source ?? objective?.fonte),
        strategies: asTextArray(objective?.strategies ?? objective?.estrategias).slice(0, 8),
        owner: asText(objective?.owner ?? objective?.responsavel),
        period: asText(objective?.period ?? objective?.periodo, String(year)),
        kpiLinks: normalizeKpiLinks(objective?.kpiLinks ?? objective?.kpi_links),
      }))
      .filter((objective) => objective.title)
      .slice(0, 8),
    projects: asArray<any>(rawProposal?.projects ?? rawProposal?.projetos)
      .map((project) => ({
        name: asText(project?.name ?? project?.nome, fillMissingLabels ? "Projeto estratégico" : ""),
        owner: asText(project?.owner ?? project?.responsavel),
        deadline: asText(project?.deadline ?? project?.prazo),
        linkedObjectiveTitle: asText(project?.linkedObjectiveTitle ?? project?.objetivoVinculado ?? project?.objetivo_vinculado),
      }))
      .filter((project) => project.name)
      .slice(0, 8),
  };
}

function numberedPreview(items: string[], limit = 5) {
  const visible = items.slice(0, limit);
  const extra = Math.max(0, items.length - visible.length);
  return [
    ...visible.map((item, index) => `${index + 1}. ${item}`),
    extra ? `+${extra} item(ns) adicionais na proposta.` : "",
  ].filter(Boolean);
}

function missingReadyPlanFields(proposal: ReturnType<typeof normalizeReadyStrategicProposal>) {
  const missing: string[] = [];
  if (!asText(proposal.drivers.purpose)) missing.push("propósito");
  if (!asText(proposal.drivers.vision)) missing.push("visão");

  const objectivesWithoutMetric = proposal.objectives.filter((objective) => !asText(objective.metric)).length;
  const objectivesWithoutBaseline = proposal.objectives.filter((objective) => !asText(objective.current)).length;
  const objectivesWithoutTarget = proposal.objectives.filter((objective) => !asText(objective.target)).length;
  const objectivesWithoutOwner = proposal.objectives.filter((objective) => !asText(objective.owner)).length;
  const projectsWithoutOwner = proposal.projects.filter((project) => !asText(project.owner)).length;
  const projectsWithoutDeadline = proposal.projects.filter((project) => !asText(project.deadline)).length;

  if (objectivesWithoutMetric) missing.push(`${objectivesWithoutMetric} objetivo(s) sem indicador`);
  if (objectivesWithoutBaseline) missing.push(`${objectivesWithoutBaseline} objetivo(s) sem baseline`);
  if (objectivesWithoutTarget) missing.push(`${objectivesWithoutTarget} objetivo(s) sem meta`);
  if (objectivesWithoutOwner) missing.push(`${objectivesWithoutOwner} objetivo(s) sem responsável`);
  if (projectsWithoutOwner) missing.push(`${projectsWithoutOwner} projeto(s) sem responsável`);
  if (projectsWithoutDeadline) missing.push(`${projectsWithoutDeadline} projeto(s) sem prazo`);

  return missing;
}

export function formatReadyStrategicPlanReply(
  proposal: ReturnType<typeof normalizeReadyStrategicProposal>,
  channel: "web" | "whatsapp",
) {
  const year = proposal.year || currentYearFromPeriod(String(proposal.objectives[0]?.period ?? ""));
  const objectiveLines = proposal.objectives.map((objective) => {
    const details = [
      objective.result,
      objective.current ? `Baseline: ${objective.current}` : "",
      objective.metric ? `Indicador: ${objective.metric}` : "",
      objective.target ? `Meta: ${objective.target}` : "",
      objective.deadline ? `Prazo: ${objective.deadline}` : "",
      objective.source ? `Fonte: ${objective.source}` : "",
      objective.owner ? `Dono: ${objective.owner}` : "",
      objective.kpiLinks.length ? `KPIs sugeridos: ${kpiLinkLabels(objective.kpiLinks).join(", ")}` : "",
    ].filter(Boolean).join(" | ");
    return details ? `${objective.title} - ${details}` : objective.title;
  });
  const projectLines = proposal.projects.map((project) => {
    const details = [
      project.owner ? `Dono: ${project.owner}` : "",
      project.deadline ? `Prazo: ${project.deadline}` : "",
      project.linkedObjectiveTitle ? `Ligado a: ${project.linkedObjectiveTitle}` : "",
    ].filter(Boolean).join(" | ");
    return details ? `${project.name} - ${details}` : project.name;
  });
  const missing = missingReadyPlanFields(proposal);

  if (channel === "web") {
    return [
      `Estruturei uma prévia do Plano Estratégico ${year} com ${proposal.objectives.length} objetivo(s) e ${proposal.projects.length} projeto(s).`,
      "Ainda não gravei nada. Confira o cartão de aprovação no painel lateral: ele mostra a estrutura que será salva, os vínculos principais e os campos que ficaram em branco por não estarem explícitos no arquivo.",
    ].join(" ");
  }

  return [
    `Estruturei uma prévia do Plano Estratégico ${year} com ${proposal.objectives.length} objetivo(s) e ${proposal.projects.length} projeto(s).`,
    "",
    objectiveLines.length ? "Objetivos:" : "",
    ...numberedPreview(objectiveLines),
    "",
    projectLines.length ? "Projetos prioritários:" : "",
    ...numberedPreview(projectLines),
    "",
    missing.length ? `Campos que deixei em branco porque não estavam explícitos: ${missing.join("; ")}.` : "Não identifiquei lacunas importantes nos campos principais.",
  ].filter((line, index, lines) => line || lines[index - 1]).join("\n");
}

export function readyPlanSystemPrompt(context: string, period: string, channel: "web" | "whatsapp", tone: string) {
  return [
    PERSONA_ORACULO,
    tone,
    UNTRUSTED_CONTENT_RULES,
    "Você está importando um Plano Estratégico pronto para dentro do Oráculo.",
    "Objetivo: transformar o texto recebido em dados estruturados que possam ser gravados no módulo de Plano Estratégico.",
    "Não mande o usuário para WhatsApp ou para outra tela. O canal atual já é suficiente: " + channel + ".",
    "Não faça apenas uma revisão textual. Gere uma proposal completa do tipo save_strategic_plan.",
    "Fidelidade ao plano aprovado é mais importante que completar campos. Não acrescente indicador próprio, meta, prazo, responsável, diagnóstico ou projeto que não esteja no texto.",
    "Como orientação separada, você pode sugerir em kpiLinks até 2 KPIs executivos que o objetivo pode impactar: revenue, operating_margin, production ou cash. Só sugira relação forte, explique em rationale e deixe visível para confirmação.",
    "Se houver lacunas, use string vazia ou lista vazia. Quando um objetivo estiver implícito, transforme o próprio trecho do plano em um objetivo curto, sem inventar indicador, meta ou responsável.",
    "Metas podem ficar como texto quando o plano original trouxer texto; se o plano não trouxer meta, deixe target vazio.",
    "Agrupe objetivos parecidos. Prefira 3 a 6 objetivos estratégicos e até 7 projetos prioritários.",
    "Use datas no formato YYYY-MM-DD quando o texto trouxer prazo claro; se não houver prazo, use string vazia.",
    "Responda SOMENTE JSON válido, sem markdown, com este formato:",
    '{"reply":"mensagem curta de apoio; a previa detalhada sera montada pelo sistema","state_patch":{"importacao_plano_pronto":true},"next_phase":"sintese","proposal":{"type":"save_strategic_plan","year":2026,"profile":{"sector":"","size":"","region":"","founded":"","mainPain":""},"drivers":{"purpose":"","vision":"","values":[]},"swot":{"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]},"themes":[],"renunciations":[],"risks":[],"pendingDecisions":[],"historicalLessons":[],"rituals":[],"executiveSummary":"","objectives":[{"title":"","type":"harvest|seed","result":"","current":"","metric":"","target":"","deadline":"","source":"","strategies":[],"owner":"","period":"2026","kpiLinks":[{"kpiKey":"revenue|operating_margin|production|cash","rationale":""}]}],"projects":[{"name":"","owner":"","deadline":"","linkedObjectiveTitle":""}]}}',
    `Ano/período do plano: ${period}`,
    "Contexto atual do Oráculo:",
    context,
  ].filter(Boolean).join("\n\n");
}

export function normalizeReadyQuarterlyProposal(rawProposal: any, period: string) {
  const year = currentYearFromPeriod(period);
  const areaRole = rawProposal?.areaRole && typeof rawProposal.areaRole === "object"
    ? rawProposal.areaRole
    : rawProposal?.papel_area && typeof rawProposal.papel_area === "object"
      ? rawProposal.papel_area
      : {};
  const diagnosis = rawProposal?.diagnosis && typeof rawProposal.diagnosis === "object"
    ? rawProposal.diagnosis
    : rawProposal?.diagnostico && typeof rawProposal.diagnostico === "object"
      ? rawProposal.diagnostico
      : {};

  return {
    type: "save_quarterly_plan",
    period,
    areaRole: {
      mission: asText(areaRole.mission ?? areaRole.missao),
      contribution: asTextArray(areaRole.contribution ?? areaRole.contribuicao).slice(0, 6),
    },
    diagnosis: {
      strengths: asTextArray(diagnosis.strengths ?? diagnosis.forcas).slice(0, 8),
      weaknesses: asTextArray(diagnosis.weaknesses ?? diagnosis.gargalos ?? diagnosis.fraquezas).slice(0, 8),
    },
    linkedStrategicObjectiveIds: asTextArray(rawProposal?.linkedStrategicObjectiveIds ?? rawProposal?.objetivos_estrategicos_vinculados).slice(0, 8),
    learningFocus: asTextArray(rawProposal?.learningFocus ?? rawProposal?.foco_aprendizado).slice(0, 5),
    annualObjectives: asArray<any>(rawProposal?.annualObjectives ?? rawProposal?.objetivos_anuais_area ?? rawProposal?.objetivosAnuais)
      .map((objective) => ({
        title: asText(objective?.title ?? objective?.titulo, "Objetivo anual da área"),
        type: asText(objective?.type ?? objective?.tipo).toLowerCase().includes("seed") || asText(objective?.type ?? objective?.tipo).toLowerCase().includes("plantio") ? "seed" : "harvest",
        result: asText(objective?.result ?? objective?.resultado),
        metric: asText(objective?.metric ?? objective?.metrica ?? objective?.indicador),
        target: asText(objective?.target ?? objective?.meta),
        owner: asText(objective?.owner ?? objective?.responsavel),
        period: asText(objective?.period ?? objective?.periodo, String(year)),
        linkedStrategicObjectiveId: asText(objective?.linkedStrategicObjectiveId ?? objective?.objetivo_estrategico_id),
        kpiLinks: normalizeKpiLinks(objective?.kpiLinks ?? objective?.kpi_links),
      }))
      .filter((objective) => objective.title)
      .slice(0, 6),
    quarterlyObjectives: asArray<any>(rawProposal?.quarterlyObjectives ?? rawProposal?.objetivos_trimestre ?? rawProposal?.objetivosTrimestrais)
      .map((objective) => ({
        title: asText(objective?.title ?? objective?.titulo, "Objetivo trimestral"),
        type: asText(objective?.type ?? objective?.tipo).toLowerCase().includes("seed") || asText(objective?.type ?? objective?.tipo).toLowerCase().includes("plantio") ? "seed" : "harvest",
        result: asText(objective?.result ?? objective?.resultado),
        metric: asText(objective?.metric ?? objective?.metrica ?? objective?.indicador),
        target: asText(objective?.target ?? objective?.meta),
        owner: asText(objective?.owner ?? objective?.responsavel),
        period: asText(objective?.period ?? objective?.periodo, period),
        parentTitle: asText(objective?.parentTitle ?? objective?.objetivo_anual_vinculado ?? objective?.vinculo),
        deliverables: asTextArray(objective?.deliverables ?? objective?.entregas).slice(0, 6),
        kpiLinks: normalizeKpiLinks(objective?.kpiLinks ?? objective?.kpi_links),
      }))
      .filter((objective) => objective.title)
      .slice(0, 8),
  };
}

function missingReadyQuarterlyPlanFields(proposal: ReturnType<typeof normalizeReadyQuarterlyProposal>) {
  const missing: string[] = [];
  if (!asText(proposal.areaRole.mission)) missing.push("missão da área");

  const annualWithoutMetric = proposal.annualObjectives.filter((objective) => !asText(objective.metric)).length;
  const quarterlyWithoutMetric = proposal.quarterlyObjectives.filter((objective) => !asText(objective.metric)).length;
  const quarterlyWithoutTarget = proposal.quarterlyObjectives.filter((objective) => !asText(objective.target)).length;
  const quarterlyWithoutOwner = proposal.quarterlyObjectives.filter((objective) => !asText(objective.owner)).length;
  const quarterlyWithoutDeliverables = proposal.quarterlyObjectives.filter((objective) => !objective.deliverables.length).length;

  if (annualWithoutMetric) missing.push(`${annualWithoutMetric} objetivo(s) anual(is) sem indicador`);
  if (quarterlyWithoutMetric) missing.push(`${quarterlyWithoutMetric} objetivo(s) trimestral(is) sem indicador`);
  if (quarterlyWithoutTarget) missing.push(`${quarterlyWithoutTarget} objetivo(s) trimestral(is) sem meta`);
  if (quarterlyWithoutOwner) missing.push(`${quarterlyWithoutOwner} objetivo(s) trimestral(is) sem responsável`);
  if (quarterlyWithoutDeliverables) missing.push(`${quarterlyWithoutDeliverables} objetivo(s) trimestral(is) sem entregas`);

  return missing;
}

export function formatReadyQuarterlyPlanReply(
  proposal: ReturnType<typeof normalizeReadyQuarterlyProposal>,
  channel: "web" | "whatsapp",
) {
  const objectiveLines = proposal.quarterlyObjectives.map((objective) => {
    const details = [
      objective.result,
      objective.metric ? `Indicador: ${objective.metric}` : "",
      objective.target ? `Meta: ${objective.target}` : "",
      objective.owner ? `Dono: ${objective.owner}` : "",
      objective.parentTitle ? `Vínculo anual: ${objective.parentTitle}` : "",
      objective.deliverables.length ? `Entregas: ${objective.deliverables.join("; ")}` : "",
      objective.kpiLinks.length ? `KPIs sugeridos: ${kpiLinkLabels(objective.kpiLinks).join(", ")}` : "",
    ].filter(Boolean).join(" | ");
    return details ? `${objective.title} - ${details}` : objective.title;
  });
  const missing = missingReadyQuarterlyPlanFields(proposal);

  if (channel === "web") {
    return [
      `Estruturei uma prévia do Plano Trimestral ${proposal.period} com ${proposal.quarterlyObjectives.length} objetivo(s).`,
      "Ainda não gravei nada. Confira o cartão de aprovação no painel lateral: ele mostra objetivos, vínculos anuais, entregas e campos que ficaram em branco no arquivo.",
    ].join(" ");
  }

  return [
    `Estruturei uma prévia do Plano Trimestral ${proposal.period} com ${proposal.quarterlyObjectives.length} objetivo(s).`,
    "",
    objectiveLines.length ? "Objetivos do trimestre:" : "",
    ...numberedPreview(objectiveLines),
    "",
    missing.length ? `Campos que deixei em branco porque não estavam explícitos: ${missing.join("; ")}.` : "Não identifiquei lacunas importantes nos campos principais.",
  ].filter((line, index, lines) => line || lines[index - 1]).join("\n");
}

export function readyQuarterlyPlanSystemPrompt(context: string, period: string, channel: "web" | "whatsapp", tone: string) {
  return [
    PERSONA_ORACULO,
    tone,
    UNTRUSTED_CONTENT_RULES,
    "Você está importando um Plano Trimestral pronto para dentro do Oráculo.",
    "Objetivo: transformar o texto recebido em dados estruturados que possam ser gravados no módulo de Planos Trimestrais da área selecionada.",
    "Não mande o usuário para WhatsApp ou para outra tela. O canal atual já é suficiente: " + channel + ".",
    "Não faça apenas uma revisão textual. Gere uma proposal completa do tipo save_quarterly_plan.",
    "Fidelidade ao arquivo é mais importante que completar campos. Não acrescente indicador próprio, meta, prazo, responsável, diagnóstico, entregas ou objetivo anual que não esteja explícito ou fortemente implícito no texto/contexto.",
    "Como orientação separada, você pode sugerir em kpiLinks até 2 KPIs executivos que o objetivo pode impactar: revenue, operating_margin, production ou cash. Só sugira relação forte e explique em rationale.",
    "Se houver lacunas, use string vazia ou lista vazia. Quando algo estiver implícito, preserve o texto original como base curta e sinalize lacunas na resposta.",
    "Monte 1 a 4 objetivos trimestrais e até 5 entregas principais por objetivo. Se o arquivo trouxer plano anual da área, inclua em annualObjectives; se não trouxer, use annualObjectives vazio e parentTitle vazio.",
    "Use o período recebido exatamente como padrão para objetivos trimestrais.",
    "Responda SOMENTE JSON válido, sem markdown, com este formato:",
    '{"reply":"mensagem curta de apoio; a previa detalhada sera montada pelo sistema","state_patch":{"importacao_plano_trimestral_pronto":true},"next_phase":"sintese","proposal":{"type":"save_quarterly_plan","areaRole":{"mission":"","contribution":[]},"diagnosis":{"strengths":[],"weaknesses":[]},"learningFocus":[],"linkedStrategicObjectiveIds":[],"annualObjectives":[{"title":"","type":"harvest|seed","result":"","metric":"","target":"","owner":"","period":"2026","linkedStrategicObjectiveId":null,"kpiLinks":[]}],"quarterlyObjectives":[{"title":"","type":"harvest|seed","result":"","metric":"","target":"","owner":"","period":"' + period + '","parentTitle":"","deliverables":[],"kpiLinks":[{"kpiKey":"revenue|operating_margin|production|cash","rationale":""}]}]}}',
    `Trimestre/período do plano: ${period}`,
    "Contexto atual do Oráculo:",
    context,
  ].filter(Boolean).join("\n\n");
}

export function normalizeReadyMonthlyProposal(rawProposal: any, period: string) {
  let remainingActions = 5;
  const rawObjectives = asArray<any>(rawProposal?.objectives ?? rawProposal?.objetivos_mes ?? rawProposal?.objetivos)
    .filter((objective) => asText(objective?.title ?? objective?.titulo))
    .slice(0, 3);
  const objectives = rawObjectives
    .map((objective) => {
      const actions = asArray<any>(objective?.actions ?? objective?.acoes)
        .map((action) => ({
          description: asText(action?.description ?? action?.descricao),
          completionCriterion: asText(action?.completionCriterion ?? action?.completion_criterion ?? action?.criterio),
          deadline: asText(action?.deadline ?? action?.prazo),
          owner: asText(action?.owner ?? action?.responsavel),
        }))
        .filter((action) => action.description)
        .slice(0, remainingActions);
      remainingActions -= actions.length;
      return {
        title: asText(objective?.title ?? objective?.titulo),
        type: asText(objective?.type ?? objective?.tipo).toLowerCase().includes("seed") || asText(objective?.type ?? objective?.tipo).toLowerCase().includes("plantio") ? "seed" : "harvest",
        result: asText(objective?.result ?? objective?.resultado),
        metric: asText(objective?.metric ?? objective?.metrica ?? objective?.indicador),
        current: asText(objective?.current ?? objective?.baseline ?? objective?.valor_atual),
        target: asText(objective?.target ?? objective?.meta),
        source: asText(objective?.source ?? objective?.fonte ?? objective?.evidencePlan ?? objective?.evidence_plan),
        deadline: asText(objective?.deadline ?? objective?.prazo),
        owner: asText(objective?.owner ?? objective?.responsavel),
        period: asText(objective?.period ?? objective?.periodo, period),
        linkedQuarterlyObjectiveId: asText(objective?.linkedQuarterlyObjectiveId ?? objective?.linked_quarterly_objective_id),
        parentTitle: asText(objective?.parentTitle ?? objective?.objetivo_trimestral_vinculado ?? objective?.vinculo),
        kpiLinks: normalizeKpiLinks(objective?.kpiLinks ?? objective?.kpi_links),
        actions,
      };
    });
  const alignment = rawProposal?.quarterlyAlignment ?? rawProposal?.alinhamento_trimestral ?? {};

  return {
    type: "save_monthly_plan",
    period,
    context: asTextArray(rawProposal?.context ?? rawProposal?.contexto ?? rawProposal?.contexto_rapido).slice(0, 5),
    learningFocus: asTextArray(rawProposal?.learningFocus ?? rawProposal?.foco_aprendizado).slice(0, 5),
    focusPhrase: asText(rawProposal?.focusPhrase ?? rawProposal?.frase_de_foco),
    quarterlyAlignment: {
      status: asText(alignment.status).toLowerCase(),
      quarterlyObjectiveId: asText(alignment.quarterlyObjectiveId ?? alignment.quarterly_objective_id),
      quarterlyObjectiveTitle: asText(alignment.quarterlyObjectiveTitle ?? alignment.quarterly_objective_title),
      rationale: asText(alignment.rationale ?? alignment.justificativa),
    },
    capacity: { maxCommittedActions: 5 },
    pendingDecisions: asArray<any>(rawProposal?.pendingDecisions ?? rawProposal?.decisoes_pendentes).map((decision) => ({
      item: asText(decision?.item ?? decision?.pendencia),
      origin: asText(decision?.origin ?? decision?.origem),
      reason: asText(decision?.reason ?? decision?.motivo),
      decision: asText(decision?.decision ?? decision?.decisao).toLowerCase(),
    })).slice(0, 8),
    backlog: asTextArray(rawProposal?.backlog ?? rawProposal?.tradeOffs ?? rawProposal?.renuncias).slice(0, 12),
    risks: asTextArray(rawProposal?.risks ?? rawProposal?.riscos).slice(0, 8),
    blockers: asTextArray(rawProposal?.blockers ?? rawProposal?.bloqueios).slice(0, 8),
    cadence: asText(rawProposal?.cadence ?? rawProposal?.cadencia),
    confidence: asText(rawProposal?.confidence ?? rawProposal?.confianca),
    nextCommitment: asText(rawProposal?.nextCommitment ?? rawProposal?.proximo_compromisso),
    realism: rawProposal?.realism && typeof rawProposal.realism === "object"
      ? {
        fits: rawProposal.realism.fits ?? rawProposal.realism.cabe ?? true,
        firstToRemove: asText(rawProposal.realism.firstToRemove ?? rawProposal.realism.primeira_a_sair),
      }
      : {
        fits: rawProposal?.realismo?.cabe ?? true,
        firstToRemove: asText(rawProposal?.realismo?.primeira_a_sair),
      },
    objectives,
  };
}

function missingReadyMonthlyPlanFields(proposal: ReturnType<typeof normalizeReadyMonthlyProposal>) {
  const missing: string[] = [];
  const withoutMetric = proposal.objectives.filter((objective) => !asText(objective.metric)).length;
  const withoutBaseline = proposal.objectives.filter((objective) => !asText(objective.current)).length;
  const withoutTarget = proposal.objectives.filter((objective) => !asText(objective.target)).length;
  const withoutSource = proposal.objectives.filter((objective) => !asText(objective.source)).length;
  const withoutDeadline = proposal.objectives.filter((objective) => !asText(objective.deadline)).length;
  const withoutOwner = proposal.objectives.filter((objective) => !asText(objective.owner)).length;
  const withoutActions = proposal.objectives.filter((objective) => !objective.actions.length).length;
  const actionsWithoutDeadline = proposal.objectives.reduce(
    (total, objective) => total + objective.actions.filter((action) => !asText(action.deadline)).length,
    0,
  );
  const actionsWithoutCriterion = proposal.objectives.reduce(
    (total, objective) => total + objective.actions.filter((action) => !asText(action.completionCriterion)).length,
    0,
  );

  if (withoutMetric) missing.push(`${withoutMetric} objetivo(s) sem indicador`);
  if (withoutBaseline) missing.push(`${withoutBaseline} objetivo(s) sem baseline`);
  if (withoutTarget) missing.push(`${withoutTarget} objetivo(s) sem meta`);
  if (withoutSource) missing.push(`${withoutSource} objetivo(s) sem fonte`);
  if (withoutDeadline) missing.push(`${withoutDeadline} objetivo(s) sem prazo`);
  if (withoutOwner) missing.push(`${withoutOwner} objetivo(s) sem responsável`);
  if (withoutActions) missing.push(`${withoutActions} objetivo(s) sem ações-chave`);
  if (actionsWithoutDeadline) missing.push(`${actionsWithoutDeadline} ação(ões) sem prazo`);
  if (actionsWithoutCriterion) missing.push(`${actionsWithoutCriterion} ação(ões) sem critério de conclusão`);
  if (!['linked', 'exception'].includes(proposal.quarterlyAlignment.status)) missing.push("alinhamento trimestral não definido");
  return missing;
}

export function formatReadyMonthlyPlanReply(
  proposal: ReturnType<typeof normalizeReadyMonthlyProposal>,
  channel: "web" | "whatsapp",
) {
  const objectiveLines = proposal.objectives.map((objective) => {
    const details = [
      objective.result,
      objective.metric ? `Indicador: ${objective.metric}` : "",
      objective.target ? `Meta: ${objective.target}` : "",
      objective.owner ? `Dono: ${objective.owner}` : "",
      objective.parentTitle ? `Vínculo trimestral: ${objective.parentTitle}` : "",
      objective.kpiLinks.length ? `KPIs sugeridos: ${kpiLinkLabels(objective.kpiLinks).join(", ")}` : "",
      objective.actions.length ? `Ações: ${objective.actions.map((action) => action.description).join("; ")}` : "",
    ].filter(Boolean).join(" | ");
    return details ? `${objective.title} - ${details}` : objective.title;
  });
  const missing = missingReadyMonthlyPlanFields(proposal);

  if (channel === "web") {
    return [
      `Estruturei uma prévia do Plano Mensal ${proposal.period} com ${proposal.objectives.length} objetivo(s).`,
      "Ainda não gravei nada. Confira o cartão de aprovação no painel lateral: ele mostra objetivos, ações-chave e campos que ficaram em branco no arquivo.",
    ].join(" ");
  }

  return [
    `Estruturei uma prévia do Plano Mensal ${proposal.period} com ${proposal.objectives.length} objetivo(s).`,
    "",
    objectiveLines.length ? "Objetivos do mês:" : "",
    ...numberedPreview(objectiveLines),
    "",
    missing.length ? `Campos que deixei em branco porque não estavam explícitos: ${missing.join("; ")}.` : "Não identifiquei lacunas importantes nos campos principais.",
  ].filter((line, index, lines) => line || lines[index - 1]).join("\n");
}

export function readyMonthlyPlanSystemPrompt(context: string, period: string, channel: "web" | "whatsapp", tone: string) {
  return [
    PERSONA_ORACULO,
    tone,
    UNTRUSTED_CONTENT_RULES,
    MONTHLY_GUIDANCE_RULES,
    "Você está importando um Plano Mensal pronto para dentro do Oráculo.",
    "Objetivo: transformar o texto recebido em dados estruturados que possam ser gravados no módulo de Execução Mensal.",
    "Não mande o usuário para WhatsApp ou para outra tela. O canal atual já é suficiente: " + channel + ".",
    "Não faça apenas uma revisão textual. Gere uma proposal completa do tipo save_monthly_plan.",
    "Fidelidade ao arquivo é mais importante que completar campos. Não invente indicador próprio, meta, dono, prazo ou ação que não esteja explícita ou muito fortemente implícita.",
    "Como orientação separada, você pode sugerir em kpiLinks até 2 KPIs executivos que o objetivo pode impactar: revenue, operating_margin, production ou cash. Só sugira relação forte e explique em rationale.",
    "Se houver lacunas, use string vazia ou lista vazia. Preserve a linguagem do plano original quando transformar trechos em objetivos e ações.",
    "Monte 1 a 3 resultados mensais e no máximo 5 ações-chave no plano inteiro. Use o objetivo trimestral existente no contexto quando houver; se não houver, use uma exceção explícita e não invente um vínculo.",
    "Use datas no formato YYYY-MM-DD quando o texto trouxer prazo claro; se o texto trouxer só 'até dia 15', converta usando o mês/período recebido.",
    "Responda SOMENTE JSON válido, sem markdown, com este formato:",
    '{"reply":"mensagem curta de apoio; a previa detalhada sera montada pelo sistema","state_patch":{"importacao_plano_mensal_pronto":true},"next_phase":"sintese","proposal":{"type":"save_monthly_plan","period":"' + period + '","quarterlyAlignment":{"status":"linked|exception","quarterlyObjectiveId":"","quarterlyObjectiveTitle":"","rationale":""},"capacity":{"maxCommittedActions":5},"pendingDecisions":[],"backlog":[],"risks":[],"blockers":[],"cadence":"","nextCommitment":"","learningFocus":[],"focusPhrase":"","objectives":[{"title":"","type":"harvest|seed","result":"","metric":"","current":"","target":"","source":"","deadline":"","owner":"","period":"' + period + '","linkedQuarterlyObjectiveId":"","parentTitle":"","kpiLinks":[{"kpiKey":"revenue|operating_margin|production|cash","rationale":""}],"actions":[{"description":"","completionCriterion":"","deadline":"","owner":""}]}]}}',
    `Mês/período do plano: ${period}`,
    "Contexto atual do Oráculo:",
    context,
  ].filter(Boolean).join("\n\n");
}
