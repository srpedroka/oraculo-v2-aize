function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function documentTypeLabel(value: unknown) {
  const type = asText(value);
  if (type === "strategic") return "PLANO ESTRATÉGICO";
  if (type === "quarterly") return "PLANO TRIMESTRAL";
  if (type === "monthly") return "PLANO MENSAL";
  if (type === "month_close") return "FECHAMENTO MENSAL";
  if (type === "quarter_close") return "FECHAMENTO TRIMESTRAL";
  if (type === "strategic_review") return "REVISÃO ESTRATÉGICA";
  if (type === "kpi_history") return "HISTÓRICO DE KPIs";
  return "DOCUMENTO ORÁCULO";
}

function sourceLabel(value: unknown) {
  return asText(value) === "proposta_confirmada" ? "Proposta confirmada" : "Documento do Oráculo";
}

function actionLine(action: any) {
  const details = [
    asText(action.responsavel) ? `dono: ${asText(action.responsavel)}` : "",
    asText(action.prazo) ? `prazo: ${asText(action.prazo)}` : "",
    asText(action.criterio) ? `critério: ${asText(action.criterio)}` : "",
  ].filter(Boolean);
  return `- ${asText(action.descricao, "Ação-chave")}${details.length ? ` (${details.join(" · ")})` : ""}`;
}

function objectiveBlock(objective: any) {
  const header = `*${asText(objective.numero, "1")}. ${asText(objective.titulo, "Objetivo")}*`;
  const meta = [
    asText(objective.tipo) ? `Tipo: ${asText(objective.tipo)}` : "",
    asText(objective.atual) ? `Baseline: ${asText(objective.atual)}` : "",
    asText(objective.indicador) ? `Indicador: ${asText(objective.indicador)}` : "",
    asText(objective.meta) ? `Meta: ${asText(objective.meta)}` : "",
    asText(objective.prazo) ? `Prazo: ${asText(objective.prazo)}` : "",
    asText(objective.responsavel) ? `Responsável: ${asText(objective.responsavel)}` : "",
    asText(objective.status_final) ? `Status final: ${asText(objective.status_final)}` : "",
    objective.progresso_final !== null && objective.progresso_final !== undefined ? `Progresso: ${objective.progresso_final}%` : "",
  ].filter(Boolean);
  const result = asText(objective.resultado) ? [`Resultado esperado: ${asText(objective.resultado)}`] : [];
  const source = asText(objective.fonte) ? [`Fonte: ${asText(objective.fonte)}`] : [];
  const link = asText(objective.vinculo) ? [`Vínculo: ${asText(objective.vinculo)}`] : [];
  const kpiLinks = asArray<any>(objective.vinculos_kpi).map((item) =>
    [asText(item.nome), asText(item.justificativa)].filter(Boolean).join(" — ")
  ).filter(Boolean);
  const kpis = kpiLinks.length ? [`KPIs vinculados: ${kpiLinks.join("; ")}`] : [];
  const strategies = asArray<string>(objective.estrategias).length ? [`Estratégias: ${asArray<string>(objective.estrategias).join("; ")}`] : [];
  const deliverables = asArray<string>(objective.entregas).length ? [`Entregas: ${asArray<string>(objective.entregas).join("; ")}`] : [];
  const actions = asArray<any>(objective.acoes).map(actionLine);
  const evidence = asText(objective.evidencia) ? [`Evidência: ${asText(objective.evidencia)}`] : [];
  const decision = asText(objective.decisao) ? [`Decisão: ${asText(objective.decisao)}`] : [];
  return [header, ...meta, ...result, ...source, ...link, ...kpis, ...strategies, ...deliverables, ...actions, ...evidence, ...decision].filter(Boolean).join("\n");
}

