import { resolveAiFunction } from "./ai-router.ts";
import { PERSONA_ORACULO, REGRAS_DE_SESSAO } from "./conductors/persona.ts";
import { MONTH_CLOSE_CONDUCTOR, MONTH_CLOSE_PHASES } from "./conductors/month-close.ts";
import { MONTHLY_CONDUCTOR, MONTHLY_PHASES } from "./conductors/monthly.ts";
import {
  conversationMessagesForModel,
  formatConversationMemory,
  getConversationById,
  getOrCreateConversation,
  insertConversationMessage,
  loadConversationHistory,
  maybeSummarize,
} from "./conversations.ts";
import { QUARTERLY_CONDUCTOR, QUARTERLY_PHASES } from "./conductors/quarterly.ts";
import { QUARTER_CLOSE_CONDUCTOR, QUARTER_CLOSE_PHASES } from "./conductors/quarter-close.ts";
import { STRATEGIC_REVIEW_CONDUCTOR, STRATEGIC_REVIEW_PHASES } from "./conductors/strategic-review.ts";
import { STRATEGIC_CONDUCTOR, STRATEGIC_PHASES } from "./conductors/strategic.ts";
import { parseJsonObject } from "./json.ts";
import { callModelForFunction } from "./call-for-function.ts";
import { buildPlanContext } from "./plan-context.ts";
import { documentTypeFromProposalType } from "./plan-documents.ts";
import { renderPlanForWhatsApp } from "./plan-render.ts";
import { applyProposal } from "./proposals.ts";
import { nextMonthPeriod, nextQuarterPeriod } from "./periods.ts";
import { recordAiUsage } from "./usage.ts";

type Client = any;

export type PlanningSessionType = "strategic" | "quarterly" | "monthly" | "month_close" | "quarter_close" | "strategic_review";

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
  month_close: {
    phases: MONTH_CLOSE_PHASES,
    prompt: MONTH_CLOSE_CONDUCTOR,
    opening: "Vamos fechar o mês antes de abrir o próximo. Vou olhar objetivos, ações, evidências e aprendizados; começamos pelo que estava planejado para este período.",
  },
  quarter_close: {
    phases: QUARTER_CLOSE_PHASES,
    prompt: QUARTER_CLOSE_CONDUCTOR,
    opening: "Vamos fechar o trimestre subindo um andar: resultado dos objetivos, evidências, aprendizados e o que fica para o próximo ciclo.",
  },
  strategic_review: {
    phases: STRATEGIC_REVIEW_PHASES,
    prompt: STRATEGIC_REVIEW_CONDUCTOR,
    opening: "Vamos fazer uma Revisão Estratégica: microajustes no plano anual, sem recriar a estratégia. O que mudou no contexto e por que vale revisar agora?",
  },
};

const READY_PLAN_TEXT_LIMIT = 30000;

function shallowMergeState(current: Record<string, unknown>, patch: Record<string, unknown>) {
  return { ...(current ?? {}), ...(patch ?? {}) };
}

function validNextPhase(type: string, nextPhase: unknown) {
  if (!nextPhase) return null;
  const text = String(nextPhase);
  return CONDUCTORS[type]?.phases.includes(text) ? text : null;
}

function currentYearFromPeriod(period: string) {
  const match = period.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asTextArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => asText(item)).filter(Boolean);
  const text = asText(value);
  return text ? [text] : [];
}