function strategicBlock(content: any) {
  const strategic = asRecord(content?.strategic);
  if (!Object.keys(strategic).length) return "";
  const drivers = asRecord(strategic.direcionadores);
  const swot = asRecord(strategic.swot);
  const lines = ["*Estrutura estratégica*"];
  if (asText(drivers.proposito)) lines.push(`Propósito: ${asText(drivers.proposito)}`);
  if (asText(drivers.visao)) lines.push(`Visão: ${asText(drivers.visao)}`);
  for (const [label, values] of [
    ["Valores", drivers.valores],
    ["Temas", strategic.temas],
    ["Forças", swot.forcas],
    ["Fraquezas", swot.fraquezas],
    ["Oportunidades", swot.oportunidades],
    ["Ameaças", swot.ameacas],
    ["Renúncias", strategic.renuncias],
    ["Riscos", strategic.riscos],
    ["Decisões pendentes", strategic.decisoes_pendentes],
    ["Aprendizados anteriores", strategic.aprendizados_historicos],
    ["Rituais", strategic.rituais],
  ] as Array<[string, unknown]>) {
    const items = asArray<string>(values).filter(Boolean);
    if (items.length) lines.push(`${label}: ${items.join("; ")}`);
  }
  const projects = asArray<any>(strategic.projetos);
  if (projects.length) {
    lines.push("Projetos prioritários:");
    lines.push(...projects.map((project) => {
      const details = [asText(project.responsavel) && `dono: ${asText(project.responsavel)}`, asText(project.prazo) && `prazo: ${asText(project.prazo)}`, asText(project.vinculo) && `vínculo: ${asText(project.vinculo)}`].filter(Boolean);
      return `- ${asText(project.nome, "Projeto")}${details.length ? ` (${details.join(" · ")})` : ""}`;
    }));
  }
  return lines.join("\n");
}

function quarterlyBlock(content: any) {
  const quarterly = asRecord(content?.quarterly);
  if (!Object.keys(quarterly).length) return "";
  const role = asRecord(quarterly.papel_area);
  const diagnosis = asRecord(quarterly.diagnostico);
  const alignment = asRecord(quarterly.alinhamento_anual);
  const lines = ["*Decisões do trimestre*"];
  if (asText(role.missao)) lines.push(`Papel da área: ${asText(role.missao)}`);
  if (asArray<string>(role.contribuicao).length) lines.push(`Contribuição: ${asArray<string>(role.contribuicao).join("; ")}`);
  if (asText(alignment.objetivo)) lines.push(`Alinhamento anual: ${asText(alignment.objetivo)}`);
  if (asText(alignment.justificativa)) lines.push(`Justificativa: ${asText(alignment.justificativa)}`);
  if (asArray<string>(diagnosis.forcas).length) lines.push(`Forças: ${asArray<string>(diagnosis.forcas).join("; ")}`);
  if (asArray<string>(diagnosis.gargalos).length) lines.push(`Gargalos: ${asArray<string>(diagnosis.gargalos).join("; ")}`);
  if (asArray<string>(quarterly.riscos).length) lines.push(`Riscos: ${asArray<string>(quarterly.riscos).join("; ")}`);
  if (asArray<string>(quarterly.trade_offs).length) lines.push(`Escolhas e renúncias: ${asArray<string>(quarterly.trade_offs).join("; ")}`);
  if (asText(quarterly.cadencia)) lines.push(`Acompanhamento: ${asText(quarterly.cadencia)}`);
  const sharedActions = asArray<any>(quarterly.acoes_transversais);
  if (sharedActions.length) lines.push("Ações transversais:", ...sharedActions.map(actionLine));
  return lines.join("\n");
}

function monthlyBlock(content: any) {
  const monthly = asRecord(content?.monthly);
  if (!Object.keys(monthly).length) return "";
  const alignment = asRecord(monthly.alinhamento_trimestral);
  const capacity = asRecord(monthly.capacidade);
  const lines = ["*Decisões do mês*"];
  if (asText(alignment.objetivo)) lines.push(`Alinhamento trimestral: ${asText(alignment.objetivo)}`);
  if (asText(alignment.justificativa)) lines.push(`Justificativa: ${asText(alignment.justificativa)}`);
  if (capacity.acoes_comprometidas !== undefined) lines.push(`Capacidade: ${capacity.acoes_comprometidas}/${capacity.maximo_acoes_comprometidas} ações comprometidas`);
  const pending = asArray<any>(monthly.decisoes_pendentes);
  if (pending.length) lines.push(`Pendências: ${pending.map((item) => [asText(item.item), asText(item.decisao)].filter(Boolean).join(" → ")).join("; ")}`);
  for (const [label, value] of [["Backlog", monthly.backlog], ["Riscos", monthly.riscos], ["Bloqueios", monthly.bloqueios]] as Array<[string, unknown]>) {
    const items = asArray<string>(value).filter(Boolean);
    if (items.length) lines.push(`${label}: ${items.join("; ")}`);
  }
  if (asText(monthly.cadencia)) lines.push(`Acompanhamento: ${asText(monthly.cadencia)}`);
  if (asText(monthly.confianca)) lines.push(`Confiança: ${asText(monthly.confianca)}`);
  if (asText(monthly.proximo_compromisso)) lines.push(`Próximo compromisso: ${asText(monthly.proximo_compromisso)}`);
  return lines.join("\n");
}

function strategicReviewBlock(content: any) {
  const adjustments = asArray<any>(content?.ajustes);
  if (!adjustments.length && !asText(content?.motivo_revisao)) return "";
  const lines = ["*Ajustes da revisão*"];
  if (asText(content?.motivo_revisao)) lines.push(`Motivo: ${asText(content.motivo_revisao)}`);
  lines.push(...adjustments.map((adjustment) => `- ${asText(adjustment.titulo, "Objetivo")}: ${asText(adjustment.campo)} de ${asText(adjustment.de)} para ${asText(adjustment.para)}${asText(adjustment.porque) ? `, porque ${asText(adjustment.porque)}` : ""}`));
  return lines.join("\n");
}

export function renderPlanForWhatsApp(content: any, document: { version?: unknown; origin?: unknown } = {}) {
  const title = [
    documentTypeLabel(content?.tipo),
    asText(content?.area).toUpperCase(),
    asText(content?.periodo).toUpperCase(),
  ].filter(Boolean).join(" · ");
  const traceability = asRecord(content?.rastreabilidade);
  const version = Number(document.version ?? 0);

  const header = [
    `*${title}*`,
    asText(content?.empresa) ? `Empresa: ${asText(content.empresa)}` : "",
    asText(content?.gestor) ? `Gestor: ${asText(content.gestor)}` : "",
    version > 0 ? `Versão ${version} · Origem: ${sourceLabel(traceability.origem || document.origin)}` : "",
  ].filter(Boolean);

  const context = asArray<string>(content?.contexto_rapido);
  if (context.length) {
    header.push("");
    header.push("*Contexto rápido*");
    header.push(...context.slice(0, 5).map((item) => `- ${item}`));
  }

  const blocks = [
    header.join("\n"),
    strategicBlock(content),
    quarterlyBlock(content),
    monthlyBlock(content),
    strategicReviewBlock(content),
  ];

  const objectives = asArray<any>(content?.objetivos);
  for (let index = 0; index < objectives.length; index += 2) {
    blocks.push(objectives.slice(index, index + 2).map(objectiveBlock).join("\n\n"));
  }

  const focus = asArray<string>(content?.foco_aprendizado);
  const closing: string[] = [];
  if (focus.length) {
    closing.push("*Foco de aprendizado*");
    closing.push(...focus.slice(0, 5).map((item) => `- ${item}`));
  }
  if (content?.fechamento) {
    const close = asRecord(content.fechamento);
    closing.push("*Fechamento*");
    if (asText(close.resumo)) closing.push(`Resumo: ${asText(close.resumo)}`);
    if (close.percentual !== null && close.percentual !== undefined) closing.push(`Conclusão: ${close.percentual}%`);
    for (const [label, value] of [["Aprendizados", close.aprendizados], ["Pendências", close.pendencias], ["Decisões", close.decisoes]] as Array<[string, unknown]>) {
      const items = asArray<string>(value).filter(Boolean);
      if (items.length) closing.push(`${label}: ${items.join("; ")}`);
    }
    const pulse = asRecord(close.pulso_gestao);
    if (asText(pulse.confianca)) closing.push(`Confiança: ${asText(pulse.confianca)}`);
    if (asText(pulse.motivo_confianca)) closing.push(`Motivo da confiança: ${asText(pulse.motivo_confianca)}`);
    if (asText(pulse.bloqueio)) closing.push(`Bloqueio: ${asText(pulse.bloqueio)}`);
    if (asText(pulse.decisao_necessaria)) closing.push(`Decisão necessária: ${asText(pulse.decisao_necessaria)}`);
    if (asText(pulse.proximo_compromisso)) closing.push(`Próximo compromisso: ${asText(pulse.proximo_compromisso)}`);
    if (asText(close.proximo_periodo)) closing.push(`Próximo período: ${asText(close.proximo_periodo)}`);
  }
  if (asText(content?.frase_de_foco)) {
    closing.push("");
    closing.push(`_${asText(content.frase_de_foco)}_`);
  }
  if (closing.length) blocks.push(closing.join("\n"));

  return blocks.filter((block) => block.trim()).join("\n\n---\n\n");
}