function normalizeReadyStrategicProposal(rawProposal: any, period: string) {
  const year = Number(rawProposal?.year ?? currentYearFromPeriod(period));
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
    rituals: asTextArray(rawProposal?.rituals ?? rawProposal?.rituais).slice(0, 8),
    executiveSummary: asText(rawProposal?.executiveSummary ?? rawProposal?.executive_summary ?? rawProposal?.resumoExecutivo),
    objectives: asArray<any>(rawProposal?.objectives ?? rawProposal?.objetivos)
      .map((objective) => ({
        title: asText(objective?.title ?? objective?.titulo, "Objetivo estratégico"),
        type: asText(objective?.type ?? objective?.tipo).toLowerCase().includes("seed") || asText(objective?.type ?? objective?.tipo).toLowerCase().includes("plantio") ? "seed" : "harvest",
        result: asText(objective?.result ?? objective?.resultado),
        metric: asText(objective?.metric ?? objective?.metrica ?? objective?.indicador),
        target: asText(objective?.target ?? objective?.meta),
        owner: asText(objective?.owner ?? objective?.responsavel),
        period: asText(objective?.period ?? objective?.periodo, String(year)),
      }))
      .filter((objective) => objective.title)
      .slice(0, 8),
    projects: asArray<any>(rawProposal?.projects ?? rawProposal?.projetos)
      .map((project) => ({
        name: asText(project?.name ?? project?.nome, "Projeto estratégico"),
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
  const objectivesWithoutTarget = proposal.objectives.filter((objective) => !asText(objective.target)).length;
  const objectivesWithoutOwner = proposal.objectives.filter((objective) => !asText(objective.owner)).length;
  const projectsWithoutOwner = proposal.projects.filter((project) => !asText(project.owner)).length;
  const projectsWithoutDeadline = proposal.projects.filter((project) => !asText(project.deadline)).length;

  if (objectivesWithoutMetric) missing.push(`${objectivesWithoutMetric} objetivo(s) sem indicador`);
  if (objectivesWithoutTarget) missing.push(`${objectivesWithoutTarget} objetivo(s) sem meta`);
  if (objectivesWithoutOwner) missing.push(`${objectivesWithoutOwner} objetivo(s) sem responsável`);
  if (projectsWithoutOwner) missing.push(`${projectsWithoutOwner} projeto(s) sem responsável`);
  if (projectsWithoutDeadline) missing.push(`${projectsWithoutDeadline} projeto(s) sem prazo`);

  return missing;
}

function formatReadyStrategicPlanReply(
  proposal: ReturnType<typeof normalizeReadyStrategicProposal>,
  channel: "web" | "whatsapp",
) {
  const year = proposal.year || currentYearFromPeriod(String(proposal.objectives[0]?.period ?? ""));
  const objectiveLines = proposal.objectives.map((objective) => {
    const details = [
      objective.result,
      objective.metric ? `Indicador: ${objective.metric}` : "",
      objective.target ? `Meta: ${objective.target}` : "",
      objective.owner ? `Dono: ${objective.owner}` : "",
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

function readyPlanSystemPrompt(context: string, period: string, channel: "web" | "whatsapp") {
  return [
    PERSONA_ORACULO,
    "Você está importando um Plano Estratégico pronto para dentro do Oráculo.",
    "Objetivo: transformar o texto recebido em dados estruturados que possam ser gravados no módulo de Plano Estratégico.",
    "Não mande o usuário para WhatsApp ou para outra tela. O canal atual já é suficiente: " + channel + ".",
    "Não faça apenas uma revisão textual. Gere uma proposal completa do tipo save_strategic_plan.",
    "Fidelidade ao plano aprovado é mais importante que completar campos. Não acrescente KPI, meta, prazo, responsável, diagnóstico ou projeto que não esteja no texto.",
    "Se houver lacunas, use string vazia ou lista vazia. Quando um objetivo estiver implícito, transforme o próprio trecho do plano em um objetivo curto, sem inventar indicador, meta ou responsável.",
    "Metas podem ficar como texto quando o plano original trouxer texto; se o plano não trouxer meta, deixe target vazio.",
    "Agrupe objetivos parecidos. Prefira 3 a 6 objetivos estratégicos e até 7 projetos prioritários.",
    "Use datas no formato YYYY-MM-DD quando o texto trouxer prazo claro; se não houver prazo, use string vazia.",
    "Responda SOMENTE JSON válido, sem markdown, com este formato:",
    '{"reply":"mensagem curta de apoio; a previa detalhada sera montada pelo sistema","state_patch":{"importacao_plano_pronto":true},"next_phase":"sintese","proposal":{"type":"save_strategic_plan","year":2026,"profile":{"sector":"","size":"","region":"","founded":"","mainPain":""},"drivers":{"purpose":"","vision":"","values":[]},"swot":{"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]},"themes":[],"rituals":[],"executiveSummary":"","objectives":[{"title":"","type":"harvest|seed","result":"","metric":"","target":"","owner":"","period":"2026"}],"projects":[{"name":"","owner":"","deadline":"","linkedObjectiveTitle":""}]}}',
    `Ano/período do plano: ${period}`,
    "Contexto atual do Oráculo:",
    context,
  ].join("\n\n");
}

function normalizeReadyQuarterlyProposal(rawProposal: any, period: string) {
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

function formatReadyQuarterlyPlanReply(
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

function readyQuarterlyPlanSystemPrompt(context: string, period: string, channel: "web" | "whatsapp") {
  return [
    PERSONA_ORACULO,
    "Você está importando um Plano Trimestral pronto para dentro do Oráculo.",
    "Objetivo: transformar o texto recebido em dados estruturados que possam ser gravados no módulo de Planos Trimestrais da área selecionada.",
    "Não mande o usuário para WhatsApp ou para outra tela. O canal atual já é suficiente: " + channel + ".",
    "Não faça apenas uma revisão textual. Gere uma proposal completa do tipo save_quarterly_plan.",
    "Fidelidade ao arquivo é mais importante que completar campos. Não acrescente KPI, meta, prazo, responsável, diagnóstico, entregas ou objetivo anual que não esteja explícito ou fortemente implícito no texto/contexto.",
    "Se houver lacunas, use string vazia ou lista vazia. Quando algo estiver implícito, preserve o texto original como base curta e sinalize lacunas na resposta.",
    "Monte 1 a 4 objetivos trimestrais e até 5 entregas principais por objetivo. Se o arquivo trouxer plano anual da área, inclua em annualObjectives; se não trouxer, use annualObjectives vazio e parentTitle vazio.",
    "Use o período recebido exatamente como padrão para objetivos trimestrais.",
    "Responda SOMENTE JSON válido, sem markdown, com este formato:",
    '{"reply":"mensagem curta de apoio; a previa detalhada sera montada pelo sistema","state_patch":{"importacao_plano_trimestral_pronto":true},"next_phase":"sintese","proposal":{"type":"save_quarterly_plan","areaRole":{"mission":"","contribution":[]},"diagnosis":{"strengths":[],"weaknesses":[]},"learningFocus":[],"linkedStrategicObjectiveIds":[],"annualObjectives":[{"title":"","type":"harvest|seed","result":"","metric":"","target":"","owner":"","period":"2026","linkedStrategicObjectiveId":null}],"quarterlyObjectives":[{"title":"","type":"harvest|seed","result":"","metric":"","target":"","owner":"","period":"' + period + '","parentTitle":"","deliverables":[]}]}}',
    `Trimestre/período do plano: ${period}`,
    "Contexto atual do Oráculo:",
    context,
  ].join("\n\n");
}

function normalizeReadyMonthlyProposal(rawProposal: any, period: string) {
  return {
    type: "save_monthly_plan",
    period,
    context: asTextArray(rawProposal?.context ?? rawProposal?.contexto ?? rawProposal?.contexto_rapido).slice(0, 5),
    learningFocus: asTextArray(rawProposal?.learningFocus ?? rawProposal?.foco_aprendizado).slice(0, 5),
    focusPhrase: asText(rawProposal?.focusPhrase ?? rawProposal?.frase_de_foco),
    realism: rawProposal?.realism && typeof rawProposal.realism === "object"
      ? {
        fits: rawProposal.realism.fits ?? rawProposal.realism.cabe ?? true,
        firstToRemove: asText(rawProposal.realism.firstToRemove ?? rawProposal.realism.primeira_a_sair),
      }
      : {
        fits: rawProposal?.realismo?.cabe ?? true,
        firstToRemove: asText(rawProposal?.realismo?.primeira_a_sair),
      },
    objectives: asArray<any>(rawProposal?.objectives ?? rawProposal?.objetivos_mes ?? rawProposal?.objetivos)
      .map((objective) => ({
        title: asText(objective?.title ?? objective?.titulo, "Objetivo mensal"),
        type: asText(objective?.type ?? objective?.tipo).toLowerCase().includes("seed") || asText(objective?.type ?? objective?.tipo).toLowerCase().includes("plantio") ? "seed" : "harvest",
        result: asText(objective?.result ?? objective?.resultado),
        metric: asText(objective?.metric ?? objective?.metrica ?? objective?.indicador),
        target: asText(objective?.target ?? objective?.meta),
        owner: asText(objective?.owner ?? objective?.responsavel),
        period: asText(objective?.period ?? objective?.periodo, period),
        parentTitle: asText(objective?.parentTitle ?? objective?.objetivo_trimestral_vinculado ?? objective?.vinculo),
        actions: asArray<any>(objective?.actions ?? objective?.acoes)
          .map((action) => ({
            description: asText(action?.description ?? action?.descricao, "Ação-chave"),
            completionCriterion: asText(action?.completionCriterion ?? action?.completion_criterion ?? action?.criterio),
            deadline: asText(action?.deadline ?? action?.prazo),
            owner: asText(action?.owner ?? action?.responsavel),
          }))
          .filter((action) => action.description)
          .slice(0, 5),
      }))
      .filter((objective) => objective.title)
      .slice(0, 5),
  };
}

function missingReadyMonthlyPlanFields(proposal: ReturnType<typeof normalizeReadyMonthlyProposal>) {
  const missing: string[] = [];
  const withoutMetric = proposal.objectives.filter((objective) => !asText(objective.metric)).length;
  const withoutTarget = proposal.objectives.filter((objective) => !asText(objective.target)).length;
  const withoutOwner = proposal.objectives.filter((objective) => !asText(objective.owner)).length;
  const withoutActions = proposal.objectives.filter((objective) => !objective.actions.length).length;
  const actionsWithoutDeadline = proposal.objectives.reduce(
    (total, objective) => total + objective.actions.filter((action) => !asText(action.deadline)).length,
    0,
  );

  if (withoutMetric) missing.push(`${withoutMetric} objetivo(s) sem indicador`);
  if (withoutTarget) missing.push(`${withoutTarget} objetivo(s) sem meta`);
  if (withoutOwner) missing.push(`${withoutOwner} objetivo(s) sem responsável`);
  if (withoutActions) missing.push(`${withoutActions} objetivo(s) sem ações-chave`);
  if (actionsWithoutDeadline) missing.push(`${actionsWithoutDeadline} ação(ões) sem prazo`);
  return missing;
}

function formatReadyMonthlyPlanReply(
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

function readyMonthlyPlanSystemPrompt(context: string, period: string, channel: "web" | "whatsapp") {
  return [
    PERSONA_ORACULO,
    "Você está importando um Plano Mensal pronto para dentro do Oráculo.",
    "Objetivo: transformar o texto recebido em dados estruturados que possam ser gravados no módulo de Execução Mensal.",
    "Não mande o usuário para WhatsApp ou para outra tela. O canal atual já é suficiente: " + channel + ".",
    "Não faça apenas uma revisão textual. Gere uma proposal completa do tipo save_monthly_plan.",
    "Fidelidade ao arquivo é mais importante que completar campos. Não invente KPI, meta, dono, prazo ou ação que não esteja explícita ou muito fortemente implícita.",
    "Se houver lacunas, use string vazia ou lista vazia. Preserve a linguagem do plano original quando transformar trechos em objetivos e ações.",
    "Monte 1 a 5 objetivos mensais, cada um com 1 a 5 ações-chave. Se houver vínculo trimestral, preencha parentTitle; se não houver, deixe vazio.",
    "Use datas no formato YYYY-MM-DD quando o texto trouxer prazo claro; se o texto trouxer só 'até dia 15', converta usando o mês/período recebido.",
    "Responda SOMENTE JSON válido, sem markdown, com este formato:",
    '{"reply":"mensagem curta de apoio; a previa detalhada sera montada pelo sistema","state_patch":{"importacao_plano_mensal_pronto":true},"next_phase":"sintese","proposal":{"type":"save_monthly_plan","period":"' + period + '","context":[],"learningFocus":[],"focusPhrase":"","realism":{"fits":true,"firstToRemove":""},"objectives":[{"title":"","type":"harvest|seed","result":"","metric":"","target":"","owner":"","period":"' + period + '","parentTitle":"","actions":[{"description":"","completionCriterion":"","deadline":"","owner":""}]}]}}',
    `Mês/período do plano: ${period}`,
    "Contexto atual do Oráculo:",
    context,
  ].join("\n\n");
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

function conductorPrompt(type: string, phase: string) {
  const conductor = CONDUCTORS[type];
  return [
    `ROTEIRO ATIVO: ${type}`,
    `Fase atual: ${phase}`,
    `Fases na ordem: ${conductor.phases.join(", ")}`,
    conductor.prompt,
  ].join("\n\n");
}

function planFocusForSession(type: string) {
  if (type === "monthly" || type === "month_close") return "monthly" as const;
  if (type === "quarterly" || type === "quarter_close") return "quarterly" as const;
  return "org" as const;
}

async function insertMessage(client: Client, session: any, author: "user" | "oracle", text: string, channel: "web" | "whatsapp") {
  if (!session.conversation_id) throw new Error("Sessão sem conversa vinculada");
  await insertConversationMessage(client, {
    orgId: session.org_id,
    areaId: session.area_id,
    userId: session.user_id,
    conversationId: session.conversation_id,
    author,
    text,
    channel,
  });
}

async function ensureSessionConversation(client: Client, session: any, channel: "web" | "whatsapp") {
  if (session.conversation_id) {
    const existing = await getConversationById(client, session.conversation_id);
    if (existing) return { session, conversation: existing };
  }

  const conversation = await getOrCreateConversation(client, {
    orgId: session.org_id,
    userId: session.user_id,
    channel,
    areaId: session.area_id,
  });
  const { data: updated, error } = await client
    .from("planning_sessions")
    .update({ conversation_id: conversation.id })
    .eq("id", session.id)
    .select("*")
    .single();
  if (error) throw error;
  return { session: updated, conversation };
}

export async function startPlanningSession(
  client: Client,
  params: {
    orgId: string;
    areaId: string | null;
    type: PlanningSessionType;
    period: string;
    userId: string;
    channel?: "web" | "whatsapp";
    suppressOpeningMessage?: boolean;
  },
) {
  const conductor = CONDUCTORS[params.type];
  if (!conductor) throw new Error("Tipo de sessão ainda não disponível nesta fase");
  const membership = await assertCanStartSession(client, params.orgId, params.areaId, params.userId);
  if (params.type === "strategic_review" && (params.areaId || membership.role !== "owner")) {
    throw new Error("Apenas owner pode iniciar uma Revisão Estratégica da empresa");
  }

  const { data: existing, error: existingError } = await client
    .from("planning_sessions")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("user_id", params.userId)
    .eq("type", params.type)
    .eq("period", params.period)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { session: existing, reply: "Retomei sua sessão em andamento. Pode continuar de onde paramos." };

  const conversation = await getOrCreateConversation(client, {
    orgId: params.orgId,
    userId: params.userId,
    channel: params.channel ?? "web",
    areaId: params.areaId,
  });
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

  if (!params.suppressOpeningMessage) {
    await insertMessage(client, session, "oracle", conductor.opening, params.channel ?? "web");
  }
  return { session, reply: conductor.opening };
}

async function createFollowUpSessionAfterClose(
  client: Client,
  session: any,
  state: Record<string, unknown>,
  channel: "web" | "whatsapp",
) {
  if (session.type === "month_close" && state.abrir_planejamento_mensal === true) {
    const period = nextMonthPeriod(String(state.mes_fechado ?? session.period));
    return await startPlanningSession(client, {
      orgId: session.org_id,
      areaId: session.area_id,
      type: "monthly",
      period,
      userId: session.user_id,
      channel,
      suppressOpeningMessage: true,
    });
  }

  if (session.type === "quarter_close" && state.abrir_planejamento_trimestral === true) {
    const period = nextQuarterPeriod(String(state.trimestre_fechado ?? session.period));
    return await startPlanningSession(client, {
      orgId: session.org_id,
      areaId: session.area_id,
      type: "quarterly",
      period,
      userId: session.user_id,
      channel,
      suppressOpeningMessage: true,
    });
  }

  return null;
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

  const channel = params.channel ?? "web";
  const ensured = await ensureSessionConversation(client, session, channel);
  await insertMessage(client, ensured.session, "user", params.message, channel);
  const conversation = await maybeSummarize(client, ensured.session.org_id, ensured.conversation);
  const [history, context] = await Promise.all([
    loadConversationHistory(client, ensured.session.conversation_id),
    buildPlanContext(client, ensured.session.org_id, {
      areaId: ensured.session.area_id,
      focus: planFocusForSession(ensured.session.type),
      period: ensured.session.period,
    }),
  ]);
  const conversationMemory = formatConversationMemory(history);

  const systemPrompt = [
    PERSONA_ORACULO,
    REGRAS_DE_SESSAO,
    conductorPrompt(session.type, session.phase),
    "Estado já coletado:",
    JSON.stringify(session.state ?? {}, null, 2),
    conversationMemory,
    "Contexto atual do plano:",
    context,
  ].filter(Boolean).join("\n\n");

  const result = await callModelForFunction(
    client,
    session.org_id,
    "planning",
    aiRoute,
    systemPrompt,
    conversationMessagesForModel(history),
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
    metadata: { aiFunction: "planning", sessionId: session.id, sessionType: session.type, phase: session.phase, conversationId: conversation?.id ?? ensured.session.conversation_id },
  });

  const parsed = parseJsonObject(result.text) as any;
  const reply = typeof parsed?.reply === "string" ? parsed.reply : result.text;
  const statePatch = parsed?.state_patch && typeof parsed.state_patch === "object" ? parsed.state_patch : {};
  const nextPhase = validNextPhase(session.type, parsed?.next_phase) ?? session.phase;
  const pendingProposal = parsed?.proposal ?? null;
  const nextState = shallowMergeState(session.state ?? {}, statePatch);
  const completed = parsed?.done === true && !pendingProposal;

  const { data: updated, error: updateError } = await client
    .from("planning_sessions")
    .update({
      phase: nextPhase,
      state: nextState,
      pending_proposal: pendingProposal,
      status: completed ? "completed" : "active",
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", ensured.session.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  const followUp = completed ? await createFollowUpSessionAfterClose(client, updated, nextState, channel) : null;
  const finalReply = followUp
    ? `${reply}\n\nAbri o próximo ciclo para você.\n\n${followUp.reply}`
    : reply;

  await insertMessage(client, followUp?.session ?? updated, "oracle", finalReply, params.channel ?? "web");
  return { session: followUp?.session ?? updated, reply: finalReply, pendingProposal };
}

export async function prepareReadyStrategicPlanProposal(
  client: Client,
  params: {
    orgId: string;
    areaId?: string | null;
    period: string;
    planText: string;
    fileName?: string | null;
    userId: string;
    channel?: "web" | "whatsapp";
  },
) {
  const channel = params.channel ?? "web";
  const planText = params.planText.trim();
  if (!planText) throw new Error("Texto do plano pronto não informado");

  await assertCanStartSession(client, params.orgId, params.areaId ?? null, params.userId);
  const aiRoute = await resolveAiFunction(client, params.orgId, "planning");
  if (!aiRoute) throw new Error("IA de planejamento não configurada");

  const conversation = await getOrCreateConversation(client, {
    orgId: params.orgId,
    userId: params.userId,
    channel,
    areaId: params.areaId ?? null,
  });
  const { data: existing, error: existingError } = await client
    .from("planning_sessions")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("user_id", params.userId)
    .eq("type", "strategic")
    .eq("period", params.period)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  let session = existing;
  if (!session) {
    const { data, error } = await client
      .from("planning_sessions")
      .insert({
        org_id: params.orgId,
        area_id: params.areaId ?? null,
        user_id: params.userId,
        conversation_id: conversation.id,
        type: "strategic",
        period: params.period,
        phase: "sintese",
        state: { periodo: params.period, importacao_plano_pronto: true, arquivo: params.fileName ?? null },
      })
      .select("*")
      .single();
    if (error) throw error;
    session = data;
  }

  const context = await buildPlanContext(client, params.orgId, { areaId: params.areaId ?? null, focus: "org" });
  const importedText = planText.length > READY_PLAN_TEXT_LIMIT
    ? `${planText.slice(0, READY_PLAN_TEXT_LIMIT)}\n\n[Texto cortado por limite técnico. Use apenas o conteúdo disponível e sinalize lacunas no resumo.]`
    : planText;
  const userMessage = [
    "Importar plano estratégico pronto para o Oráculo.",
    params.fileName ? `Arquivo: ${params.fileName}` : "",
    "Texto extraído/colado:",
    importedText,
  ].filter(Boolean).join("\n\n");

  await insertMessage(client, session, "user", userMessage, channel);

  const result = await callModelForFunction(
    client,
    params.orgId,
    "planning",
    aiRoute,
    readyPlanSystemPrompt(context, params.period, channel),
    [{ role: "user", content: userMessage }],
    aiRoute.limits,
  );

  await recordAiUsage({
    client,
    orgId: params.orgId,
    provider: aiRoute.provider,
    model: aiRoute.model,
    channel,
    usage: result.usage,
    settings: aiRoute.legacySettings,
    metadata: { aiFunction: "planning", sessionId: session.id, sessionType: "strategic", phase: "sintese", action: "ready_plan_import" },
  });

  const parsed = parseJsonObject(result.text) as any;
  const rawProposal = parsed?.proposal ?? parsed;
  const proposal = normalizeReadyStrategicProposal(rawProposal, params.period);
  if (!proposal.objectives.length) {
    throw new Error("O Oráculo não conseguiu identificar objetivos estratégicos no plano importado");
  }

  const reply = formatReadyStrategicPlanReply(proposal, channel);
  const nextState = shallowMergeState(session.state ?? {}, {
    ...(parsed?.state_patch && typeof parsed.state_patch === "object" ? parsed.state_patch : {}),
    importacao_plano_pronto: true,
    arquivo: params.fileName ?? null,
  });

  const { data: updated, error: updateError } = await client
    .from("planning_sessions")
    .update({
      phase: "sintese",
      state: nextState,
      pending_proposal: proposal,
      status: "active",
      completed_at: null,
      conversation_id: session.conversation_id ?? conversation.id,
    })
    .eq("id", session.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await insertMessage(client, updated, "oracle", reply, channel);
  return { session: updated, reply, pendingProposal: proposal };
}

export async function prepareReadyQuarterlyPlanProposal(
  client: Client,
  params: {
    orgId: string;
    areaId: string;
    period: string;
    planText: string;
    fileName?: string | null;
    userId: string;
    channel?: "web" | "whatsapp";
  },
) {
  const channel = params.channel ?? "web";
  const planText = params.planText.trim();
  if (!params.areaId) throw new Error("Plano trimestral exige um departamento selecionado");
  if (!planText) throw new Error("Texto do plano trimestral pronto não informado");

  await assertCanStartSession(client, params.orgId, params.areaId, params.userId);
  const aiRoute = await resolveAiFunction(client, params.orgId, "planning");
  if (!aiRoute) throw new Error("IA de planejamento não configurada");

  const conversation = await getOrCreateConversation(client, {
    orgId: params.orgId,
    userId: params.userId,
    channel,
    areaId: params.areaId,
  });
  const { data: existing, error: existingError } = await client
    .from("planning_sessions")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("area_id", params.areaId)
    .eq("user_id", params.userId)
    .eq("type", "quarterly")
    .eq("period", params.period)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  let session = existing;
  if (!session) {
    const { data, error } = await client
      .from("planning_sessions")
      .insert({
        org_id: params.orgId,
        area_id: params.areaId,
        user_id: params.userId,
        conversation_id: conversation.id,
        type: "quarterly",
        period: params.period,
        phase: "sintese",
        state: { periodo: params.period, importacao_plano_trimestral_pronto: true, arquivo: params.fileName ?? null },
      })
      .select("*")
      .single();
    if (error) throw error;
    session = data;
  }

  const context = await buildPlanContext(client, params.orgId, { areaId: params.areaId, focus: "quarterly", period: params.period });
  const importedText = planText.length > READY_PLAN_TEXT_LIMIT
    ? `${planText.slice(0, READY_PLAN_TEXT_LIMIT)}\n\n[Texto cortado por limite técnico. Use apenas o conteúdo disponível e sinalize lacunas no resumo.]`
    : planText;
  const userMessage = [
    "Importar plano trimestral pronto para o Oráculo.",
    params.fileName ? `Arquivo: ${params.fileName}` : "",
    `Período: ${params.period}`,
    "Texto extraído/colado:",
    importedText,
  ].filter(Boolean).join("\n\n");

  await insertMessage(client, session, "user", userMessage, channel);

  const result = await callModelForFunction(
    client,
    params.orgId,
    "planning",
    aiRoute,
    readyQuarterlyPlanSystemPrompt(context, params.period, channel),
    [{ role: "user", content: userMessage }],
    aiRoute.limits,
  );

  await recordAiUsage({
    client,
    orgId: params.orgId,
    provider: aiRoute.provider,
    model: aiRoute.model,
    channel,
    usage: result.usage,
    settings: aiRoute.legacySettings,
    metadata: { aiFunction: "planning", sessionId: session.id, sessionType: "quarterly", phase: "sintese", action: "ready_quarterly_plan_import" },
  });

  const parsed = parseJsonObject(result.text) as any;
  const rawProposal = parsed?.proposal ?? parsed;
  const proposal = normalizeReadyQuarterlyProposal(rawProposal, params.period);
  if (!proposal.quarterlyObjectives.length) {
    throw new Error("O Oráculo não conseguiu identificar objetivos trimestrais no plano importado");
  }

  const reply = formatReadyQuarterlyPlanReply(proposal, channel);
  const nextState = shallowMergeState(session.state ?? {}, {
    ...(parsed?.state_patch && typeof parsed.state_patch === "object" ? parsed.state_patch : {}),
    importacao_plano_trimestral_pronto: true,
    arquivo: params.fileName ?? null,
  });

  const { data: updated, error: updateError } = await client
    .from("planning_sessions")
    .update({
      phase: "sintese",
      state: nextState,
      pending_proposal: proposal,
      status: "active",
      completed_at: null,
      conversation_id: session.conversation_id ?? conversation.id,
    })
    .eq("id", session.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await insertMessage(client, updated, "oracle", reply, channel);
  return { session: updated, reply, pendingProposal: proposal };
}

export async function prepareReadyMonthlyPlanProposal(
  client: Client,
  params: {
    orgId: string;
    areaId: string;
    period: string;
    planText: string;
    fileName?: string | null;
    userId: string;
    channel?: "web" | "whatsapp";
  },
) {
  const channel = params.channel ?? "web";
  const planText = params.planText.trim();
  if (!params.areaId) throw new Error("Plano mensal exige um departamento selecionado");
  if (!planText) throw new Error("Texto do plano mensal pronto não informado");

  await assertCanStartSession(client, params.orgId, params.areaId, params.userId);
  const aiRoute = await resolveAiFunction(client, params.orgId, "planning");
  if (!aiRoute) throw new Error("IA de planejamento não configurada");

  const conversation = await getOrCreateConversation(client, {
    orgId: params.orgId,
    userId: params.userId,
    channel,
    areaId: params.areaId,
  });
  const { data: existing, error: existingError } = await client
    .from("planning_sessions")
    .select("*")
    .eq("org_id", params.orgId)
    .eq("area_id", params.areaId)
    .eq("user_id", params.userId)
    .eq("type", "monthly")
    .eq("period", params.period)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  let session = existing;
  if (!session) {
    const { data, error } = await client
      .from("planning_sessions")
      .insert({
        org_id: params.orgId,
        area_id: params.areaId,
        user_id: params.userId,
        conversation_id: conversation.id,
        type: "monthly",
        period: params.period,
        phase: "sintese",
        state: { periodo: params.period, importacao_plano_mensal_pronto: true, arquivo: params.fileName ?? null },
      })
      .select("*")
      .single();
    if (error) throw error;
    session = data;
  }

  const context = await buildPlanContext(client, params.orgId, { areaId: params.areaId, focus: "monthly", period: params.period });
  const importedText = planText.length > READY_PLAN_TEXT_LIMIT
    ? `${planText.slice(0, READY_PLAN_TEXT_LIMIT)}\n\n[Texto cortado por limite técnico. Use apenas o conteúdo disponível e sinalize lacunas no resumo.]`
    : planText;
  const userMessage = [
    "Importar plano mensal pronto para o Oráculo.",
    params.fileName ? `Arquivo: ${params.fileName}` : "",
    `Período: ${params.period}`,
    "Texto extraído/colado:",
    importedText,
  ].filter(Boolean).join("\n\n");

  await insertMessage(client, session, "user", userMessage, channel);

  const result = await callModelForFunction(
    client,
    params.orgId,
    "planning",
    aiRoute,
    readyMonthlyPlanSystemPrompt(context, params.period, channel),
    [{ role: "user", content: userMessage }],
    aiRoute.limits,
  );

  await recordAiUsage({
    client,
    orgId: params.orgId,
    provider: aiRoute.provider,
    model: aiRoute.model,
    channel,
    usage: result.usage,
    settings: aiRoute.legacySettings,
    metadata: { aiFunction: "planning", sessionId: session.id, sessionType: "monthly", phase: "sintese", action: "ready_monthly_plan_import" },
  });

  const parsed = parseJsonObject(result.text) as any;
  const rawProposal = parsed?.proposal ?? parsed;
  const proposal = normalizeReadyMonthlyProposal(rawProposal, params.period);
  if (!proposal.objectives.length) {
    throw new Error("O Oráculo não conseguiu identificar objetivos mensais no plano importado");
  }

  const reply = formatReadyMonthlyPlanReply(proposal, channel);
  const nextState = shallowMergeState(session.state ?? {}, {
    ...(parsed?.state_patch && typeof parsed.state_patch === "object" ? parsed.state_patch : {}),
    importacao_plano_mensal_pronto: true,
    arquivo: params.fileName ?? null,
  });

  const { data: updated, error: updateError } = await client
    .from("planning_sessions")
    .update({
      phase: "sintese",
      state: nextState,
      pending_proposal: proposal,
      status: "active",
      completed_at: null,
      conversation_id: session.conversation_id ?? conversation.id,
    })
    .eq("id", session.id)
    .select("*")
    .single();
  if (updateError) throw updateError;

  await insertMessage(client, updated, "oracle", reply, channel);
  return { session: updated, reply, pendingProposal: proposal };
}

async function loadLatestDocumentForProposal(client: Client, session: any, proposal: any) {
  const documentType = documentTypeFromProposalType(asText(proposal?.type));
  if (!documentType) return null;
  const period = documentType === "strategic"
    ? String(proposal?.year ?? currentYearFromPeriod(session.period))
    : asText(proposal?.period ?? proposal?.periodo, session.period);

  let query = client
    .from("plan_documents")
    .select("*")
    .eq("org_id", session.org_id)
    .eq("type", documentType)
    .eq("period", period)
    .order("created_at", { ascending: false })
    .limit(1);
  query = session.area_id ? query.eq("area_id", session.area_id) : query.is("area_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function confirmPlanningProposal(client: Client, params: { sessionId: string; userId: string; channel?: "web" | "whatsapp"; confirmationText?: string | null }) {
  const { data: session, error } = await client.from("planning_sessions").select("*").eq("id", params.sessionId).maybeSingle();
  if (error) throw error;
  if (!session) throw new Error("Sessão não encontrada");
  if (session.user_id !== params.userId) throw new Error("Sessão pertence a outro usuário");
  if (!session.pending_proposal) throw new Error("Não há proposta pendente para confirmar");

  const channel = params.channel ?? "web";
  const ensured = await ensureSessionConversation(client, session, channel);
  if (params.confirmationText) {
    await insertMessage(client, ensured.session, "user", params.confirmationText, channel);
  }

  const proposal = ensured.session.pending_proposal;
  const summary = await applyProposal(client, ensured.session, proposal, params.userId);
  const document = params.channel === "whatsapp" ? await loadLatestDocumentForProposal(client, ensured.session, proposal) : null;
  const documentText = document ? `\n\n---\n\n${renderPlanForWhatsApp(document.content ?? {})}` : "";
  const isCloseSession = ensured.session.type === "month_close" || ensured.session.type === "quarter_close";
  const nextPhase = ensured.session.type === "month_close" ? "ponte" : ensured.session.type === "quarter_close" ? "balanco" : ensured.session.phase;
  const isReviewSession = ensured.session.type === "strategic_review";
  const reply = isCloseSession
    ? `${summary}\n\nFechamento salvo. Quer já abrir o próximo ciclo agora?${documentText}`
    : isReviewSession
      ? `${summary} Revisão salva no sistema.${documentText}`
    : `${summary} O plano já está salvo no sistema.${documentText}`;
  const { data: updated, error: updateError } = await client
    .from("planning_sessions")
    .update({
      pending_proposal: null,
      phase: nextPhase,
      status: isCloseSession ? "active" : "completed",
      completed_at: isCloseSession ? null : new Date().toISOString(),
    })
    .eq("id", ensured.session.id)
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
